/** Short, readable order number from the public token (as shown in emails and tracking). */
export function orderNumber(publicToken: string): string {
  return publicToken.replace(/-/g, "").slice(0, 8).toUpperCase();
}
