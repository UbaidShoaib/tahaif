"use client";

import { useDraggable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { Price } from "@/components/money/Price";
import { remainingFor, type Bucket, type BuilderComponent } from "@/lib/buckets";
import { cn } from "@/lib/utils";
import { PieceImage } from "./PieceImage";

const ROLE_LABELS: Record<string, string> = {
  stem: "Flowers",
  filler: "Fillers",
  wrap: "Wrapping",
  ribbon: "Ribbon",
  item: "Gifts",
};

function PaletteItem({
  component,
  left,
  disabled,
  onAdd,
}: {
  component: BuilderComponent;
  left: number;
  disabled: boolean;
  onAdd: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${component.product_id}`,
    data: { componentId: component.product_id },
    disabled: disabled || left === 0,
  });
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card p-2",
        isDragging && "opacity-50",
        left === 0 && "opacity-60",
      )}
    >
      <span
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        aria-label={`Drag ${component.name} into the bucket`}
        className="relative h-14 w-14 shrink-0 cursor-grab touch-none overflow-hidden rounded-md bg-muted active:cursor-grabbing"
      >
        <PieceImage src={component.image} sizes="56px" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{component.name}</span>
        <Price pkr={component.price_pkr} className="text-xs text-muted-foreground" />
      </span>
      {/* Tap-to-add: the main way in on phones, and the keyboard path everywhere. */}
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled || left === 0}
        aria-label={`Add ${component.name}`}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus aria-hidden className="h-4 w-4" />
      </button>
    </li>
  );
}

export function ComponentPalette({
  bucket,
  disabled,
  onAdd,
}: {
  bucket: Bucket;
  disabled: boolean;
  onAdd: (componentId: string) => void;
}) {
  const roles = [...new Set(bucket.builder.components.map((c) => c.role))];
  return (
    <div className="space-y-4">
      {roles.map((role) => (
        <section key={role} aria-labelledby={`role-${role}`}>
          <h2 id={`role-${role}`} className="mb-2 text-sm font-semibold text-muted-foreground">
            {ROLE_LABELS[role] ?? role}
          </h2>
          <ul className="space-y-2">
            {bucket.builder.components
              .filter((c) => c.role === role)
              .map((c) => (
                <PaletteItem
                  key={c.product_id}
                  component={c}
                  left={remainingFor(bucket, c)}
                  disabled={disabled}
                  onAdd={() => onAdd(c.product_id)}
                />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
