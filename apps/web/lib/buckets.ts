/**
 * Build-your-own hampers and bouquets, edited live by everyone with the link (ADR 0014).
 * REST loads and checks out a bucket; edits go over the WebSocket.
 */
import { z } from "zod";
import { apiFetch } from "@/lib/api";
import type { CartRead } from "@/lib/cart";
import { guestCartHeaders } from "@/lib/guest-cart";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export const builderComponentSchema = z.object({
  product_id: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  role: z.string(),
  price_pkr: z.number().int(),
  max_qty: z.number().int(),
});

export const builderSchema = z.object({
  product_id: z.string(),
  slug: z.string(),
  name: z.string(),
  kind: z.enum(["hamper", "bouquet"]),
  image: z.string().nullable(),
  base_price_pkr: z.number().int(),
  min_items: z.number().int(),
  max_items: z.number().int().nullable(),
  components: z.array(builderComponentSchema),
});

export const pieceSchema = z.object({
  key: z.string(),
  component_id: z.string(),
  qty: z.number().int(),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  z: z.number().int(),
  name: z.string(),
  image: z.string().nullable(),
  unit_price_pkr: z.number().int(),
});

export const bucketSchema = z.object({
  id: z.string(),
  builder: builderSchema,
  status: z.enum(["draft", "in_cart", "ordered"]),
  version: z.number().int(),
  pieces: z.array(pieceSchema),
  item_count: z.number().int(),
  components_total_pkr: z.number().int(),
  total_pkr: z.number().int(),
  share_token: z.string().nullable().optional(),
});

export type BuilderComponent = z.infer<typeof builderComponentSchema>;
export type Builder = z.infer<typeof builderSchema>;
export type Piece = z.infer<typeof pieceSchema>;
export type Bucket = z.infer<typeof bucketSchema>;

export type BucketEdit =
  | { op: "add"; component_id: string; qty?: number; x?: number; y?: number }
  | { op: "move"; key: string; x: number; y: number; rotation?: number; z?: number }
  | { op: "set_qty"; key: string; qty: number }
  | { op: "remove"; key: string }
  | { op: "clear" };

const editorSchema = z.object({ id: z.string(), name: z.string(), color: z.string() });
export type Editor = z.infer<typeof editorSchema>;

/** Everything the server can send over the bucket socket. */
export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("snapshot"), you: z.string(), bucket: bucketSchema }),
  z.object({ type: z.literal("bucket"), by: z.string(), client_op_id: z.string(), bucket: bucketSchema }),
  z.object({ type: z.literal("ack"), client_op_id: z.string(), version: z.number().int() }),
  z.object({
    type: z.literal("reject"),
    client_op_id: z.string(),
    detail: z.string(),
    bucket: bucketSchema.optional(),
  }),
  z.object({ type: z.literal("presence"), editors: z.array(editorSchema) }),
  z.object({ type: z.literal("cursor"), by: z.string(), x: z.number(), y: z.number() }),
  z.object({ type: z.literal("pong") }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

export type BuilderSummary = { slug: string; name: string; kind: "hamper" | "bouquet"; image: string | null; base_price_pkr: number };

export const bucketsApi = {
  /** Live builders with items, for the home page. */
  list: () => apiFetch<BuilderSummary[]>("/builders"),

  builder: (slug: string) => apiFetch<unknown>(`/builders/${encodeURIComponent(slug)}`).then((b) => builderSchema.parse(b)),

  create: (builderSlug: string, token?: string | null) =>
    apiFetch<unknown>("/buckets", {
      method: "POST",
      body: { builder_slug: builderSlug },
      token: token ?? undefined,
    }).then((b) => bucketSchema.parse(b)),

  get: (id: string, shareToken: string) =>
    apiFetch<unknown>(`/buckets/${id}?t=${encodeURIComponent(shareToken)}`).then((b) => bucketSchema.parse(b)),

  addToCart: (id: string, shareToken: string, token?: string | null) =>
    apiFetch<CartRead>(`/buckets/${id}/cart?t=${encodeURIComponent(shareToken)}`, {
      method: "POST",
      token: token ?? undefined,
      headers: guestCartHeaders(),
    }),
};

export function bucketSocketUrl(id: string, shareToken: string, name: string): string {
  const base = API_BASE.replace(/^http/, "ws");
  return `${base}/buckets/${id}/ws?t=${encodeURIComponent(shareToken)}&name=${encodeURIComponent(name)}`;
}

/** The link to send family: the page plus the edit secret. */
export function bucketShareUrl(origin: string, id: string, shareToken: string): string {
  return `${origin}/build/b/${id}?t=${encodeURIComponent(shareToken)}`;
}

// ── Local state (pure, so it can be tested without a socket) ─────────────────

/**
 * Pieces as this browser should show them: the server's latest bucket with this
 * browser's not-yet-acknowledged moves laid on top, so a drag doesn't snap back
 * while the round trip is in flight. Adds and removes wait for the server.
 */
export function visiblePieces(server: Piece[], pending: Map<string, BucketEdit>): Piece[] {
  const moves = new Map<string, Extract<BucketEdit, { op: "move" }>>();
  for (const edit of pending.values()) if (edit.op === "move") moves.set(edit.key, edit);
  return server.map((p) => {
    const m = moves.get(p.key);
    return m ? { ...p, x: m.x, y: m.y, rotation: m.rotation ?? p.rotation, z: m.z ?? p.z } : p;
  });
}

/** How many more of this component can go in, given both its own and the bucket's limit. */
export function remainingFor(bucket: Bucket, component: BuilderComponent): number {
  const ofThis = bucket.pieces.filter((p) => p.component_id === component.product_id).reduce((n, p) => n + p.qty, 0);
  const own = component.max_qty - ofThis;
  const max = bucket.builder.max_items;
  return Math.max(0, max === null ? own : Math.min(own, max - bucket.item_count));
}

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
