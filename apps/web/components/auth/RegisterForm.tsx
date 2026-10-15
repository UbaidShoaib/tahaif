"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setSessionMarker } from "@/lib/session";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";
import { useHydrated } from "@/hooks/use-hydrated";
import { brand } from "@/lib/brand";

const schema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
});
type FormData = z.infer<typeof schema>;

export function RegisterForm() {
  const hydrated = useHydrated();
  const router = useRouter();
  const { setSession } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const password = watch("password", "");
  const strength = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  const onSubmit = async (data: FormData) => {
    setError(null);
    try {
      const res = await apiFetch<{ access_token: string; user: { id: string; email: string; full_name: string | null; role: "customer" | "vendor" | "staff" | "admin"; locale: string; currency_pref: string; avatar_url: string | null; is_verified: boolean; created_at: string } }>(
        "/auth/register",
        { method: "POST", body: data },
      );
      setSession(res.user, res.access_token);
      setSessionMarker(res.user.role);
      router.push("/verify-email");
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Registration failed. Please try again.");
    }
  };

  const strengthColor = ["bg-destructive", "bg-warning", "bg-gold", "bg-success"][strength - 1] ?? "bg-muted";
  const strengthLabel = ["Weak", "Fair", "Good", "Strong"][strength - 1] ?? "Too short";

  return (
    <div className="space-y-4">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="text-sm text-muted-foreground">Join {brand.name} and send gifts across Pakistan</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={(e) => { void handleSubmit(onSubmit)(e); }} className="space-y-4">
        {/* Disabled until hydrated so nothing typed early is wiped (hooks/use-hydrated.ts). */}
        <fieldset disabled={!hydrated} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" placeholder="Ahmed Khan" autoComplete="name" {...register("full_name")} />
          {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="you@example.com" autoComplete="email" {...register("email")} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
          {password && (
            <div className="mt-1 flex items-center gap-2">
              <div className="flex flex-1 gap-1" aria-hidden>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full ${i <= strength ? strengthColor : "bg-muted"}`} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                Strength: {strengthLabel}
              </p>
            </div>
          )}
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
        </fieldset>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-link hover:underline font-medium">
          Sign in
        </Link>
      </p>
    </div>
  );
}
