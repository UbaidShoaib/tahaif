"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";
import type { Editor, Piece } from "@/lib/buckets";
import { cn } from "@/lib/utils";
import { PieceImage } from "./PieceImage";

export const CANVAS_ID = "bucket-canvas";

function PlacedPiece({ piece, kind, disabled, onRemove }: {
  piece: Piece;
  kind: "hamper" | "bouquet";
  disabled: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `piece:${piece.key}`,
    data: { pieceKey: piece.key },
    disabled,
  });
  const size = kind === "bouquet" ? "h-14 w-14 rounded-full" : "h-20 w-20 rounded-lg";
  return (
    <div
      className="group absolute -translate-x-1/2 -translate-y-1/2"
      style={{
        left: `${piece.x * 100}%`,
        top: `${piece.y * 100}%`,
        zIndex: isDragging ? 1000 : piece.z,
        transform: `${CSS.Translate.toString(transform) ?? ""} rotate(${piece.rotation}deg)`,
      }}
    >
      <span
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        aria-label={`${piece.name}${piece.qty > 1 ? ` × ${piece.qty}` : ""}. Drag to move.`}
        className={cn(
          "relative block cursor-grab touch-none overflow-hidden border-2 border-background bg-muted shadow-md",
          size,
          isDragging && "cursor-grabbing ring-2 ring-primary",
        )}
      >
        <PieceImage src={piece.image} sizes="80px" />
        {piece.qty > 1 && (
          <span className="absolute bottom-0 right-0 rounded-tl bg-background/90 px-1 text-xs font-semibold tabular-nums">
            ×{piece.qty}
          </span>
        )}
      </span>
      {!disabled && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${piece.name}`}
          className="absolute -right-2 -top-2 hidden h-6 w-6 items-center justify-center rounded-full bg-foreground text-background group-hover:flex group-focus-within:flex"
        >
          <X aria-hidden className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export function BucketCanvas({
  kind,
  pieces,
  editors,
  cursors,
  you,
  disabled,
  onRemove,
  onPointer,
}: {
  kind: "hamper" | "bouquet";
  pieces: Piece[];
  editors: Editor[];
  cursors: Record<string, { x: number; y: number }>;
  you: string | null;
  disabled: boolean;
  onRemove: (key: string) => void;
  onPointer: (x: number, y: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: CANVAS_ID });
  return (
    <div
      ref={setNodeRef}
      role="region"
      aria-label={kind === "bouquet" ? "Your bouquet" : "Your hamper"}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onPointer((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      }}
      className={cn(
        "relative aspect-square w-full overflow-hidden rounded-2xl border-2 border-dashed bg-muted/40 transition-colors",
        kind === "hamper" && "bg-primary-soft/40",
        isOver && "border-primary bg-primary/5",
      )}
    >
      {pieces.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Drag items here, or tap + to add them
        </p>
      )}
      {pieces.map((p) => (
        <PlacedPiece key={p.key} piece={p} kind={kind} disabled={disabled} onRemove={() => onRemove(p.key)} />
      ))}
      {editors
        .filter((e) => e.id !== you && cursors[e.id])
        .map((e) => (
          <span
            key={e.id}
            aria-hidden
            className="pointer-events-none absolute z-[1001] flex items-center gap-1 text-xs font-medium"
            style={{ left: `${cursors[e.id].x * 100}%`, top: `${cursors[e.id].y * 100}%` }}
          >
            <span className="h-3 w-3 rounded-full ring-2 ring-background" style={{ background: e.color }} />
            <span className="rounded px-1 text-white" style={{ background: e.color }}>{e.name}</span>
          </span>
        ))}
    </div>
  );
}
