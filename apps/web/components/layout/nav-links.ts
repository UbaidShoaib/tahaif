/** Navigation targets; labels come from messages under `nav.*` (en.json / ur.json). */
export const NAV_LINKS = [
  { href: "/c/cakes", key: "cakes" },
  { href: "/c/flowers", key: "flowers" },
  { href: "/c/chocolates", key: "chocolates" },
  { href: "/c/perfumes", key: "perfumes" },
  { href: "/search", key: "allGifts" },
] as const;

export const OCCASION_LINKS = [
  { href: "/occasion/birthday", key: "birthday" },
  { href: "/occasion/eid-ul-fitr", key: "eid" },
  { href: "/occasion/anniversary", key: "anniversary" },
  { href: "/occasion/mothers-day", key: "mothersDay" },
  { href: "/occasion/wedding", key: "wedding" },
] as const;
