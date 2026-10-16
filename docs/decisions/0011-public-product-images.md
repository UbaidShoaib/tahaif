# ADR 0011 — Public Product Images in the Media Bucket

**Date:** 2026-10-17
**Status:** Accepted

## Context

The media bucket is private: payment proofs, delivery photos, card notes and
vendor CNICs are only readable through short-lived links the API signs.
Product photos are the opposite: every visitor, crawler and link preview must
load them, and next/image fetches them server-side. Signed links expire and
would break cached pages, so they don't fit catalog photos.

## Decision

1. Photos uploaded with `POST /products/{slug}/images/upload` are stored under
   `products/{product_id}/{random}.{ext}` and saved as a plain public URL
   (`S3_PUBLIC_URL/products/...`).
2. Only that prefix is anonymously readable: `minio-init` runs
   `mc anonymous set download s3/$BUCKET/products` on every deploy. The rest of
   the bucket stays private.
3. Each upload gets a new random name, so replacing a photo never serves a
   stale cached copy.
4. JPEG/PNG/WebP only, 10 MB max, same as delivery photos. Same permission as
   adding an image by URL: staff, or the product's vendor owner.

## Consequences

- Never write private files under `products/`.
- Removing an image row does not delete the object yet (it may still appear in
  old cached pages); clean-up can come later if storage grows.
- On AWS S3 instead of MinIO, apply the same read-only policy to `products/*`.
