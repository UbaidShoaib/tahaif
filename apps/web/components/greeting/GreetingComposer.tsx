"use client";

import { useState } from "react";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { CardPreview } from "@/components/greeting/CardPreview";
import { GREETING_MAX } from "@/lib/cart";
import { CARD_LANGUAGES, GREETING_TEMPLATES, type CardLanguage } from "@/lib/greeting-templates";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
};

/**
 * The greeting card message: optional starter templates in English, Urdu or
 * Roman Urdu, the message field, and a live preview of the printed card.
 */
export function GreetingComposer({ id, value, onChange, hint = "Optional. Printed on a card delivered with this gift." }: Props) {
  const [showTemplates, setShowTemplates] = useState(false);
  const [lang, setLang] = useState<CardLanguage>("en");

  return (
    <div className="space-y-3">
      <FormField
        label="Greeting card message"
        hint={
          <span className="flex justify-between gap-2">
            <span>{hint}</span>
            <span className="tabular-nums">
              {value.length}/{GREETING_MAX}
            </span>
          </span>
        }
        id={id}
      >
        {(p) => (
          <Textarea
            {...p}
            dir="auto"
            value={value}
            maxLength={GREETING_MAX}
            rows={3}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Happy birthday, Ammi! Wish I could be there. Love, Ali"
          />
        )}
      </FormField>

      <button
        type="button"
        aria-expanded={showTemplates}
        aria-controls={`${id}-templates`}
        onClick={() => setShowTemplates((v) => !v)}
        className="text-sm font-medium text-link hover:underline"
      >
        {showTemplates ? "Hide message ideas" : "Need words? Use a message idea"}
      </button>

      {showTemplates && (
        <div id={`${id}-templates`} className="space-y-2 rounded-lg border p-3">
          <div role="group" aria-label="Card language" className="flex flex-wrap gap-2">
            {CARD_LANGUAGES.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={lang === l.id}
                onClick={() => setLang(l.id)}
                className={`min-h-9 rounded-full border px-3 text-sm ${
                  lang === l.id ? "border-primary-700 bg-primary-soft font-medium" : "hover:bg-muted"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <ul className="flex flex-wrap gap-2">
            {GREETING_TEMPLATES.map((t) => (
              <li key={t.occasion}>
                <button
                  type="button"
                  onClick={() => onChange(t.text[lang].slice(0, GREETING_MAX))}
                  className="min-h-9 rounded-lg border px-3 text-sm hover:bg-muted"
                >
                  {t.occasion}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Picking one replaces your message; you can edit it after.</p>
        </div>
      )}

      <CardPreview message={value} compact />
    </div>
  );
}
