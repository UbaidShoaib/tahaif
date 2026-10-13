# Catalog template — Bouquet Bar

Paste this whole file into claude.ai, then give it your shop details (products,
prices, cities, photos). It will hand back one file, `catalog.json`, which the
loader script reads to fill the live shop.

---

## Instructions for the assistant filling this in

You are helping the owner of **Bouquet Bar**, an online gift and flower delivery
shop in Pakistan, prepare the opening catalog.

1. Ask the owner for anything you need that they have not given you: what they
   sell, prices, sizes, which cities they deliver to, delivery fees, how much
   notice an order needs, and product photos. Ask in small batches, not all at once.
2. Never invent facts about the business: no made-up prices, vendors, addresses,
   or photo links. If something is unknown, ask. If the owner wants to decide
   later, use the documented "unknown" value for that field.
3. You may write or polish product descriptions, alt text and slugs yourself.
4. When done, output **one JSON code block only**, valid JSON (no comments, no
   trailing commas), following the structure and rules below exactly. Keep the
   key names as written.
5. After the JSON, list anything you left blank or assumed, so the owner can check.

## Rules

**Money** — whole Pakistani rupees as plain integers: `3500`, not `"3,500"`,
not `3500.00`. No decimals anywhere.

**Slugs** — lowercase letters, digits and hyphens only (`red-roses-bouquet`).
Each slug must be unique within its list. A slug is the permanent web address
of the item, so keep it short and do not put prices or dates in it.

**Cities** — use only these slugs. They already exist in the shop:
`karachi`, `lahore`, `islamabad`, `faisalabad`, `multan`, `peshawar`,
`sialkot`, `gujranwala`, `hyderabad`.
If the owner delivers somewhere else, add it under `new_cities`.

**Occasions** — use only these slugs: `birthday`, `eid-ul-fitr`, `eid-ul-azha`,
`anniversary`, `mothers-day`, `wedding`, `aqiqa`, `ramadan`.
If the owner wants another one, add it under `new_occasions`.

**Vendors** — the business that makes and hands over the product. If Bouquet Bar
makes everything itself, there is exactly one vendor: Bouquet Bar. Only list
another business if the owner has an agreement to sell its products.

**Categories** — keep the list short; only categories that will have products.

**Products**
- `base_price` is the price of the cheapest option.
- Every product needs at least one entry in `options` (the sizes or versions a
  buyer picks from). For a product with no choices, use a single option named
  `"Standard"` with `extra_price` 0.
- `extra_price` is what the option costs *on top of* `base_price`. The cheapest
  option is 0. Example: base 2500, "24 stems" costs 4500 → `extra_price` 2000.
- `stock` is how many can be sold before it shows as sold out. For made-to-order
  items use a comfortable number such as 50.
- `details` on an option is optional structured info, e.g. `{"stem_count": 12}`
  or `{"weight_lbs": 2}`.
- `images`: full `https://` links to the product's own photos, best one first.
  If the owner has photos but no links yet, put the **file name** instead
  (`"red-roses-12.jpg"`) and tell them to send those files along with the JSON.
  Use `[]` if there is no photo yet. Never use stock photos or other shops' photos.
- `occasions`: zero or more occasion slugs the product suits.
- `personalisation` (optional): questions the buyer answers when ordering.
  `type` is `"text"` (typed answer; set `max_length`), `"select"` (pick one of
  `choices`), or `"image"` (buyer uploads a picture).

**Delivery** (`delivery` on each product, one entry per city it ships to)
- `fee`: delivery charge in rupees for that city; 0 for free delivery.
- `notice_hours`: how long before delivery the order must be placed. 24 = next
  day; 3 = can be delivered three hours after ordering.
- `same_day_cutoff`: latest time of day (Pakistan time, 24-hour `"HH:MM"`) to
  order for delivery the same day, or `null` if same-day delivery is not offered.
- `city_price` (optional): set only if the product costs a different base price
  in that city; otherwise leave it out.

To avoid repeating the same delivery terms on every product, put the usual terms
under `delivery_defaults` and write `"delivery": "default"` on the product.
A product can instead list its own cities when its terms differ.

**Admin account** — only the owner's name and email. **Do not put a password in
this file**; it is set separately on the server.

## Structure

Replace every example value. The examples show the format only — they are not
real Bouquet Bar data.

```json
{
  "admin": {
    "full_name": "Owner Name",
    "email": "owner@example.com"
  },

  "new_cities": [],
  "new_occasions": [],

  "vendors": [
    {
      "slug": "bouquet-bar",
      "name": "Bouquet Bar",
      "city": "lahore",
      "description": "One or two sentences about the shop, shown on its page.",
      "logo": null
    }
  ],

  "categories": [
    { "slug": "flowers", "name": "Flowers" },
    { "slug": "cakes", "name": "Cakes" }
  ],

  "delivery_defaults": [
    { "city": "lahore", "fee": 250, "notice_hours": 3, "same_day_cutoff": "17:00" },
    { "city": "islamabad", "fee": 400, "notice_hours": 24, "same_day_cutoff": null }
  ],

  "products": [
    {
      "slug": "red-roses-bouquet",
      "name": "Red Roses Bouquet",
      "vendor": "bouquet-bar",
      "category": "flowers",
      "description": "Two to four sentences a buyer would want to read.",
      "base_price": 2500,
      "options": [
        { "name": "12 stems", "extra_price": 0, "stock": 50, "details": { "stem_count": 12 } },
        { "name": "24 stems", "extra_price": 2000, "stock": 30, "details": { "stem_count": 24 } }
      ],
      "images": [
        { "url": "https://example.com/photos/red-roses-12.jpg", "alt": "Bouquet of twelve red roses tied with ribbon" }
      ],
      "occasions": ["anniversary", "birthday"],
      "personalisation": [
        { "label": "Message on the card", "type": "text", "required": false, "max_length": 200 },
        { "label": "Wrapping colour", "type": "select", "required": true, "choices": ["Red", "White", "Kraft"] }
      ],
      "delivery": "default"
    },
    {
      "slug": "chocolate-truffle-cake",
      "name": "Chocolate Truffle Cake",
      "vendor": "bouquet-bar",
      "category": "cakes",
      "description": "Two to four sentences a buyer would want to read.",
      "base_price": 3500,
      "options": [
        { "name": "2 lb", "extra_price": 0, "stock": 20, "details": { "weight_lbs": 2 } }
      ],
      "images": [],
      "occasions": ["birthday"],
      "personalisation": [],
      "delivery": [
        { "city": "lahore", "fee": 300, "notice_hours": 24, "same_day_cutoff": null }
      ]
    }
  ]
}
```

If `new_cities` or `new_occasions` are needed, use these shapes:

```json
"new_cities": [ { "slug": "rawalpindi", "name": "Rawalpindi" } ],
"new_occasions": [ { "slug": "graduation", "name": "Graduation", "name_ur": "گریجویشن" } ]
```

## Before handing the file back, check

- Every `vendor`, `category`, `city` and occasion slug used by a product is
  defined above it or is in the allowed lists.
- No two products share a slug; no two options of one product share a name.
- Every product has at least one option with `extra_price` 0.
- Every product ships to at least one city.
- All prices and fees are whole numbers; all times are `"HH:MM"` or `null`.
- The JSON parses.
