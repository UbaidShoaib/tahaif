import type { Bucket, Piece } from "@/lib/buckets";

export const rose = { product_id: "rose", name: "Red Rose", image: null, role: "stem", price_pkr: 25000, max_qty: 3 };
export const wrap = { product_id: "wrap", name: "Kraft Wrap", image: null, role: "wrap", price_pkr: 0, max_qty: 1 };

export function piece(over: Partial<Piece> = {}): Piece {
  return {
    key: "k1", component_id: "rose", qty: 1, x: 0.5, y: 0.5, rotation: 0, z: 1,
    name: "Red Rose", image: null, unit_price_pkr: 25000, ...over,
  };
}

export function bucket(over: Partial<Bucket> = {}): Bucket {
  const pieces = over.pieces ?? [];
  return {
    id: "b1",
    builder: {
      product_id: "base", slug: "byo", name: "Build Your Own Bouquet", kind: "bouquet", image: null,
      base_price_pkr: 50000, min_items: 2, max_items: 5, components: [rose, wrap],
    },
    status: "draft",
    version: 0,
    pieces,
    item_count: pieces.reduce((n, p) => n + p.qty, 0),
    components_total_pkr: 0,
    total_pkr: 50000,
    share_token: null,
    ...over,
  };
}
