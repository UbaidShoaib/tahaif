# ADR 0014 — Build-Your-Own Buckets, Edited Together Live

**Date:** 2026-10-20
**Status:** Accepted

## Context

Buyers want to make their own gift: a hamper of chosen items, or a bouquet built
stem by stem with wrapping and ribbon. Diaspora families often send one gift
together (siblings in the UK and Canada for their mother), so several people
should be able to build the same bucket at once and see each other's changes.

Prior art (researched 2026-10-20): gift-box builders (Giftship, BoxBuilder for
WooCommerce) are step lists with min/max rules, not drag-and-drop; Interflora's
"My Interflora Creation" drags stems into a window with a running total; group
gifting (Shareagift, shared carts) has one payer. Nobody we found combines a gift
builder with live multi-person editing, so the real-time part follows Figma's
server-ordered multiplayer and DoorDash-style shared group orders.

## Decision

1. **A builder is a product.** `products.builder_kind` (`hamper` | `bouquet`)
   marks a base (basket, wrap) whose `base_price_pkr` is the container price, with
   `builder_min_items` / `builder_max_items`. `builder_components` lists the
   products that may go in it, with a `role` (item, stem, filler, wrap, ribbon) and
   a per-component `max_qty`. Components come from the base's vendor, so a bucket is
   one fulfillment leg.
2. **A bucket is a server-owned list.** `custom_buckets.state` is the placed pieces
   (component, qty, position as 0–1 fractions, rotation, z). Every edit (`add`,
   `move`, `set_qty`, `remove`, `clear`) is validated against the current state and
   bumps `version`. Edits are applied in arrival order under a row lock. They name
   pieces by key, so concurrent edits rarely conflict; an edit to a piece someone
   else just removed gets a 409 / `reject` with the fresh bucket. No CRDT: the data
   is a short list and the server is always reachable while editing.
3. **Access by link.** Creating a bucket returns a share token once; only its
   sha256 is stored. Anyone holding id + token can view and edit. Buckets expire
   after 30 days.
4. **Live editing over a WebSocket** at `/api/v1/buckets/{id}/ws?t=&name=`. After
   each accepted edit the full bucket (small) is published on Redis channel
   `bucket:{id}`, so sockets held by every API worker receive it. Presence is a
   Redis hash with a 30s freshness window refreshed by pings; cursors are
   broadcast but never stored. At most 10 editors per bucket and 20 messages a
   second per socket.
5. **Prices come from the server.** Totals are computed from DB prices. When the
   bucket goes into the cart, its components and their prices are copied onto the
   cart line's `customization`, with `components_total_pkr`; `cart_service._unit_price`
   adds that to the base price, and checkout copies `customization` to the order
   item. Bucket lines are never merged with other lines.
6. **One payer.** A bucket started by a signed-in buyer can be checked out only by
   them; a guest-started bucket by whoever holds the link. Once in a cart the bucket
   is locked.
7. **Phones first.** Every palette item has a tap-to-add button (also the keyboard
   path); drag-and-drop (`@dnd-kit/core`, with pointer, touch and keyboard sensors)
   is the extra on bigger screens.

## Consequences

- Component prices are fixed when the bucket enters the cart (a price change
  afterwards doesn't reach that line). Regular products are repriced live.
- Component products are ordinary products; component stock isn't decremented at
  checkout (they are made-to-order florist/hamper stock for now).
- Caddy proxies WebSockets with no extra config; Cloudflare must have WebSockets
  enabled (on by default).
