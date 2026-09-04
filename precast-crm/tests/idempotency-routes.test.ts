import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ROUTES = [
  "src/app/api/orders/[id]/delivery-proof/route.ts",
  "src/app/api/orders/[id]/load/route.ts",
  "src/app/api/orders/[id]/loaded-photos/route.ts",
  "src/app/api/orders/[id]/shipments/[sid]/load/route.ts",
  "src/app/api/payments/upload-receipt/route.ts",
  "src/app/api/payments/[id]/receipts/route.ts",
  "src/app/api/orders/[id]/comments/route.ts",
];

describe("mobile-retried routes are wrapped with withIdempotency", () => {
  for (const rel of ROUTES) {
    it(rel, () => {
      const src = readFileSync(path.resolve(process.cwd(), rel), "utf8");
      expect(src).toMatch(/import \{ withIdempotency \} from "@\/lib\/idempotency"/);
      expect(src).toMatch(/withIdempotency(<[^>]+>)?\(/);
    });
  }
});
