"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";

type Role = "staff" | "admin";

export type Member = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
};

type Change = { role?: Role | "customer"; is_active?: boolean };

const ROLE_HELP: Record<Role, string> = {
  staff: "Orders, payments, catalog, shops and messages",
  admin: "Everything staff do, plus refunds, coupons, exchange rates, the team and the activity log",
};

/**
 * Who can use the back office. Admins add an existing, verified account by email,
 * switch it between staff and admin, deactivate it, or take it off the team.
 * Your own row is read-only, so nobody locks themselves out (the API enforces it too).
 */
export function TeamManager({ token }: { token: string }) {
  const myId = useAuthStore((s) => s.user?.id);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMembers(await apiFetch<Member[]>("/admin/team", { token }));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Could not load the team.");
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, action: () => Promise<Member>, done: (m: Member) => string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      setNotice(done(await action()));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    void run("add", () => apiFetch<Member>("/admin/team", { method: "POST", body: { email: email.trim(), role }, token }),
      (m) => {
        setEmail("");
        return `${m.full_name ?? m.email} is now ${m.role === "admin" ? "an admin" : "staff"}.`;
      });
  };

  const change = (m: Member, body: Change, done: string) =>
    run(m.id, () => apiFetch<Member>(`/admin/team/${m.id}`, { method: "PATCH", body, token }), () => done);

  const name = (m: Member) => m.full_name ?? m.email;

  return (
    <div className="space-y-6">
      <form onSubmit={add} className="space-y-3 rounded-xl border p-4">
        <p className="text-sm text-muted-foreground">
          They sign up on the site and verify their email first, then you add that email here.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1 space-y-1 text-sm">
            <span className="font-medium">Email</span>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Access</span>
            <Select className="w-auto" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </Select>
          </label>
          <Button type="submit" disabled={busy === "add" || !email.trim()}>
            {busy === "add" ? "Adding…" : "Add to team"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{ROLE_HELP[role]}</p>
      </form>

      {error && <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {notice && <p role="status" className="text-sm text-success">{notice}</p>}

      {!members && !error ? (
        <p className="text-sm text-muted-foreground">Loading team…</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {(members ?? []).map((m) => {
            const me = m.id === myId;
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {name(m)} {me && <span className="text-muted-foreground">(you)</span>}
                  </p>
                  {m.full_name && <p className="break-all text-xs text-muted-foreground">{m.email}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!m.is_active && <Badge variant="error">Deactivated</Badge>}
                  {me ? (
                    <Badge variant={m.role === "admin" ? "brand" : "neutral"}>{m.role === "admin" ? "Admin" : "Staff"}</Badge>
                  ) : (
                    <>
                      <Select aria-label={`Access for ${name(m)}`} className="w-auto" value={m.role} disabled={busy === m.id}
                        onChange={(e) => void change(m, { role: e.target.value as Role },
                          `${name(m)} is now ${e.target.value === "admin" ? "an admin" : "staff"}.`)}>
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                      </Select>
                      <Button variant="outline" size="sm" disabled={busy === m.id}
                        onClick={() => void change(m, { is_active: !m.is_active },
                          m.is_active ? `${name(m)} is deactivated and signed out.` : `${name(m)} can sign in again.`)}>
                        {m.is_active ? "Deactivate" : "Reactivate"}
                      </Button>
                      <Button variant="ghost" size="sm" disabled={busy === m.id}
                        onClick={() => {
                          if (window.confirm(`Take ${name(m)} off the team? Their account stays, without back-office access.`)) {
                            void change(m, { role: "customer" }, `${name(m)} is off the team.`);
                          }
                        }}>
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
