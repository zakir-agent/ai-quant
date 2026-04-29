"""Alert notification service — Telegram Bot + generic Webhook with cooldown."""

import logging
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from app.database import async_session
from app.models.telegram_message_log import TelegramMessageLog

logger = logging.getLogger(__name__)

_MAX_TITLE_LEN = 4096
_MAX_MESSAGE_LEN = 16000
_MAX_ERROR_LEN = 4000


def _mask_chat_id(chat_id: str | None) -> str:
    if not chat_id:
        return ""
    sign = "-" if chat_id.startswith("-") else ""
    digits = chat_id[1:] if sign else chat_id
    if len(digits) <= 4:
        return f"{sign}***{digits}"
    return f"{sign}***{digits[-4:]}"


async def _persist_telegram_log(
    *,
    event_type: str,
    title: str,
    message: str,
    status: str,
    chat_id_masked: str,
    telegram_message_id: int | None,
    error_text: str | None,
) -> None:
    row = TelegramMessageLog(
        event_type=event_type[:128],
        title=title[:_MAX_TITLE_LEN],
        message_body=message[:_MAX_MESSAGE_LEN],
        status=status,
        chat_id_masked=chat_id_masked[:64],
        telegram_message_id=telegram_message_id,
        error_text=error_text[:_MAX_ERROR_LEN] if error_text else None,
    )
    try:
        async with async_session() as session:
            session.add(row)
            await session.commit()
    except SQLAlchemyError:
        logger.exception("Failed to persist Telegram message audit row")


# Per-event-type cooldown tracking
_cooldowns: dict[str, datetime] = {}


async def notify(
    event_type: str, title: str, message: str, *, ignore_cooldown: bool = False
) -> bool:
    """Send an alert notification if not in cooldown.

    Args:
        event_type: Unique key for cooldown grouping (e.g. "collector_cex_down").
        title: Short alert title.
        message: Alert body text.

    Returns:
        True if notification was sent, False if skipped (disabled/cooldown/error).
    """
    settings = get_settings()

    if not settings.alert_enabled:
        return False

    # Check cooldown (optionally bypassed for manual test notifications)
    now = datetime.now(UTC)
    if not ignore_cooldown:
        last_sent = _cooldowns.get(event_type)
        if last_sent and (now - last_sent) < timedelta(
            minutes=settings.alert_cooldown_minutes
        ):
            logger.debug("Alert '%s' in cooldown, skipping", event_type)
            return False

    sent = False

    # Telegram
    if settings.telegram_bot_token and settings.telegram_chat_id:
        try:
            await _send_telegram(
                settings.telegram_bot_token,
                settings.telegram_chat_id,
                event_type,
                title,
                message,
            )
            sent = True
        except Exception:
            logger.exception("Failed to send Telegram alert")

    # Webhook
    if settings.alert_webhook_url:
        try:
            await _send_webhook(settings.alert_webhook_url, event_type, title, message)
            sent = True
        except Exception:
            logger.exception("Failed to send Webhook alert")

    if sent:
        _cooldowns[event_type] = now
        logger.info("Alert sent [%s]: %s", event_type, title)
    elif not settings.telegram_bot_token and not settings.alert_webhook_url:
        # No channels configured, just log
        logger.info(
            "Alert (no channel configured) [%s]: %s — %s", event_type, title, message
        )

    return sent


async def _send_telegram(
    token: str, chat_id: str, event_type: str, title: str, message: str
) -> None:
    """Send a message via Telegram Bot API and write an audit row."""
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    text = f"*{_escape_md(title)}*\n\n{_escape_md(message)}"
    masked = _mask_chat_id(chat_id)
    outcome_logged = False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                url,
                json={
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": "MarkdownV2",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            if not data.get("ok"):
                err = str(data.get("description", data))[:_MAX_ERROR_LEN]
                await _persist_telegram_log(
                    event_type=event_type,
                    title=title,
                    message=message,
                    status="failed",
                    chat_id_masked=masked,
                    telegram_message_id=None,
                    error_text=err,
                )
                outcome_logged = True
                raise RuntimeError(err)
            mid = data.get("result", {}).get("message_id")
            tid = int(mid) if mid is not None else None
            await _persist_telegram_log(
                event_type=event_type,
                title=title,
                message=message,
                status="sent",
                chat_id_masked=masked,
                telegram_message_id=tid,
                error_text=None,
            )
            outcome_logged = True
    except Exception as e:
        if not outcome_logged:
            await _persist_telegram_log(
                event_type=event_type,
                title=title,
                message=message,
                status="failed",
                chat_id_masked=masked,
                telegram_message_id=None,
                error_text=str(e)[:_MAX_ERROR_LEN],
            )
        raise


async def _send_webhook(url: str, event_type: str, title: str, message: str) -> None:
    """Send a JSON payload to a generic webhook URL."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            url,
            json={
                "event_type": event_type,
                "title": title,
                "message": message,
                "timestamp": datetime.now(UTC).isoformat(),
            },
        )
        resp.raise_for_status()


def _escape_md(text: str) -> str:
    """Escape special characters for Telegram MarkdownV2."""
    # Escape backslash first to avoid double-escaping
    text = text.replace("\\", "\\\\")
    special = r"_*[]()~`>#+-=|{}.!"
    for ch in special:
        text = text.replace(ch, f"\\{ch}")
    return text
