import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ROUTES = [
  "src/app/api/orders/[id]/delivery-proof/route.ts",
  "src/app/api/orders/[id]/load/route.ts",
  "src/app/api/orders/[id]/loaded-photos/route.ts",
  "src/app/api/orders/[id]/shipments/[sid]/load/route.ts",
  "src/app/api/payments/route.ts",
  "src/app/api/payments/upload-receipt/route.ts",
  "src/app/api/payments/[id]/receipts/route.ts",
  "src/app/api/orders/[id]/comments/route.ts",
  "src/app/api/projects/route.ts",
  "src/app/api/orders/route.ts",
  "src/app/api/gazoblok/orders/[id]/shipments/route.ts",
  "src/app/api/gazoblok/orders/[id]/shipments/[sid]/route.ts",
  "src/app/api/gazoblok/orders/[id]/shipments/[sid]/load/route.ts",
  "src/app/api/gazoblok/orders/[id]/route.ts",
  "src/app/api/gazoblok/upload-receipt/route.ts",
  "src/app/api/gazoblok/orders/[id]/delivery-proof/route.ts",
];

describe("mobile-retried routes are wrapped with withIdempotency", () => {
  for (const rel of ROUTES) {
    it(rel, () => {
      const src = readFileSync(path.resolve(process.cwd(), rel), "utf8");
      expect(src).toMatch(/import \{ withIdempotency(, \w+)* \} from "@\/lib\/idempotency"/);
      expect(src).toMatch(/withIdempotency(<[^>]+>)?\(/);
    });
  }
});

// Final review #2: routes whose one path carries different actions/bodies must pin
// the key to the request identity, so a reused key can't replay another action.
describe("gazoblok routes with several actions per path scope their keys", () => {
  const SCOPED: [string, RegExp][] = [
    ["src/app/api/gazoblok/orders/[id]/route.ts", /\{ scope: bodyScope \}/],
    ["src/app/api/gazoblok/orders/[id]/shipments/[sid]/load/route.ts", /\{ scope: formFieldsScope\("loadedLines", "confirmOverload"\) \}/],
  ];
  for (const [rel, re] of SCOPED) {
    it(rel, () => {
      expect(readFileSync(path.resolve(process.cwd(), rel), "utf8")).toMatch(re);
    });
  }
});
