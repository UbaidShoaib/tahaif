/**
 * k6 load-test for Tahaif API
 * Covers: health check, catalog browse, product detail, coupon validate, checkout smoke
 *
 * Run:
 *   k6 run infra/load-test.js
 *   k6 run --vus 50 --duration 60s infra/load-test.js
 *   BASE_URL=https://api.tahaif.com k6 run infra/load-test.js
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";
const API = `${BASE_URL}/api/v1`;

// Thresholds: p95 < 500 ms, error rate < 1%
export const options = {
  scenarios: {
    catalog_browse: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 20 },
        { duration: "1m", target: 20 },
        { duration: "15s", target: 0 },
      ],
      tags: { scenario: "catalog_browse" },
    },
    checkout_smoke: {
      executor: "constant-vus",
      vus: 5,
      duration: "1m",
      startTime: "15s",
      tags: { scenario: "checkout_smoke" },
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
    "http_req_duration{scenario:checkout_smoke}": ["p(95)<1000"],
  },
};

// ── Custom metrics ────────────────────────────────────────────────────────────

const catalogErrorRate = new Rate("catalog_errors");
const checkoutErrorRate = new Rate("checkout_errors");
const productDetailTrend = new Trend("product_detail_duration");

// ── Helpers ───────────────────────────────────────────────────────────────────

const HEADERS_JSON = { "Content-Type": "application/json" };

function json(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

function assertOk(res, label) {
  const ok = check(res, {
    [`${label} status 2xx`]: (r) => r.status >= 200 && r.status < 300,
  });
  return ok;
}

// ── Register + login to get a JWT ─────────────────────────────────────────────

let _token = null;

function getToken() {
  if (_token) return _token;

  const email = `loadtest_${__VU}_${Date.now()}@example.com`;
  const password = "LoadTest1234!";

  const reg = http.post(
    `${API}/auth/register`,
    JSON.stringify({ email, password, full_name: "Load Test" }),
    { headers: HEADERS_JSON }
  );

  if (reg.status !== 201) {
    // May already exist from a warm-up VU; try login
  }

  const login = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: HEADERS_JSON }
  );

  const body = json(login);
  if (body && body.access_token) {
    _token = body.access_token;
  }
  return _token;
}

function authHeaders() {
  const token = getToken();
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : HEADERS_JSON;
}

// ── Scenario: catalog browse ──────────────────────────────────────────────────

export default function catalogBrowse() {
  group("health", () => {
    const res = http.get(`${BASE_URL}/health`);
    assertOk(res, "health");
    sleep(0.1);
  });

  group("cities", () => {
    const res = http.get(`${API}/cities`);
    const ok = assertOk(res, "cities");
    catalogErrorRate.add(!ok);
    sleep(0.2);
  });

  group("products list", () => {
    const res = http.get(`${API}/products?page=1&page_size=12`);
    const ok = assertOk(res, "products list");
    catalogErrorRate.add(!ok);

    const body = json(res);
    if (ok && body && body.items && body.items.length > 0) {
      const product = body.items[Math.floor(Math.random() * body.items.length)];

      group("product detail", () => {
        const start = Date.now();
        const detail = http.get(`${API}/products/${product.slug}`);
        productDetailTrend.add(Date.now() - start);
        assertOk(detail, "product detail");
      });
    }

    sleep(0.5);
  });

  group("coupon validate", () => {
    const res = http.get(`${API}/coupons/WELCOME10/validate`);
    // 404 is acceptable — coupon may not exist in load-test env
    check(res, {
      "coupon validate not 5xx": (r) => r.status < 500,
    });
    sleep(0.3);
  });

  group("banners", () => {
    const res = http.get(`${API}/banners?slot=hero`);
    assertOk(res, "banners");
    sleep(0.2);
  });

  sleep(1);
}

// ── Scenario: checkout smoke ──────────────────────────────────────────────────

export function checkoutSmoke() {
  const headers = authHeaders();
  if (!headers.Authorization) {
    sleep(2);
    return;
  }

  group("cart — add item", () => {
    // First get a product to add
    const products = http.get(`${API}/products?page=1&page_size=1`);
    const body = json(products);
    if (!body || !body.items || body.items.length === 0) return;

    const product = body.items[0];

    const add = http.post(
      `${API}/cart/items`,
      JSON.stringify({
        product_id: product.id,
        variant_id: null,
        qty: 1,
      }),
      { headers }
    );
    const ok = assertOk(add, "cart add");
    checkoutErrorRate.add(!ok);
    sleep(0.3);
  });

  group("cart — view", () => {
    const res = http.get(`${API}/cart`, { headers });
    const ok = assertOk(res, "cart view");
    checkoutErrorRate.add(!ok);
    sleep(0.2);
  });

  group("checkout quote", () => {
    // Get a city first
    const cities = http.get(`${API}/cities`);
    const citiesBody = json(cities);
    if (!citiesBody || citiesBody.length === 0) return;

    const cityId = citiesBody[0].id;

    const res = http.get(`${API}/checkout/quote?city_id=${cityId}`, { headers });
    // 400 is OK if cart is empty for this VU
    check(res, {
      "checkout quote not 5xx": (r) => r.status < 500,
    });
    sleep(0.5);
  });

  sleep(2);
}
