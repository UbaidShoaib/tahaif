import { describe, expect, it } from "vitest";
import { bucketShareUrl, bucketSocketUrl, remainingFor, serverMessageSchema, visiblePieces, type BucketEdit } from "@/lib/buckets";
import { bucket, piece, rose, wrap } from "@/test/bucket-fixtures";

describe("visiblePieces", () => {
  it("lays this browser's pending moves over the server state", () => {
    const pending = new Map<string, BucketEdit>([["op1", { op: "move", key: "k1", x: 0.1, y: 0.9, z: 7 }]]);
    const [p] = visiblePieces([piece()], pending);
    expect([p.x, p.y, p.z]).toEqual([0.1, 0.9, 7]);
  });

  it("leaves pieces alone when nothing is pending, and ignores pending adds", () => {
    const pending = new Map<string, BucketEdit>([["op1", { op: "add", component_id: "rose" }]]);
    expect(visiblePieces([piece()], pending)).toEqual([piece()]);
  });
});

describe("remainingFor", () => {
  it("is limited by the component's own max", () => {
    expect(remainingFor(bucket({ pieces: [piece({ qty: 2 })] }), rose)).toBe(1);
  });

  it("is limited by how much the bucket holds", () => {
    const full = bucket({ pieces: [piece({ qty: 3 }), piece({ key: "k2", component_id: "wrap", qty: 2 })] });
    expect(remainingFor(full, wrap)).toBe(0);
  });
});

describe("urls", () => {
  it("builds a ws url and a share link with the token encoded", () => {
    expect(bucketSocketUrl("b1", "a/b", "Sana")).toBe("ws://localhost:8000/api/v1/buckets/b1/ws?t=a%2Fb&name=Sana");
    expect(bucketShareUrl("https://tahaif.pk", "b1", "tok")).toBe("https://tahaif.pk/build/b/b1?t=tok");
  });
});

describe("serverMessageSchema", () => {
  it("accepts a bucket update and rejects unknown messages", () => {
    expect(serverMessageSchema.safeParse({ type: "bucket", by: "c1", client_op_id: "o", bucket: bucket() }).success).toBe(true);
    expect(serverMessageSchema.safeParse({ type: "hello" }).success).toBe(false);
  });
});
