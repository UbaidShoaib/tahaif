// No imports: the edge middleware uses these too.

/** Admin-only work (refunds, coupons, the team, the activity log); a super admin also manages admins. */
export const ADMIN_ROLES = ["admin", "super_admin"];
/** Everyone who runs the shop from /admin. */
export const BACK_OFFICE_ROLES = ["staff", ...ADMIN_ROLES];

export const isAdminRole = (role: string | undefined): boolean => !!role && ADMIN_ROLES.includes(role);
export const isBackOfficeRole = (role: string | undefined): boolean => !!role && BACK_OFFICE_ROLES.includes(role);
