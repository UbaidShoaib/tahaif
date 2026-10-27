import { beforeEach, describe, expect, it } from "vitest";
import { useBucketStore } from "@/stores/bucket.store";
import { bucket, piece } from "@/test/bucket-fixtures";

const s = () => useBucketStore.getState();

describe("bucket store", () => {
  beforeEach(() => s().reset());

  it("takes the snapshot and clears pending edits on (re)connect", () => {
    s().track("op1", { op: "clear" });
    s().receive({ type: "snapshot", you: "me", bucket: bucket({ version: 3 }) });
    expect(s().you).toBe("me");
    expect(s().bucket?.version).toBe(3);
    expect(s().pending.size).toBe(0);
  });

  it("never goes back to an older version", () => {
    s().receive({ type: "snapshot", you: "me", bucket: bucket({ version: 5 }) });
    s().receive({ type: "bucket", by: "x", client_op_id: "o", bucket: bucket({ version: 4, pieces: [piece()] }) });
    expect(s().bucket?.pieces).toEqual([]);
    s().receive({ type: "bucket", by: "x", client_op_id: "o", bucket: bucket({ version: 6, pieces: [piece()] }) });
    expect(s().bucket?.pieces).toHaveLength(1);
  });

  it("drops an edit from pending on ack, and on reject takes the fresh state", () => {
    s().receive({ type: "snapshot", you: "me", bucket: bucket() });
    s().track("a", { op: "move", key: "k1", x: 0, y: 0 });
    s().track("b", { op: "remove", key: "k1" });
    s().receive({ type: "ack", client_op_id: "a", version: 1 });
    expect([...s().pending.keys()]).toEqual(["b"]);
    s().receive({ type: "reject", client_op_id: "b", detail: "Gone", bucket: bucket({ version: 2 }) });
    expect(s().pending.size).toBe(0);
    expect(s().lastReject?.detail).toBe("Gone");
    expect(s().bucket?.version).toBe(2);
  });

  it("forgets cursors of people who left", () => {
    s().receive({ type: "cursor", by: "c2", x: 0.1, y: 0.2 });
    s().receive({ type: "presence", editors: [{ id: "me", name: "Me", color: "#000" }] });
    expect(s().cursors).toEqual({});
  });
});
