"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore, type UserRead } from "@/stores/auth.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

const RESEND_SECONDS = 60;

/** Only same-site paths, so ?next= can't bounce the buyer to another domain. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function VerifyEmailForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const { user, accessToken, isLoading, setSession } = useAuthStore();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (user?.is_verified) router.replace(next);
  }, [user, next, router]);

  if (!isLoading && !user) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        <Link href={`/login?callbackUrl=${encodeURIComponent("/verify-email")}`} className="text-link font-medium hover:underline">
          Sign in
        </Link>{" "}
        to verify your email.
      </p>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const verified = await apiFetch<UserRead>("/auth/verify-email", {
        method: "POST",
        body: { code },
        token: accessToken ?? undefined,
      });
      if (accessToken) setSession(verified, accessToken);
      router.replace(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Verification failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    setError(null);
    setInfo(null);
    try {
      await apiFetch("/auth/verify-email/send", { method: "POST", token: accessToken ?? undefined });
      setInfo("A new code is on its way.");
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not send a new code.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1 text-center">
        <h1 className="font-display text-h2">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          We sent a 6-digit code to <strong className="text-foreground">{user?.email}</strong>
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {info && (
        <Alert variant="info">
          <AlertDescription>{info}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={(e) => { void onSubmit(e); }} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            className="text-center text-xl tracking-[0.5em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </div>
        <Button type="submit" className="w-full" loading={submitting} disabled={code.length !== 6 || isLoading}>
          Verify email
        </Button>
      </form>

      <div className="flex items-center justify-between text-sm">
        <Button type="button" variant="link" className="px-0" disabled={cooldown > 0} onClick={() => { void resend(); }}>
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </Button>
        <Link href={next} className="text-muted-foreground hover:underline">
          Do this later
        </Link>
      </div>
    </div>
  );
}
