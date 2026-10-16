"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MessageLanguage } from "@/lib/social-orders";

const KEY = "admin-wa-lang";

/** Staff's chosen WhatsApp language, remembered on this device (a convenience only). */
export function useMessageLanguage(): [MessageLanguage, (lang: MessageLanguage) => void] {
  const [lang, setLang] = useState<MessageLanguage>("en");
  useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY) === "ur") setLang("ur");
    } catch {
      /* storage blocked: stay on English */
    }
  }, []);
  function choose(next: MessageLanguage) {
    setLang(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* not remembered, still applied */
    }
  }
  return [lang, choose];
}

export function MessageLanguageToggle({
  value,
  onChange,
}: {
  value: MessageLanguage;
  onChange: (lang: MessageLanguage) => void;
}) {
  return (
    <div role="group" aria-label="Message language" className="inline-flex gap-1">
      <Button type="button" size="sm" variant={value === "en" ? "default" : "outline"} aria-pressed={value === "en"} onClick={() => onChange("en")}>
        English
      </Button>
      <Button type="button" size="sm" variant={value === "ur" ? "default" : "outline"} aria-pressed={value === "ur"} onClick={() => onChange("ur")} lang="ur">
        اردو
      </Button>
    </div>
  );
}
