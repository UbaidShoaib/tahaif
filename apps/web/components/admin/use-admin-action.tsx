"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";

export const errorText = (e: unknown) => (e instanceof ApiError ? e.detail : "Something went wrong. Try again.");

/**
 * One save at a time for a back-office screen: runs the call, reloads the list, and
 * keeps the success or error line. `run` resolves true when the save went through.
 */
export function useAdminAction(reload: () => Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function run(work: () => Promise<unknown>, done: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await work();
      await reload();
      setOk(done);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const fail = (text: string) => {
    setOk(null);
    setError(text);
  };

  return { busy, error, ok, run, fail, setError };
}

export function ActionNotices({ error, ok }: { error: string | null; ok: string | null }) {
  return (
    <>
      {error && <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {ok && <p role="status" className="text-sm text-success-foreground">{ok}</p>}
    </>
  );
}
