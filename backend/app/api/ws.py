"""WebSocket endpoint for real-time market data streaming."""

import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.ws_manager import manager

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """WebSocket endpoint for real-time data.

    Clients send JSON messages to subscribe/unsubscribe:
        {"action": "subscribe", "channels": ["kline:BTC/USDT:1h", "ticker:BTC/USDT"]}
        {"action": "unsubscribe", "channels": ["kline:BTC/USDT:1h"]}

    Server pushes data as:
        {"channel": "kline:BTC/USDT:1h", "data": {"type": "kline", ...}}
        {"channel": "ticker:BTC/USDT", "data": {"type": "ticker", ...}}
    """
    await manager.connect(ws)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
                action = msg.get("action", "")
                channels = msg.get("channels", [])

                if action == "subscribe":
                    for ch in channels:
                        await manager.subscribe(ws, ch)
                    await ws.send_text(
                        json.dumps({"type": "subscribed", "channels": channels})
                    )
                elif action == "unsubscribe":
                    for ch in channels:
                        await manager.unsubscribe(ws, ch)
                    await ws.send_text(
                        json.dumps({"type": "unsubscribed", "channels": channels})
                    )
                elif action == "ping":
                    await ws.send_text(json.dumps({"type": "pong"}))
            except json.JSONDecodeError:
                await ws.send_text(
                    json.dumps({"type": "error", "message": "Invalid JSON"})
                )
    except WebSocketDisconnect:
        await manager.disconnect(ws)
