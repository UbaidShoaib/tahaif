"use client";

import { create } from "zustand";
import type { Bucket, BucketEdit, Editor, ServerMessage } from "@/lib/buckets";

export type Connection = "connecting" | "live" | "offline";

interface BucketState {
  bucket: Bucket | null;
  /** Edits sent but not yet acknowledged, by client_op_id. */
  pending: Map<string, BucketEdit>;
  editors: Editor[];
  cursors: Record<string, { x: number; y: number }>;
  you: string | null;
  connection: Connection;
  /** Last edit the server refused, for a toast. */
  lastReject: { id: string; detail: string } | null;
  setConnection: (c: Connection) => void;
  setBucket: (b: Bucket) => void;
  track: (opId: string, edit: BucketEdit) => void;
  receive: (msg: ServerMessage) => void;
  reset: () => void;
}

const initial = {
  bucket: null,
  pending: new Map<string, BucketEdit>(),
  editors: [],
  cursors: {},
  you: null,
  connection: "connecting" as Connection,
  lastReject: null,
};

function without(pending: Map<string, BucketEdit>, opId: string): Map<string, BucketEdit> {
  const next = new Map(pending);
  next.delete(opId);
  return next;
}

export const useBucketStore = create<BucketState>((set, get) => ({
  ...initial,

  setConnection: (connection) => set({ connection }),
  setBucket: (bucket) => set({ bucket }),
  track: (opId, edit) => set({ pending: new Map(get().pending).set(opId, edit) }),

  receive: (msg) => {
    const { bucket } = get();
    switch (msg.type) {
      case "snapshot":
        // A (re)connect: anything still pending was lost with the old socket.
        set({ bucket: msg.bucket, you: msg.you, pending: new Map() });
        break;
      case "bucket":
        // Out-of-order delivery can't go backwards: versions only grow.
        if (!bucket || msg.bucket.version >= bucket.version) set({ bucket: msg.bucket });
        break;
      case "ack":
        set({ pending: without(get().pending, msg.client_op_id) });
        break;
      case "reject":
        set({
          pending: without(get().pending, msg.client_op_id),
          lastReject: { id: msg.client_op_id, detail: msg.detail },
          ...(msg.bucket ? { bucket: msg.bucket } : {}),
        });
        break;
      case "presence": {
        const ids = new Set(msg.editors.map((e) => e.id));
        const cursors = Object.fromEntries(Object.entries(get().cursors).filter(([id]) => ids.has(id)));
        set({ editors: msg.editors, cursors });
        break;
      }
      case "cursor":
        set({ cursors: { ...get().cursors, [msg.by]: { x: msg.x, y: msg.y } } });
        break;
      case "pong":
        break;
    }
  },

  reset: () => set({ ...initial, pending: new Map() }),
}));
