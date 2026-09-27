// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

function visit(path: string, role?: string) {
  const req = new NextRequest(new URL(path, "http://localhost:3000"));
  if (role) req.cookies.set("tahaif_session", role);
  const res = middleware(req);
  return { status: res.status, location: res.headers.get("location") };
}

describe("middleware route protection", () => {
  it("lets guests open a public vendor storefront", () => {
    expect(visit("/vendor/tehzeeb-bakers").status).toBe(200);
  });

  it("sends guests from the vendor portal to login with a callback", () => {
    const { status, location } = visit("/vendor/orders");
    expect(status).toBe(307);
    expect(location).toBe("http://localhost:3000/login?callbackUrl=%2Fvendor%2Forders");
  });

  it("keeps buyers out of the vendor portal but not the storefront", () => {
    expect(visit("/vendor/dashboard", "customer").location).toBe("http://localhost:3000/");
    expect(visit("/vendor/layers-bakeshop", "customer").status).toBe(200);
  });

  it("lets vendors and admins into the vendor portal", () => {
    expect(visit("/vendor/products", "vendor").status).toBe(200);
    expect(visit("/vendor/orders", "admin").status).toBe(200);
  });

  it("gates /admin to admin and staff", () => {
    expect(visit("/admin").location).toContain("/login?callbackUrl=%2Fadmin");
    expect(visit("/admin", "vendor").location).toBe("http://localhost:3000/");
    expect(visit("/admin", "staff").status).toBe(200);
  });

  it("does not treat look-alike paths as protected", () => {
    expect(visit("/vendor/dashboard-bakers").status).toBe(200);
  });

  it("requires a session for account pages", () => {
    expect(visit("/account/orders").status).toBe(307);
  });

  it("lets guests reach checkout (ADR 0004)", () => {
    expect(visit("/checkout").status).toBe(200);
    expect(visit("/checkout", "customer").status).toBe(200);
  });
});
