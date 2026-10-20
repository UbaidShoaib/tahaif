"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { MessageCircle, ShoppingBag, Wifi, WifiOff } from "lucide-react";
import { useBucketSocket } from "@/hooks/useBucketSocket";
import { bucketsApi, bucketShareUrl, clamp01, visiblePieces, type BucketEdit } from "@/lib/buckets";
import { ApiError } from "@/lib/api";
import { syncGuestCartToken } from "@/lib/guest-cart";
import { useAuthStore } from "@/stores/auth.store";
import { useBucketStore } from "@/stores/bucket.store";
import { useCartStore } from "@/stores/cart.store";
import { Price } from "@/components/money/Price";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { toast } from "@/components/ui/toast";
import { BucketCanvas, CANVAS_ID } from "./BucketCanvas";
import { ComponentPalette } from "./ComponentPalette";
import { PieceImage } from "./PieceImage";

export function BucketBuilder({ bucketId, shareToken }: { bucketId: string; shareToken: string }) {
  const router = useRouter();
  const { user, accessToken } = useAuthStore();
  const name = user?.full_name?.split(" ")[0] || "Guest";
  const { send, sendCursor } = useBucketSocket(bucketId, shareToken, name);
  const { bucket, pending, editors, cursors, you, connection, lastReject } = useBucketStore();
  const [dragImage, setDragImage] = useState<string | null | undefined>(undefined);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (lastReject) toast({ title: "Couldn't make that change", description: lastReject.detail, variant: "error" });
  }, [lastReject]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const pieces = useMemo(() => (bucket ? visiblePieces(bucket.pieces, pending) : []), [bucket, pending]);

  if (!bucket) {
    return <p className="py-16 text-center text-muted-foreground" aria-live="polite">Opening your bucket…</p>;
  }

  const locked = bucket.status !== "draft";
  const offline = connection !== "live";
  const kind = bucket.builder.kind;

  const edit = (e: BucketEdit) => {
    if (!send(e)) toast({ title: "You're offline", description: "Reconnecting — try again in a moment.", variant: "error" });
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    const data = active.data.current as { componentId?: string } | undefined;
    const component = bucket.builder.components.find((c) => c.product_id === data?.componentId);
    setDragImage(component ? component.image : undefined);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragImage(undefined);
    const rect = active.rect.current.translated;
    if (!over || over.id !== CANVAS_ID || !rect) return;
    const x = clamp01((rect.left + rect.width / 2 - over.rect.left) / over.rect.width);
    const y = clamp01((rect.top + rect.height / 2 - over.rect.top) / over.rect.height);
    const data = active.data.current as { componentId?: string; pieceKey?: string } | undefined;
    if (data?.componentId) edit({ op: "add", component_id: data.componentId, x, y });
    else if (data?.pieceKey) {
      const top = Math.max(0, ...pieces.map((p) => p.z));
      edit({ op: "move", key: data.pieceKey, x, y, z: top + 1 });
    }
  };

  const addAtRandom = (componentId: string) => {
    // Tap-to-add: scatter around the middle so pieces don't stack exactly.
    const jitter = () => clamp01(0.5 + (Math.random() - 0.5) * 0.5);
    edit({ op: "add", component_id: componentId, x: jitter(), y: jitter() });
  };

  const addToCart = async () => {
    setAdding(true);
    try {
      const cart = await bucketsApi.addToCart(bucketId, shareToken, accessToken);
      syncGuestCartToken(cart, !!accessToken);
      useCartStore.setState({ cart });
      toast({ title: "Added to your cart", action: { label: "View cart", onClick: () => router.push("/cart") } });
    } catch (err) {
      toast({
        title: "Couldn't add to cart",
        description: err instanceof ApiError ? err.detail : "Please try again.",
        variant: "error",
      });
    } finally {
      setAdding(false);
    }
  };

  const shareUrl = typeof window === "undefined" ? "" : bucketShareUrl(window.location.origin, bucketId, shareToken);
  const short = bucket.item_count < bucket.builder.min_items;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragImage(undefined)}>
      <div className="container mx-auto max-w-6xl px-4 py-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-h1">{bucket.builder.name}</h1>
            <p className="text-sm text-muted-foreground">
              Build it together: everyone with the link sees changes live.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ul aria-label="People editing" className="flex -space-x-2">
              {editors.map((e) => (
                <li
                  key={e.id}
                  title={e.id === you ? `${e.name} (you)` : e.name}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white ring-2 ring-background"
                  style={{ background: e.color }}
                >
                  {e.name.slice(0, 1).toUpperCase()}
                  <span className="sr-only">{e.id === you ? `${e.name} (you)` : e.name}</span>
                </li>
              ))}
            </ul>
            <span role="status" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {offline ? <WifiOff aria-hidden className="h-4 w-4" /> : <Wifi aria-hidden className="h-4 w-4" />}
              {connection === "live" ? "Live" : connection === "connecting" ? "Connecting…" : "Offline"}
            </span>
          </div>
        </header>

        {locked && (
          <p role="status" className="mb-4 rounded-lg border bg-muted p-3 text-sm">
            This bucket is in a cart, so it can&apos;t be changed any more.
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-4">
            <BucketCanvas
              kind={kind}
              pieces={pieces}
              editors={editors}
              cursors={cursors}
              you={you}
              disabled={locked || offline}
              onRemove={(key) => edit({ op: "remove", key })}
              onPointer={sendCursor}
            />

            {pieces.length > 0 && (
              <section aria-labelledby="contents-heading">
                <h2 id="contents-heading" className="mb-2 text-sm font-semibold">In your {kind}</h2>
                <ul className="divide-y rounded-lg border">
                  {pieces.map((p) => (
                    <li key={p.key} className="flex items-center gap-3 p-2">
                      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
                        <PieceImage src={p.image} sizes="40px" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                      <Price pkr={p.unit_price_pkr * p.qty} className="text-sm" />
                      {!locked && (
                        <QuantityStepper
                          value={p.qty}
                          itemName={p.name}
                          pending={offline}
                          onChange={(qty) => edit(qty === 0 ? { op: "remove", key: p.key } : { op: "set_qty", key: p.key, qty })}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border bg-card p-4 lg:sticky lg:top-4">
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt>{kind === "bouquet" ? "Wrap & base" : "Basket"}</dt><dd><Price pkr={bucket.builder.base_price_pkr} /></dd></div>
                <div className="flex justify-between"><dt>{bucket.item_count} items</dt><dd><Price pkr={bucket.components_total_pkr} /></dd></div>
                <div className="flex justify-between border-t pt-2 text-base font-semibold"><dt>Total</dt><dd aria-live="polite"><Price pkr={bucket.total_pkr} /></dd></div>
              </dl>
              {short && !locked && (
                <p className="mt-2 text-xs text-muted-foreground">Add at least {bucket.builder.min_items} items.</p>
              )}
              {!locked && (
                <Button className="mt-3 w-full" onClick={() => void addToCart()} loading={adding} disabled={short || offline}>
                  <ShoppingBag aria-hidden className="mr-2 h-4 w-4" /> Add to cart
                </Button>
              )}
              <div className="mt-3 flex gap-2">
                <CopyButton value={shareUrl} label="Copy link" className="flex-1" />
                <Button variant="outline" asChild className="flex-1">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`Help me build this gift: ${shareUrl}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle aria-hidden className="mr-2 h-4 w-4" /> WhatsApp
                  </a>
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Anyone with the link can edit this bucket.</p>
            </div>

            {!locked && (
              <ComponentPalette bucket={bucket} disabled={offline} onAdd={addAtRandom} />
            )}
          </aside>
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {dragImage !== undefined && (
          <span className="relative block h-14 w-14 overflow-hidden rounded-md bg-muted shadow-lg">
            <PieceImage src={dragImage} sizes="56px" />
          </span>
        )}
      </DragOverlay>
    </DndContext>
  );
}
