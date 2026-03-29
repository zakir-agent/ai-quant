"""Alert notification service — Telegram Bot + generic Webhook with cooldown."""

import logging
from datetime import UTC, datetime, timedelta

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

# Per-event-type cooldown tracking
_cooldowns: dict[str, datetime] = {}


async def notify(event_type: str, title: str, message: str) -> bool:
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

    # Check cooldown
    now = datetime.now(UTC)
    last_sent = _cooldowns.get(event_type)
    if last_sent and (now - last_sent) < timedelta(minutes=settings.alert_cooldown_minutes):
        logger.debug("Alert '%s' in cooldown, skipping", event_type)
        return False

    sent = False

    # Telegram
    if settings.telegram_bot_token and settings.telegram_chat_id:
        try:
            await _send_telegram(settings.telegram_bot_token, settings.telegram_chat_id, title, message)
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
        logger.info("Alert (no channel configured) [%s]: %s — %s", event_type, title, message)

    return sent


async def _send_telegram(token: str, chat_id: str, title: str, message: str) -> None:
    """Send a message via Telegram Bot API."""
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    text = f"*{_escape_md(title)}*\n\n{_escape_md(message)}"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(url, json={
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "MarkdownV2",
        })
        resp.raise_for_status()


async def _send_webhook(url: str, event_type: str, title: str, message: str) -> None:
    """Send a JSON payload to a generic webhook URL."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(url, json={
            "event_type": event_type,
            "title": title,
            "message": message,
            "timestamp": datetime.now(UTC).isoformat(),
        })
        resp.raise_for_status()


def _escape_md(text: str) -> str:
    """Escape special characters for Telegram MarkdownV2."""
    # Escape backslash first to avoid double-escaping
    text = text.replace("\\", "\\\\")
    special = r"_*[]()~`>#+-=|{}.!"
    for ch in special:
        text = text.replace(ch, f"\\{ch}")
    return text
