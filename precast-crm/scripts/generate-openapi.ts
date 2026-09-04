// Writes docs/api/openapi.json (repo root). `--check` exits 1 if stale.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { buildOpenApiDocument } from "../src/lib/openapi/registry";

const out = path.resolve(__dirname, "../../docs/api/openapi.json");
const next = JSON.stringify(buildOpenApiDocument(), null, 2) + "\n";

if (process.argv.includes("--check")) {
  const current = existsSync(out) ? readFileSync(out, "utf8") : "";
  if (current !== next) {
    console.error("docs/api/openapi.json is stale — run `npm run openapi:generate`");
    process.exit(1);
  }
  console.log("openapi.json is up to date");
} else {
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, next);
  console.log(`wrote ${out}`);
}
