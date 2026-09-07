import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { buildOpenApiDocument } from "@/lib/openapi/registry";

describe("OpenAPI document", () => {
  const doc = buildOpenApiDocument();
  const paths = Object.keys(doc.paths ?? {});
  it("declares the Phase 1 mobile surface", () => {
    for (const p of [
      "/api/auth/login", "/api/auth/me", "/api/mobile/bootstrap", "/api/devices", "/api/devices/{token}",
      "/api/users/me/password", "/api/orders", "/api/orders/{id}", "/api/orders/capacity",
      "/api/orders/{id}/load", "/api/orders/{id}/loaded-photos", "/api/orders/{id}/delivery-proof",
      "/api/orders/{id}/shipments", "/api/orders/{id}/shipments/{sid}/load",
      "/api/orders/{id}/shipments/{sid}/dispatch", "/api/orders/{id}/shipments/{sid}/deliver",
      "/api/orders/{id}/comments", "/api/payments", "/api/payments/{id}/confirm", "/api/payments/{id}/reject",
      "/api/payments/upload-receipt", "/api/payments/{id}/receipts", "/api/clients", "/api/clients/{id}",
      "/api/drivers", "/api/notifications", "/api/notifications/{id}", "/api/notifications/read-all",
      "/api/gallery", "/api/calculate/batch", "/api/pricing",
      "/api/orders/{id}/loaded-photos/{photoId}",
      "/api/orders/{id}/shipments/{sid}",
      "/api/orders/{id}/dispatch",
      "/api/dispatches/{id}/return",
      "/api/orders/{id}/delivery-location",
      "/api/geo/resolve-link",
      "/api/drivers/{id}",
      "/api/drivers/{id}/deactivate",
      "/api/payments/{id}/handover",
      "/api/discrepancies",
      "/api/discrepancies/{id}",
      "/api/dashboard",
      "/api/clients/export",
    ]) {
      expect(paths, `missing ${p}`).toContain(p);
    }
  });
  it("registers exactly 44 paths", () => {
    expect(paths).toHaveLength(44);
  });
  it("documents both methods on /api/drivers/{id}", () => {
    const p = doc.paths?.["/api/drivers/{id}"];
    expect(p?.get).toBeDefined();
    expect(p?.patch).toBeDefined();
  });
  it("uses bearer auth and the standard envelope", () => {
    expect(doc.components?.securitySchemes?.bearerAuth).toBeDefined();
    expect(doc.components?.schemas?.ApiError).toBeDefined();
    const login = doc.paths?.["/api/auth/login"]?.post;
    expect(login?.security).toEqual([]); // public
  });
  it("docs/api/openapi.json matches the registry (run `npm run openapi:generate` if this fails)", () => {
    const committed = readFileSync(path.resolve(process.cwd(), "../docs/api/openapi.json"), "utf8");
    expect(committed).toEqual(JSON.stringify(buildOpenApiDocument(), null, 2) + "\n");
  });
});
