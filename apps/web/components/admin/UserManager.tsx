"use client";

import { useCallback, useEffect, useState } from "react";
import { ActionNotices, errorText, useAdminAction } from "@/components/admin/use-admin-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { usersApi, type AdminUser, type Role } from "@/lib/back-office-admin";
import { useAuthStore } from "@/stores/auth.store";

export const ROLE_LABELS: Record<Role, string> = {
  customer: "Customer",
  vendor: "Shop owner",
  staff: "Staff",
  admin: "Admin",
  super_admin: "Super admin",
};

const ALL_ROLES = Object.keys(ROLE_LABELS) as Role[];
const ADMINS: Role[] = ["admin", "super_admin"];

/** Roles this viewer may give: admins manage everyone below admin; a super admin manages everyone. */
export const assignableRoles = (iAmSuper: boolean): Role[] =>
  iAmSuper ? ALL_ROLES : ALL_ROLES.filter((r) => !ADMINS.includes(r));

const ROLE_HINT =
  "Staff run orders and the catalog. Admins also handle refunds, coupons, exchange rates and roles. " +
  "Only a super admin can make or change admins.";

/**
 * Find people and change what they can do. Admins only (the API enforces it). You can't
 * change your own role, so the last admin can't lock everyone out; admins and super admins
 * are read-only unless you are a super admin.
 */
export function UserManager({ token }: { token: string }) {
  const me = useAuthStore((s) => s.user?.id);
  const iAmSuper = useAuthStore((s) => s.user?.role === "super_admin");
  const assignable = assignableRoles(iAmSuper);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const [pending, setPending] = useState<Record<string, Role>>({});

  const load = useCallback(
    () => usersApi.list(token, query.trim() || undefined, roleFilter || undefined).then(setUsers),
    [token, query, roleFilter],
  );
  const { busy, error, ok, run } = useAdminAction(load);

  useEffect(() => {
    load().catch((e: unknown) => setLoadError(errorText(e)));
  }, [load]);

  async function apply(u: AdminUser) {
    const role = pending[u.id];
    if (!role || role === u.role) return;
    const done = await run(() => usersApi.setRole(token, u.id, role), `${u.email} is now ${ROLE_LABELS[role].toLowerCase()}.`);
    if (done) setPending(({ [u.id]: _, ...rest }) => rest);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{ROLE_HINT}</p>
      <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <FormField label="Find someone" hint="Part of their email, name or phone.">
          {(p) => <Input {...p} type="search" value={query} onChange={(e) => setQuery(e.target.value)} />}
        </FormField>
        <FormField label="Role">
          {(p) => (
            <Select {...p} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | "")}>
              <option value="">Everyone</option>
              {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          )}
        </FormField>
      </div>

      <ActionNotices error={error ?? loadError} ok={ok} />

      {!users && !loadError && <p className="text-sm text-muted-foreground">Loading…</p>}
      {users?.length === 0 && <p className="text-sm text-muted-foreground">Nobody matches.</p>}
      {users && users.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {users.map((u) => {
            const chosen = pending[u.id] ?? u.role;
            const self = u.id === me;
            const locked = !iAmSuper && ADMINS.includes(u.role);
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{u.full_name || u.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {u.full_name && `${u.email} · `}{u.phone && `${u.phone} · `}joined {new Date(u.created_at).toLocaleDateString("en-GB")}
                  </p>
                </div>
                {!u.is_verified && <Badge variant="neutral">Email not verified</Badge>}
                {self || locked ? (
                  <Badge variant="brand">{`${ROLE_LABELS[u.role]}${self ? " (you)" : ""}`}</Badge>
                ) : (
                  <>
                    <Select aria-label={`Role for ${u.email}`} className="w-40" value={chosen} disabled={busy}
                      onChange={(e) => setPending((p) => ({ ...p, [u.id]: e.target.value as Role }))}>
                      {assignable.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </Select>
                    {chosen !== u.role && (
                      <Button size="sm" disabled={busy} onClick={() => void apply(u)}>
                        Make {ROLE_LABELS[chosen].toLowerCase()}
                      </Button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
