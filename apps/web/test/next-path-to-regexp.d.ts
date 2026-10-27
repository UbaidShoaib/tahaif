// Next.js's bundled path matcher (used by headers() and redirects()) ships without types.
declare module "next/dist/compiled/path-to-regexp" {
  export function pathToRegexp(path: string, keys?: unknown[]): RegExp;
}
