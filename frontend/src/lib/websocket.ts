"use client";

import { useEffect, useRef, useState, useCallback } from "react";

import { getWebSocketUrl } from "@/lib/backend-url";

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

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

type WsMessage =
  | { type: string; channels?: string[]; message?: string }
  | { channel: string; data: Record<string, unknown> };

function isWsMessage(msg: unknown): msg is WsMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return "type" in m || ("channel" in m && "data" in m);
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
  const reconnectAttemptsRef = useRef(0);
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

    const ws = new WebSocket(getWebSocketUrl());

    ws.onopen = () => {
      setConnected(true);
      reconnectAttemptsRef.current = 0;
      if (channelsRef.current.length > 0) {
        ws.send(JSON.stringify({ action: "subscribe", channels: channelsRef.current }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (!isWsMessage(msg)) {
          console.warn("Invalid WebSocket message:", msg);
          return;
        }
        setLastMessage(msg as Record<string, unknown>);
        if ("data" in msg && onMessageRef.current) {
          onMessageRef.current(msg.data as Record<string, unknown>);
        }
      } catch (error) {
        console.warn("Failed to parse WebSocket message:", error);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (autoReconnectRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(
          BASE_RECONNECT_DELAY * 2 ** reconnectAttemptsRef.current,
          MAX_RECONNECT_DELAY,
        );
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(() => connectFnRef.current?.(), delay);
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
      // Send unsubscribe before closing
      if (wsRef.current?.readyState === WebSocket.OPEN && channelsRef.current.length > 0) {
        try {
          wsRef.current.send(
            JSON.stringify({ action: "unsubscribe", channels: channelsRef.current }),
          );
        } catch {
          // Ignore send errors during cleanup
        }
      }
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
