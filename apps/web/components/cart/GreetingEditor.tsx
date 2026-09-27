"use client";

import { useState } from "react";
import { MessageSquareHeart } from "lucide-react";
import { useCartStore } from "@/stores/cart.store";
import { type CartItemRead } from "@/lib/cart";
import { GreetingComposer } from "@/components/greeting/GreetingComposer";

/** Shows and edits the greeting card that ships with one cart line. */
export function GreetingEditor({ item }: { item: CartItemRead }) {
  const updateItem = useCartStore((s) => s.updateItem);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.greeting_message ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = `greeting-${item.id}`;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // A blank message removes the card (the API stores it as no message).
      await updateItem(item.id, { qty: item.qty, greeting_message: draft.trim() });
      setEditing(false);
    } catch {
      setError("Could not save your message. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-start gap-2 pb-3 text-sm">
        <MessageSquareHeart className="mt-0.5 h-4 w-4 shrink-0 text-link" aria-hidden />
        {item.greeting_message ? (
          <p dir="auto" className="flex-1 italic text-muted-foreground">“{item.greeting_message}”</p>
        ) : (
          <p className="flex-1 text-muted-foreground">No greeting card</p>
        )}
        <button
          type="button"
          onClick={() => { setDraft(item.greeting_message ?? ""); setEditing(true); }}
          className="text-link hover:underline"
        >
          {item.greeting_message ? "Edit message" : "Add a message"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 pb-3">
      <GreetingComposer id={fieldId} value={draft} onChange={setDraft} hint="Leave empty to send no card." />
      <div className="flex items-center justify-end text-xs text-muted-foreground">
        <div className="flex gap-3">
          <button type="button" onClick={() => setEditing(false)} className="hover:underline">Cancel</button>
          <button
            type="button"
            disabled={saving}
            onClick={() => { void save(); }}
            className="font-medium text-link hover:underline disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save message"}
          </button>
        </div>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
