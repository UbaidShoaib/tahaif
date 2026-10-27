"use client";

import { useCallback, useEffect, useRef } from "react";
import { bucketSocketUrl, serverMessageSchema, type BucketEdit } from "@/lib/buckets";
import { useBucketStore } from "@/stores/bucket.store";

const PING_MS = 15_000;
const CURSOR_MS = 80;

/**
 * Keeps one live connection to a shared bucket: reconnects with backoff, pings so
 * presence stays fresh, and feeds every server message to the bucket store.
 */
export function useBucketSocket(bucketId: string, shareToken: string, name: string) {
  const socket = useRef<WebSocket | null>(null);
  const lastCursor = useRef(0);

  useEffect(() => {
    const store = useBucketStore.getState();
    let closed = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;

    const connect = () => {
      store.setConnection("connecting");
      const ws = new WebSocket(bucketSocketUrl(bucketId, shareToken, name));
      socket.current = ws;

      // A socket from an earlier mount (React strict mode, a reconnect) can still
      // fire events; only the current one may touch shared state.
      const current = () => !closed && socket.current === ws;

      ws.onopen = () => {
        if (!current()) return;
        attempt = 0;
        store.setConnection("live");
        ping = setInterval(() => ws.send(JSON.stringify({ type: "ping" })), PING_MS);
      };
      ws.onmessage = (event: MessageEvent<string>) => {
        if (!current()) return;
        const parsed = serverMessageSchema.safeParse(JSON.parse(event.data));
        if (parsed.success) useBucketStore.getState().receive(parsed.data);
      };
      ws.onclose = (event) => {
        if (!current()) return;
        clearInterval(ping);
        socket.current = null;
        store.setConnection("offline");
        // 4404: wrong link or expired bucket; 4429: too many editors. Retrying won't help.
        if (event.code === 4404 || event.code === 4429) return;
        attempt += 1;
        retry = setTimeout(connect, Math.min(10_000, 500 * 2 ** attempt));
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(ping);
      socket.current?.close();
      useBucketStore.getState().reset();
    };
  }, [bucketId, shareToken, name]);

  /** Send an edit; false when offline (the caller should tell the person). */
  const send = useCallback((edit: BucketEdit): boolean => {
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    const opId = crypto.randomUUID();
    useBucketStore.getState().track(opId, edit);
    ws.send(JSON.stringify({ type: "edit", client_op_id: opId, edit }));
    return true;
  }, []);

  const sendCursor = useCallback((x: number, y: number) => {
    const now = Date.now();
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || now - lastCursor.current < CURSOR_MS) return;
    lastCursor.current = now;
    ws.send(JSON.stringify({ type: "cursor", x, y }));
  }, []);

  return { send, sendCursor };
}
