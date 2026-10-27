# Phase 10 — SEO & Discoverability (evaluation & plan)

Status: **P0 done** · Written 2026-10-17

This is an SEO audit of the storefront (`apps/web`) and a plan to fix it in
stages. It covers technical SEO, on-page SEO, structured data, content and
keyword strategy, AI/answer-engine visibility, and how to measure results.
Each finding names the file it comes from.

---

## 1. Verdict

The base is good: the App Router renders pages on the server, product pages
have JSON-LD, the HTML is semantic (one `h1`, labelled sections, real
breadcrumbs), `next/image` serves AVIF/WebP, and `robots.ts` and `sitemap.ts`
exist. But several bugs mean **Google can find almost none of the catalog**,
and the site has no pages that target the searches people in Pakistan
actually make, such as *"cake delivery in Lahore"* or *"send flowers to
Karachi"*, or the diaspora search *"send gifts to Pakistan from UK"*.

| Area | Grade | One-line reason |
|---|---|---|
| Crawlability & indexing | **D** | The sitemap lists no products; `robots.txt` blocks `/_next/`; private order pages can be indexed |
| On-page metadata | **C-** | Titles are bare names; categories have no description; no canonical tags, `metadataBase` or OG image |
| Structured data | **C** | The Product schema is incomplete; no Organization, WebSite, BreadcrumbList or ItemList schema |
| Content & keyword coverage | **D** | No city pages, a "Coming soon" blog and FAQ, a missing About page, placeholder legal pages |
| Internationalisation | **D** | Urdu content sits behind a cookie, so crawlers can't see it and there's no `hreflang` |
| Performance (CWV) | **B?** | Good image setup, but every page is dynamic (the cookie is read in the layout). Needs field data |
| Measurement | **F** | No Search Console, no Merchant Center, no SEO KPIs |

---

## 2. Findings

### 2.1 Critical bugs (fix first, each is small)

1. **The sitemap has no products.** `app/sitemap.ts` requests
   `/products?page_size=500&active_only=true`, but the API caps `page_size`
   at 100 (`api/.../endpoints/catalog.py:125`). The request fails with a 422
   and the helper returns `null`. Even when the request succeeds, the endpoint
   returns `PaginatedProducts` (`{ items, total, ... }`), not an array, so
   `.map` is undefined and the result is `[]`. **No product URL ever reaches
   the sitemap.**
2. **The sitemap lists pages that don't exist or shouldn't be indexed.**
   `/about` returns 404 (there is no route). `/login` and `/register` are
   listed. `/faq` and `/blog` are "Coming soon" stubs. Occasion pages
   (`/occasion/*`) and vendor storefronts (`/vendor/*`) are missing, and
   neither are child categories listed.
3. **`robots.ts` disallows `/_next/`.** This blocks the JS and CSS Googlebot
   needs to render pages, which can hurt rendering and mobile-usability
   checks. Remove that rule. `/api/` is a different host anyway.
4. **Private token pages can be indexed.** `/track/[token]` has no `noindex`,
   and tracking links get shared on WhatsApp, so recipient names and addresses
   could end up in search results. `/checkout/success/[token]` and
   `/send/[addressId]` have no `noindex` either, and nor do `/cart` and
   `/vendor/*` portal pages. (`/note` and `/thanks` already set
   `robots: { index: false }`, which is the right pattern.)
5. **No `metadataBase`, and fallback brand values leak.** `brand.siteUrl`
   falls back to `http://localhost:3000` and the name to `GiftShop`. If
   `NEXT_PUBLIC_SITE_URL` is missing from a production build, the sitemap,
   robots file and OG URLs all point at localhost. The build should fail when
   it's missing.

### 2.2 Duplicate content & URL hygiene

- **No canonical tags anywhere.** Category, occasion and vendor pages accept
  `?sort=`, `?price=` and `?city_id=`, and `/search?q=` creates an unlimited
  number of URLs. Each one is a separate, indexable copy of the page.
- **`/c/[...slug]` is a catch-all** that only reads `slug[0]`, so
  `/c/cakes/anything/else` serves the Cakes page with status 200. It should
  return 404, or 301 to the real path.
- `/search` should be `noindex, follow`. Searches people actually make
  should become real landing pages (section 3) instead.

### 2.3 On-page metadata

- **Titles are bare names.** Products render as `Chocolate Cake | Brand` and
  categories as `Cakes | Brand`. There's no keyword or place in them
  (*"Send Cakes Online in Pakistan — Same-Day Delivery | Tahaif"*).
- **Category pages have no meta description.** Product descriptions are the
  raw database text, untruncated. The home page uses a generic default.
- No Twitter card, no default OG image (`app/opengraph-image.*`), and no
  per-product OG title or description. **In Pakistan, WhatsApp link previews
  are a major sales channel**, so a rich preview (photo, price, name) brings
  in clicks directly.
- Products without a photo fall back to a stock Unsplash image
  (`lib/catalog.ts:primaryImage`), which then appears in the OG image and in
  the JSON-LD `image`. It's better to leave the image out or use a brand
  placeholder.
- No `manifest.webmanifest` or `apple-icon`.

### 2.4 Structured data

`app/p/[slug]/page.tsx` sends `Product` + `Offer` + `AggregateRating`.
Missing pieces:

- `url`, `sku`, `offers.url`, `offers.seller`, `priceValidUntil`,
  `shippingDetails` (`OfferShippingDetails` for PK cities) and
  `hasMerchantReturnPolicy`. Google flags the last two as warnings for
  merchant listings, and they decide whether a product can show as a rich
  result.
- Variant prices are ignored. Use `AggregateOffer` (`lowPrice`/`highPrice`)
  when a product has variants or per-city prices.
- Add individual `Review` items next to `aggregateRating`.
- Site-wide: `Organization` (logo, `sameAs` social profiles, WhatsApp
  `contactPoint`) and `WebSite`. Add `BreadcrumbList`, which the
  `<Breadcrumb>` component can emit itself, and `ItemList` on listing pages.
- `FAQPage` on a real FAQ. Google now shows FAQ rich results only for a few
  sites, but AI answer engines still read this markup.

### 2.5 Content & keyword coverage (the biggest growth lever)

Searches for gift delivery in Pakistan nearly always name a **city** and a
**product type**, and diaspora searches name a **country of origin**. The
site has no pages for any of these:

| Search intent | Example query | Page today |
|---|---|---|
| City × category | "cake delivery Lahore", "flowers Karachi" | none; city is only a `?city_id=` filter |
| City hub | "online gifts Islamabad" | none |
| Diaspora | "send gifts to Pakistan from UK/USA/UAE/Canada" | none; the contact page mentions it in one line |
| Occasion | "Eid gifts Pakistan", "Mother's Day flowers" | `/occasion/[slug]` exists, but its content is thin |
| Same day | "same day cake delivery Karachi" | none (there's a same-day rail but no page) |
| Informational | "mithai box price", "what to send for aqiqa" | blog is "Coming soon" |
| Trust | "Tahaif reviews", "is Tahaif legit" | no About page; placeholder privacy and refund pages |

Every listing page is also only an `h1` and a product grid, with no intro
text, FAQs or internal links. Google sees each one as thin content.

### 2.6 Internationalisation

The locale is stored in a cookie and URLs don't change (`i18n/config.ts`),
so Googlebot only ever sees English and Urdu is never indexed. Urdu and
Roman Urdu queries ("سالگرہ کا کیک", "cake bhejna Lahore") are a real,
low-competition market. Once Urdu is turned on, it needs its own URLs (for
example `/ur/...`) with `hreflang` (`en-PK`, `ur-PK`, `x-default`). That
means changing ADR 0005, so it comes later in this plan (P3).

### 2.7 Performance

- `app/layout.tsx` reads the locale cookie, so **every page renders
  dynamically**. Product and category pages can't be statically cached or
  use ISR, even though their data only revalidates every 60 s. TTFB therefore
  depends on API latency for every crawler request.
- Three font families (Inter, Fraunces, Noto Naskh) are loaded. Check LCP and
  CLS with real field data before optimising.
- Image handling is good already: `priority` on the hero, `sizes`, and
  AVIF/WebP.

---

## 3. Target information architecture

```
/                               Home (Organization + WebSite schema)
/c/{category}                   Send Cakes Online in Pakistan
/c/{category}/{city}         ★  Cake Delivery in Lahore        (city × category)
/city/{city}                 ★  Gift Delivery in Karachi        (city hub)
/occasion/{occasion}            Eid Gifts — evergreen URL, refreshed every year
/occasion/{occasion}/{city}  ★  (later, only where demand exists)
/send-gifts-to-pakistan-from/{country} ★  UK, USA, UAE, Canada, Saudi Arabia
/same-day-delivery/{city}    ★  Same-day pages, only for cities that support it
/p/{product}                    Product (full schema)
/vendor/{vendor}                Bakery/florist storefront (LocalBusiness-ish)
/guides/{slug}               ★  Replaces /blog: buying guides and occasion etiquette
/about /faq /contact /delivery-areas /refund /privacy /terms
```
★ = new.

The rule for city × category pages: **only generate a page when that city
has at least N active products in the category** (N≈4), and give each page
unique copy (delivery cutoffs, fees, local vendors, a short FAQ). This avoids
thin doorway pages, which Google penalises.

---

## 4. Execution plan

### P0 — Technical fixes (≈2–3 days, no new content)

| # | Task | Files |
|---|---|---|
| 1 | Rewrite the sitemap: page through `/products` 100 at a time using `.items`; add occasions, vendors and child categories; drop `/about`, `/login`, `/register` and the stubs; use real `lastModified`. Split it with `generateSitemaps` once it's past ~5k URLs | `app/sitemap.ts`, plus `updated_at` on the API schemas |
| 2 | robots: allow `/_next/`; disallow `/cart`, `/search?`, the vendor portal and other token routes | `app/robots.ts` |
| 3 | `noindex` on `/track`, `/checkout/*`, `/send`, `/cart`, `/search`, auth pages and portals (a shared `privatePage` metadata helper) | those pages |
| 4 | `metadataBase` plus a site-wide `alternates.canonical`; listing pages set their canonical to the bare path (no filter params). Fail the build when `NEXT_PUBLIC_SITE_URL` is unset in production | `app/layout.tsx`, `lib/brand.ts`, listing pages |
| 5 | Make `/c/[...slug]` return 404 or 301 when the path has extra segments | `app/c/[...slug]/page.tsx` |
| 6 | Add tests: sitemap contents, robots output, canonical/noindex snapshots | `*.test.ts` |
| 7 | Set up Google Search Console and Bing Webmaster Tools, submit the sitemap, add the verification meta via env | `layout.tsx` `verification` |

P0 shipped as above, with these choices: private pages get an `X-Robots-Tag: noindex` header
from `lib/seo.ts` (it also covers client pages that can't export metadata), and robots.txt
blocks only signed-in areas, so crawlers can still see the noindex on token pages. Canonicals are
set per page, not in the root layout, where every page would inherit the home canonical.
Remaining manual step: verify the domain in Search Console and Bing (set the two
`NEXT_PUBLIC_*_SITE_VERIFICATION` values, rebuild) and submit `/sitemap.xml`.
Known gap: pages with a `loading.tsx` (product, category, occasion, shop) stream, so a missing
slug returns 200 with `noindex` rather than a 404. Search engines drop it either way; a true 404
needs the lookup to happen before streaming starts (P3 performance work).

### P1 — Metadata & structured data (≈1 week)

1. A `lib/seo.ts` with title and description builders: product
   (`{name} — Delivery in {cities} | {brand}`, description cut to about 155
   characters with the price), category, occasion, vendor and city.
2. A default `app/opengraph-image.tsx` and per-product dynamic OG images
   showing the photo, name, "from Rs X" and the brand. Add the Twitter
   `summary_large_image` card. Check the result in WhatsApp's preview.
3. JSON-LD helpers (`lib/jsonld.ts`): complete Product/AggregateOffer with
   shipping and return policy; Organization and WebSite in the layout;
   `BreadcrumbList` from `<Breadcrumb>`; `ItemList` on listings.
4. Remove the Unsplash fallback from metadata. Require `alt_text` in the
   admin product editor and default it to "{product name} — {category}".
5. Add `manifest.webmanifest`, `apple-icon` and a themed `icon`.
6. Product feed: `/feeds/google-merchant.xml` (or a Content API sync) for
   **Google Merchant Center free listings**. This is the fastest route into
   the Shopping tab and image results, and it reuses the P1.3 data.

### P2 — Landing pages & content (≈2–3 weeks, ongoing)

**P2.1 first cut shipped (city pages):** `/city/{city}` hubs and `/c/{category}/{city}` pages
with the listing filtered on the server, data-driven titles, descriptions and intro copy
(`lib/city-seo.ts`), self canonicals, and `noindex` below the threshold (a hub needs 1 gift,
a category in a city needs `MIN_CITY_PRODUCTS` = 3); the sitemap uses the same rule. Shop
pages carry their city in the title ("Bouquet Bar, Gujranwala — …") and link to their city
hub; every page's footer links to each city. Still to do from this item: per-page copy and
FAQs edited by staff (`seo_title`, `seo_description`, `intro_md`).

1. **City hubs and city × category pages**, with a server-side city filter,
   the threshold rule from section 3, and unique intro and FAQ copy stored per
   page in the DB. Add `seo_title`, `seo_description` and `intro_md` to
   Category, Occasion and City. Also add a CityCategory content table and an
   admin editor for it, which follows Phase 9's back-office pattern.
2. **Diaspora pages** for the 5 largest source countries: currency (the
   currency selector exists), time-zone delivery cutoffs (`DualTime`
   exists), WhatsApp support, and pay-from-abroad options.
3. **Real pages**: About (the story, vendors, photos of real deliveries), FAQ
   (delivery, payment, refunds, card messages) with `FAQPage` schema,
   Delivery Areas (cities, fees and cutoffs from the `/cities` API), and
   complete privacy and refund pages.
4. **Listing enrichment**: about 150 words of intro above the grid, an FAQ
   below it, and links to related cities, occasions and categories. Add
   real pagination links (`?page=2` with a self canonical) behind the
   client-side "load more", so crawlers can reach every product.
5. **Guides** (rename `/blog` to `/guides`, or keep it): MDX in the repo at
   first. Plan 2 posts a month around the occasion calendar, published **6–8
   weeks before** each peak: Eid ul Fitr, Eid ul Adha, Mother's Day,
   Valentine's, Father's Day, Independence Day, wedding season (Nov–Feb).
   Each guide links to the matching occasion and city pages.
6. **Occasion pages stay at the same URL every year.** The page for Eid 2027
   is `/occasion/eid-ul-fitr`, refreshed each year, never a new URL.

### P3 — Urdu, performance, authority (≈2–4 weeks)

1. **Urdu SEO**: change ADR 0005 so Urdu gets its own URLs (`/ur/` prefix,
   next-intl `localePrefix: "as-needed"`) with `hreflang` pairs and
   per-locale sitemaps. Translate the slugs or keep them in English, then
   decide which. Add Roman Urdu terms to the copy, not as keywords.
2. **Performance**: move locale detection out of the root layout, or make
   it static per locale prefix, so product and category pages can use
   ISR (`revalidate`). Add on-demand revalidation via `revalidateTag` when an
   admin edits a product. Track CWV through PostHog web vitals or Vercel
   Speed Insights; targets are LCP < 2.5 s, INP < 200 ms and CLS < 0.1 on
   mid-range Android over 4G.
3. **Reviews & E-E-A-T**: send a review request after delivery (the
   WhatsApp/email flow exists), use delivery photos (with consent) as social
   proof, and show vendor bios on product pages (`VendorStory` exists).
4. **Local & off-page**: a Google Business Profile for each city where there's
   a real pickup or ops address (only where it truly exists). Get listed
   in Pakistani directories and wedding/event sites, get coverage in diaspora
   community press, and partner with vendors so their sites and Instagram bios
   link to their storefront page.
5. **AI and answer-engine visibility**: add `/llms.txt` (what the site sells,
   which cities, how to order, policy links). Make sure FAQ, delivery-area
   and policy pages state their facts plainly; AI assistants quote this kind
   of text. Keep Organization `sameAs` consistent across profiles.

---

## 5. Measurement

| KPI | Source | Baseline → 6-month goal |
|---|---|---|
| Indexed product pages / active products | GSC Pages report | ~0% → >90% |
| Non-brand organic clicks per month | GSC, excluding brand queries | measure → ×5 |
| Top-10 rankings for the 20 city×category terms | GSC average position / rank tracker | measure → 10 of 20 |
| Merchant Center approved products | GMC | 0 → all active |
| Organic-attributed orders | existing UTM/campaign report (Phase 8) plus `referrer=google` | measure → 20% of orders |
| CWV pass rate (mobile) | CrUX / GSC | measure → "Good" |

Add an "Organic" source to the campaign report (`components/admin/CampaignReport.tsx`)
so SEO results show up in sales numbers, not only in traffic.

---

## 6. Order of work

P0 is the only blocker: until the sitemap and robots fixes ship, nothing
else can be measured. Then P1.1–P1.3 together, then the Merchant Center feed,
then city × category pages (P2.1), the most valuable piece. Content (P2.5)
needs a person writing 2 posts a month and can start while P1 is underway.
Urdu URLs (P3.1) wait until `NEXT_PUBLIC_ENABLE_URDU` is ready to turn on.

## 7. Open questions

- Which cities actually take orders today, and does any city have a physical
  address (needed for Google Business Profile and `LocalBusiness` schema)?
- Return/refund terms to put in `hasMerchantReturnPolicy` (see
  `docs/questions.md` Q17).
- Production domain and brand name: are they confirmed as `tahaif.pk` / Tahaif? Is a
  `.com` for the diaspora planned (and if so, redirect or a separate
  hreflang region)?
- Who writes the content, and in which languages?
