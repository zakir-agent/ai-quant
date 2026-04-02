"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";

type MessageHandler = (data: Record<string, unknown>) => void;

interface UseWebSocketOptions {
  channels?: string[];
  onMessage?: MessageHandler;
  autoReconnect?: boolean;
}

interface UseWebSocketReturn {
  connected: boolean;
  subscribe: (channels: string[]) => void;
  unsubscribe: (channels: string[]) => void;
  lastMessage: Record<string, unknown> | null;
}

export function useWebSocket({
  channels = [],
  onMessage,
  autoReconnect = true,
}: UseWebSocketOptions = {}): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<Record<string, unknown> | null>(null);
  const channelsRef = useRef(channels);
  const onMessageRef = useRef(onMessage);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const autoReconnectRef = useRef(autoReconnect);
  const connectFnRef = useRef<(() => void) | undefined>(undefined);

  // Keep refs synced via effects
  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);
  useEffect(() => {
    autoReconnectRef.current = autoReconnect;
  }, [autoReconnect]);

  const doConnect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      setConnected(true);
      if (channelsRef.current.length > 0) {
        ws.send(JSON.stringify({ action: "subscribe", channels: channelsRef.current }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        setLastMessage(msg);
        if (msg.data && onMessageRef.current) {
          onMessageRef.current(msg.data);
        }
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (autoReconnectRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => connectFnRef.current?.(), 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, []);

  // Store connect fn in ref for self-referencing reconnect
  useEffect(() => {
    connectFnRef.current = doConnect;
  }, [doConnect]);

  const subscribe = useCallback((chs: string[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "subscribe", channels: chs }));
    }
  }, []);

  const unsubscribe = useCallback((chs: string[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "unsubscribe", channels: chs }));
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    doConnect();
    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      autoReconnectRef.current = false;
      wsRef.current?.close();
    };
  }, [doConnect]);

  // Re-subscribe when channels change
  const channelsKey = channels.join(",");
  useEffect(() => {
    if (connected && channels.length > 0) {
      subscribe(channels);
    }
  }, [connected, channelsKey, subscribe, channels]);

  return { connected, subscribe, unsubscribe, lastMessage };
}
