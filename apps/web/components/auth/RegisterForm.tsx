"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Cookies from "js-cookie";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";

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
      Cookies.set("tahaif_session", res.user.role, { sameSite: "lax", expires: 7 });
      router.push("/");
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Registration failed. Please try again.");
    }
  };

  const strengthColor = ["bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-primary-500"][strength - 1] ?? "bg-muted";

  return (
    <div className="space-y-4">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="text-sm text-muted-foreground">Join Tahaif and send gifts across Pakistan</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={(e) => { void handleSubmit(onSubmit)(e); }} className="space-y-4">
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
            <div className="flex gap-1 mt-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className={`h-1 flex-1 rounded-full ${i <= strength ? strengthColor : "bg-muted"}`} />
              ))}
            </div>
          )}
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-primary-600 hover:underline font-medium">
          Sign in
        </Link>
      </p>
    </div>
  );
}
