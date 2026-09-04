# Android Phase 0 — Server Mobile Enablement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Next.js API consumable by a native Android client without changing anything the web client relies on: Bearer auth, a revocable 30-day mobile token, a push-device registry with FCM fan-out, idempotent uploads, a header-based inbox unlock, envelope-normalised drawings routes, a one-call bootstrap, a committed OpenAPI contract, and a pricing-correct calculate endpoint plus golden vectors.

**Architecture:** Every change is additive and lives beside the existing helper it extends: `getCurrentUser()` gains a header fallback, `signToken()` gains options, `emitNotifications()` gains a push hook, upload routes gain a `withIdempotency()` wrapper composed inside `withPermission()`. Two new Prisma models (`Device`, `IdempotencyKey`) and one new column (`User.tokenVersion`) are applied with `prisma db push` (this repo has no migrations directory). The web client keeps using cookies and is unaffected.

**Tech Stack:** Next.js 14 App Router · Prisma 5 / PostgreSQL 16 · `jose` (HS256) · Zod 3 · vitest 2 · `firebase-admin` (new runtime dependency, justified by spec D6) · `@asteasolutions/zod-to-openapi` (new dev dependency, justified by spec S8) · `tsx` (already installed) for scripts.

**Spec:** `docs/superpowers/specs/2026-09-02-android-app-architecture-design.md` (§3.2 "Phase 0", §1.1 constraints, §6.4 golden vectors).

## Global Constraints

- All source files live inside `precast-crm/` (the nested Next.js root). Run every `npm`/`npx` command from that directory. Paths below are relative to `precast-crm/` unless they start with `docs/` (which is the repo root `docs/`).
- User-facing error strings stay bilingual **"Uzbek Cyrillic · English"** exactly like the surrounding code (e.g. `"Авторизация талаб қилинади · Authentication required"`). Code identifiers stay English.
- Never change existing response shapes the web reads. Adding fields is fine; renaming or removing is not.
- No `any`. No `@ts-ignore`. `npx tsc --noEmit` must pass after every task.
- Tests: vitest, `environment: "node"`, files under `tests/*.test.ts`, run with `npx vitest run tests/<file>.test.ts`. Mock Prisma with `vi.mock("@/lib/prisma", …)` and auth with `vi.mock("@/lib/auth", …)` as `tests/api-auth.test.ts` does.
- Schema changes are additive only (new models, new nullable/defaulted columns). Apply locally with `npx prisma db push` then `npx prisma generate`. Production applies the same way (see `DEPLOYMENT.md`; the memory note "manual db push" applies).
- Secrets only via env vars. New env vars: `MOBILE_JWT_EXPIRES_IN` (default `30d`), `FIREBASE_SERVICE_ACCOUNT_JSON` (optional; push is a no-op when unset), `MOBILE_MIN_APP_VERSION` (default `0`).
- Commit after every task with an imperative message in the repo's style (`Feat(mobile) · …`, `Fix · …`, `Docs · …`) and the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Commit from the repo root (`c:/Users/aziz/Downloads/precast-crm/precast-crm`), so file paths in `git add` are prefixed `precast-crm/`.

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/auth.ts` (modify) | `signToken(payload, opts)`, `getCurrentUser()` header fallback, `tokenVersion` check |
| `src/middleware.ts` (modify) | accept Bearer for `/api/*`; `Cache-Control: no-store` on `/api/*` |
| `src/app/api/auth/login/route.ts` (modify) | `client: "android"` → mobile token |
| `src/lib/validation.ts` (modify) | `LoginSchema.client`, `DeviceRegisterSchema`, `CalculateBatchSchema` |
| `prisma/schema.prisma` (modify) | `User.tokenVersion`, `User.devices`, `Device`, `IdempotencyKey` |
| `src/app/api/users/me/password/route.ts`, `src/app/api/users/[id]/route.ts` (modify) | bump `tokenVersion` on PIN change / reset / disable |
| `src/lib/push.ts` (create) | FCM sender, lazy `firebase-admin` init, dead-token cleanup |
| `src/lib/notifications.ts` (modify) | call `sendPushForNotifications` after bus emit |
| `src/app/api/devices/route.ts`, `src/app/api/devices/[token]/route.ts` (create) | device registry |
| `src/lib/idempotency.ts` (create) | `withIdempotency()` wrapper |
| 7 upload/comment routes (modify) | wrap with `withIdempotency` |
| `src/lib/inbox-auth.ts`, `src/app/api/inbox/unlock/route.ts` (modify) | header unlock + token in body |
| 4 drawings GET/DELETE routes + `BlenderStatusIndicator.tsx` (modify) | envelope |
| `src/lib/capacity.ts` (create), `src/app/api/orders/capacity/route.ts` (modify) | shared thresholds |
| `src/app/api/mobile/bootstrap/route.ts` (create) | bootstrap |
| `src/app/api/calculate/route.ts` (modify), `src/app/api/calculate/batch/route.ts` + `schema.ts` (create) | live pricing, batch |
| `src/lib/openapi/registry.ts` (create), `scripts/generate-openapi.ts` (create), `docs/api/openapi.json` (generated) | contract |
| `scripts/export-calc-golden.ts` (create), `docs/api/calc-golden.json` (generated) | parity vectors |
| `.env.example`, `../docker-compose.yml`, `../.env.production.example` (modify) | env plumbing |

---

### Task 1: Bearer token support in `getCurrentUser()` and middleware (S1)

**Files:**
- Modify: `src/lib/auth.ts:151-155`
- Modify: `src/middleware.ts:44-52`
- Test: `tests/auth-bearer.test.ts` (create)

**Interfaces:**
- Consumes: `verifyToken(token)`, `loadUserFromPayload(payload)` (both already in `auth.ts`)
- Produces: `getCurrentUser()` now resolves from cookie **or** `Authorization: Bearer <jwt>`; exported helper `bearerFromHeader(value: string | null): string | null`

- [ ] **Step 1: Write the failing test**

Create `tests/auth-bearer.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/headers so getCurrentUser() can be driven without a request.
const cookieStore = { get: vi.fn() };
const headerStore = { get: vi.fn() };
vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
  headers: () => headerStore,
}));

const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

import { signToken, getCurrentUser, bearerFromHeader } from "@/lib/auth";

const dbUser = {
  id: "u1",
  email: "a@b.c",
  name: "Азиз",
  role: "OWNER",
  permissions: ["order.view"],
  isActive: true,
  mustChangePassword: false,
  tokenVersion: 0,
};

beforeEach(() => {
  cookieStore.get.mockReset();
  headerStore.get.mockReset();
  findUnique.mockReset();
  findUnique.mockResolvedValue(dbUser);
});

describe("bearerFromHeader", () => {
  it("extracts the token after 'Bearer '", () => {
    expect(bearerFromHeader("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });
  it("returns null for missing or malformed headers", () => {
    expect(bearerFromHeader(null)).toBeNull();
    expect(bearerFromHeader("Basic xyz")).toBeNull();
    expect(bearerFromHeader("Bearer ")).toBeNull();
  });
});

describe("getCurrentUser with Authorization header", () => {
  it("falls back to the Bearer header when no cookie is present", async () => {
    const token = await signToken({ sub: "u1", email: "a@b.c", name: "Азиз", role: "OWNER" });
    cookieStore.get.mockReturnValue(undefined);
    headerStore.get.mockImplementation((k: string) =>
      k.toLowerCase() === "authorization" ? `Bearer ${token}` : null,
    );
    const u = await getCurrentUser();
    expect(u?.id).toBe("u1");
  });

  it("prefers the cookie when both are present", async () => {
    const cookieTok = await signToken({ sub: "u1", email: "", name: "", role: "OWNER" });
    cookieStore.get.mockReturnValue({ value: cookieTok });
    headerStore.get.mockReturnValue("Bearer not-a-jwt");
    const u = await getCurrentUser();
    expect(u?.id).toBe("u1");
  });

  it("returns null when neither is valid", async () => {
    cookieStore.get.mockReturnValue(undefined);
    headerStore.get.mockReturnValue("Bearer garbage");
    expect(await getCurrentUser()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth-bearer.test.ts`
Expected: FAIL — `bearerFromHeader` is not exported; the Bearer fallback test returns `null`.

- [ ] **Step 3: Implement in `src/lib/auth.ts`**

Change the import on line 3 and replace `getCurrentUser` (lines 151–155):

```ts
import { cookies, headers } from "next/headers";
```

```ts
/** Extract the raw token from an `Authorization: Bearer <jwt>` header value. */
export function bearerFromHeader(value: string | null): string | null {
  if (!value) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(value.trim());
  return m ? m[1] : null;
}

/**
 * Resolve the caller. Cookie first (web), then `Authorization: Bearer`
 * (Android). Both carry the same HS256 JWT; only the transport differs.
 * The mobile client never receives a cookie, so the header path is the
 * only way its requests can authenticate against withPermission routes.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieToken = cookies().get(COOKIE_NAME)?.value;
  if (cookieToken) {
    const u = await loadUserFromPayload(await verifyToken(cookieToken));
    if (u) return u;
  }
  const bearer = bearerFromHeader(headers().get("authorization"));
  if (!bearer) return null;
  return loadUserFromPayload(await verifyToken(bearer));
}
```

Also make `getUserFromRequest` reuse the helper (replace lines 165–168):

```ts
  const bearer = bearerFromHeader(req.headers.get("authorization"));
  if (bearer) {
    return loadUserFromPayload(await verifyToken(bearer));
  }
  return null;
```

- [ ] **Step 4: Update `src/middleware.ts` to accept Bearer for API paths and add `no-store`**

Replace lines 39–52 with:

```ts
  const isApi = pathname.startsWith("/api/");
  const next = () => {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    // Mobile clients cache aggressively by default; every API response is
    // per-user and time-sensitive. The web is unaffected (fetcher already
    // bypasses the HTTP cache via React Query).
    if (isApi) res.headers.set("Cache-Control", "no-store");
    return res;
  };

  if (isPublic(pathname)) return next();

  // Web sends the cookie; Android sends `Authorization: Bearer`. Only API
  // paths accept the header — page routes stay cookie-only so a leaked
  // bearer can never render the HTML shell.
  const cookieToken = req.cookies.get(COOKIE_NAME)?.value;
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerMatch = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
  const token = cookieToken ?? (isApi && bearerMatch ? bearerMatch[1] : undefined);
  if (!token) return redirectToLogin(req);

  try {
    await jwtVerify(token, secret);
    return next();
  } catch {
    return redirectToLogin(req);
  }
```

(The middleware runs on the Edge runtime and cannot import `@/lib/auth`, which pulls Prisma, so the regex is duplicated here on purpose.)

- [ ] **Step 5: Run tests and type-check**

Run: `npx vitest run tests/auth-bearer.test.ts tests/api-auth.test.ts && npx tsc --noEmit`
Expected: all PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add precast-crm/src/lib/auth.ts precast-crm/src/middleware.ts precast-crm/tests/auth-bearer.test.ts
git commit -m "Feat(mobile) · accept Authorization: Bearer on API routes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Mobile token lifetime and `tokenVersion` revocation (S2)

**Files:**
- Modify: `prisma/schema.prisma` (User model, after `telegramUserId`)
- Modify: `src/lib/auth.ts` (`AuthPayload`, `signToken`, `loadUserFromPayload`)
- Modify: `src/lib/validation.ts:61-64` (`LoginSchema`)
- Modify: `src/app/api/auth/login/route.ts:35-41`
- Modify: `src/app/api/users/me/password/route.ts:40-48`
- Modify: `src/app/api/users/[id]/route.ts:115-126`
- Test: `tests/auth-mobile-token.test.ts` (create)

**Interfaces:**
- Produces: `signToken(payload, opts?: { expiresIn?: string; audience?: "mobile"; tokenVersion?: number })`; JWT claims `aud: "mobile"` and `tv: number` on mobile tokens; `LoginSchema.client: "web" | "android"` (default `"web"`); `User.tokenVersion: Int @default(0)`.

- [ ] **Step 1: Add the column**

In `prisma/schema.prisma`, inside `model User`, after `telegramUserId     String?   @unique` add:

```prisma
  // Mobile-session revocation counter. Mobile JWTs carry `tv` = this
  // value at issue time; a mismatch on any request means the token was
  // revoked (PIN change, admin reset, disable). Web cookies carry no
  // `tv` and are unaffected.
  tokenVersion       Int       @default(0)

  // Push-notification devices registered by the Android app.
  devices            Device[]
```

And add the model after `model AppConfig { … }`:

```prisma
// Android push registration. One row per (device, user). A token that
// moves to another user (shared phone) is re-pointed by the PUT route.
model Device {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  fcmToken   String   @unique
  platform   String   // "android"
  appVersion String?
  lastSeenAt DateTime @default(now())
  createdAt  DateTime @default(now())

  @@index([userId])
  @@map("devices")
}
```

Run: `npx prisma db push && npx prisma generate`
Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 2: Write the failing test**

Create `tests/auth-mobile-token.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { decodeJwt } from "jose";

const cookieStore = { get: vi.fn() };
const headerStore = { get: vi.fn() };
vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
  headers: () => headerStore,
}));
const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

import { signToken, getCurrentUser } from "@/lib/auth";
import { LoginSchema } from "@/lib/validation";

const base = { sub: "u1", email: "", name: "Азиз", role: "OWNER" as const };
const dbUser = {
  id: "u1", email: "", name: "Азиз", role: "OWNER", permissions: [],
  isActive: true, mustChangePassword: false, tokenVersion: 3,
};

beforeEach(() => {
  cookieStore.get.mockReturnValue(undefined);
  headerStore.get.mockReset();
  findUnique.mockReset();
  findUnique.mockResolvedValue(dbUser);
});

describe("signToken mobile options", () => {
  it("stamps aud=mobile, tv, and a 30-day expiry", async () => {
    const t = await signToken(base, { expiresIn: "30d", audience: "mobile", tokenVersion: 3 });
    const c = decodeJwt(t);
    expect(c.aud).toBe("mobile");
    expect(c.tv).toBe(3);
    expect((c.exp as number) - (c.iat as number)).toBe(30 * 24 * 3600);
  });
  it("web tokens carry no tv and keep the default expiry", async () => {
    const c = decodeJwt(await signToken(base));
    expect(c.tv).toBeUndefined();
    expect(c.aud).toBeUndefined();
  });
});

describe("tokenVersion enforcement", () => {
  it("accepts a mobile token whose tv matches the user row", async () => {
    const t = await signToken(base, { audience: "mobile", tokenVersion: 3 });
    headerStore.get.mockReturnValue(`Bearer ${t}`);
    expect((await getCurrentUser())?.id).toBe("u1");
  });
  it("rejects a mobile token whose tv is stale", async () => {
    const t = await signToken(base, { audience: "mobile", tokenVersion: 2 });
    headerStore.get.mockReturnValue(`Bearer ${t}`);
    expect(await getCurrentUser()).toBeNull();
  });
  it("still accepts a web token with no tv claim", async () => {
    headerStore.get.mockReturnValue(`Bearer ${await signToken(base)}`);
    expect((await getCurrentUser())?.id).toBe("u1");
  });
});

describe("LoginSchema.client", () => {
  it("defaults to web and accepts android", () => {
    expect(LoginSchema.parse({ loginName: "a", pin: "1234" }).client).toBe("web");
    expect(LoginSchema.parse({ loginName: "a", pin: "1234", client: "android" }).client).toBe("android");
    expect(LoginSchema.safeParse({ loginName: "a", pin: "1234", client: "ios" }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/auth-mobile-token.test.ts`
Expected: FAIL — `signToken` ignores the second argument; `client` is stripped by Zod.

- [ ] **Step 4: Implement `signToken` options and the `tv` check in `src/lib/auth.ts`**

Add after `JWT_EXPIRES_IN` (line 9):

```ts
const MOBILE_JWT_EXPIRES_IN = process.env.MOBILE_JWT_EXPIRES_IN ?? "30d";
export const MOBILE_AUDIENCE = "mobile";
```

Extend `AuthPayload`:

```ts
export interface AuthPayload extends JWTPayload {
  sub: string;
  email: string;
  name: string;
  role: AuthRole;
  /** Mobile only: User.tokenVersion at issue time. Absent on web cookies. */
  tv?: number;
}

export interface SignTokenOptions {
  expiresIn?: string;
  audience?: typeof MOBILE_AUDIENCE;
  tokenVersion?: number;
}

/** Convenience: the options the login route uses for `client: "android"`. */
export function mobileTokenOptions(tokenVersion: number): SignTokenOptions {
  return { expiresIn: MOBILE_JWT_EXPIRES_IN, audience: MOBILE_AUDIENCE, tokenVersion };
}
```

Replace `signToken`:

```ts
export async function signToken(
  payload: Omit<AuthPayload, "iat" | "exp" | "tv">,
  opts: SignTokenOptions = {},
): Promise<string> {
  const claims: JWTPayload = { ...payload };
  if (opts.tokenVersion !== undefined) claims.tv = opts.tokenVersion;
  let jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? JWT_EXPIRES_IN);
  if (opts.audience) jwt = jwt.setAudience(opts.audience);
  return jwt.sign(secretKey);
}
```

Replace `loadUserFromPayload` so it selects and checks `tokenVersion`:

```ts
async function loadUserFromPayload(
  payload: AuthPayload | null,
): Promise<AuthUser | null> {
  if (!payload?.sub) return null;
  const u = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      permissions: true,
      isActive: true,
      mustChangePassword: true,
      tokenVersion: true,
    },
  });
  if (!u) return null;
  // Revocation: a mobile token minted before the last PIN change / admin
  // reset / disable carries a stale `tv` and is rejected outright. Web
  // cookies have no `tv` and skip this (their 7-day TTL is the bound).
  if (typeof payload.tv === "number" && payload.tv !== u.tokenVersion) return null;
  const { tokenVersion: _tv, ...user } = u;
  return user as AuthUser;
}
```

- [ ] **Step 5: Extend `LoginSchema` in `src/lib/validation.ts`**

```ts
export const LoginSchema = z.object({
  loginName: z.string().min(1).max(120),
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
  // "android" mints a long-lived, revocable mobile token (spec D5/S2).
  client: z.enum(["web", "android"]).default("web"),
});
```

- [ ] **Step 6: Mint the mobile token in the login route**

In `src/app/api/auth/login/route.ts` replace lines 35–41:

```ts
  const token = await signToken(
    {
      sub: user.id,
      email: user.email ?? "",
      name: user.name,
      role: user.role,
    },
    body.client === "android" ? mobileTokenOptions(user.tokenVersion) : {},
  );
  // Web keeps the httpOnly cookie. Android holds the body token and
  // never gets a cookie, so a phone cannot render the HTML shell.
  if (body.client === "web") await setAuthCookie(token);
```

and update the import: `import { signToken, verifyPin, setAuthCookie, mobileTokenOptions } from "@/lib/auth";`

- [ ] **Step 7: Bump `tokenVersion` on PIN change, admin reset, and disable**

`src/app/api/users/me/password/route.ts` lines 41–44:

```ts
    await tx.user.update({
      where: { id: user.id },
      data: { pinHash: newHash, mustChangePassword: false, tokenVersion: { increment: 1 } },
    });
```

`src/app/api/users/[id]/route.ts`: in the `isActive` block (line 115) and the `resetPin` block (line 122) add the increment. `updates` is typed as `Prisma.UserUpdateInput` there, so:

```ts
    if (data.isActive !== undefined && data.isActive !== target.isActive) {
      updates.isActive = data.isActive;
      if (!data.isActive) updates.tokenVersion = { increment: 1 }; // revoke phones
      audits.push({ action: data.isActive ? "enabled" : "disabled" });
    }

    if (data.resetPin) {
      updates.pinHash = await hashPin(data.resetPin);
      updates.mustChangePassword = true;
      updates.tokenVersion = { increment: 1 }; // revoke phones
      audits.push({ action: "pin_reset" });
    }
```

- [ ] **Step 8: Run tests and type-check**

Run: `npx vitest run tests/auth-mobile-token.test.ts tests/auth-bearer.test.ts tests/api-auth.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 9: Commit**

```bash
git add precast-crm/prisma/schema.prisma precast-crm/src/lib/auth.ts precast-crm/src/lib/validation.ts precast-crm/src/app/api/auth/login/route.ts precast-crm/src/app/api/users/me/password/route.ts "precast-crm/src/app/api/users/[id]/route.ts" precast-crm/tests/auth-mobile-token.test.ts
git commit -m "Feat(mobile) · 30-day revocable mobile token via client=android

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Push sender module (`src/lib/push.ts`) (S3, part 1)

**Files:**
- Create: `src/lib/push.ts`
- Modify: `package.json` (add `firebase-admin`)
- Test: `tests/push.test.ts` (create)

**Interfaces:**
- Produces: `sendPushToUsers(userIds: string[], data: Record<string, string>): Promise<void>` (never throws; no-op when `FIREBASE_SERVICE_ACCOUNT_JSON` unset); `isPushConfigured(): boolean`; internal `pruneDeadTokens(tokens: string[])`.

- [ ] **Step 1: Install the dependency**

Run: `npm install firebase-admin@^13`
Expected: `package.json` gains `"firebase-admin": "^13.x"`.

- [ ] **Step 2: Write the failing test**

Create `tests/push.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendEachForMulticast = vi.fn();
vi.mock("firebase-admin/app", () => ({
  initializeApp: vi.fn(() => ({})),
  cert: vi.fn((x: unknown) => x),
  getApps: vi.fn(() => []),
}));
vi.mock("firebase-admin/messaging", () => ({
  getMessaging: () => ({ sendEachForMulticast }),
}));

const deviceFindMany = vi.fn();
const deviceDeleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    device: {
      findMany: (...a: unknown[]) => deviceFindMany(...a),
      deleteMany: (...a: unknown[]) => deviceDeleteMany(...a),
    },
  },
}));

const original = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
afterEach(() => { process.env.FIREBASE_SERVICE_ACCOUNT_JSON = original; vi.resetModules(); });
beforeEach(() => {
  sendEachForMulticast.mockReset();
  deviceFindMany.mockReset();
  deviceDeleteMany.mockReset();
});

describe("sendPushToUsers", () => {
  it("is a silent no-op when Firebase is not configured", async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const { sendPushToUsers, isPushConfigured } = await import("@/lib/push");
    expect(isPushConfigured()).toBe(false);
    await sendPushToUsers(["u1"], { type: "ORDER_PLACED" });
    expect(deviceFindMany).not.toHaveBeenCalled();
    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });

  it("sends one multicast to every device of the given users", async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: "p", client_email: "e", private_key: "k" });
    deviceFindMany.mockResolvedValue([{ fcmToken: "t1" }, { fcmToken: "t2" }]);
    sendEachForMulticast.mockResolvedValue({ responses: [{ success: true }, { success: true }], failureCount: 0 });
    const { sendPushToUsers } = await import("@/lib/push");
    await sendPushToUsers(["u1", "u2"], { type: "PAYMENT_CONFIRMED", orderId: "o1" });
    expect(deviceFindMany).toHaveBeenCalledWith({ where: { userId: { in: ["u1", "u2"] } }, select: { fcmToken: true } });
    const msg = sendEachForMulticast.mock.calls[0][0];
    expect(msg.tokens).toEqual(["t1", "t2"]);
    expect(msg.data).toEqual({ type: "PAYMENT_CONFIRMED", orderId: "o1" });
    expect(msg.android.priority).toBe("high");
  });

  it("deletes tokens FCM reports as unregistered", async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: "p", client_email: "e", private_key: "k" });
    deviceFindMany.mockResolvedValue([{ fcmToken: "dead" }, { fcmToken: "alive" }]);
    sendEachForMulticast.mockResolvedValue({
      failureCount: 1,
      responses: [
        { success: false, error: { code: "messaging/registration-token-not-registered" } },
        { success: true },
      ],
    });
    const { sendPushToUsers } = await import("@/lib/push");
    await sendPushToUsers(["u1"], { type: "X" });
    expect(deviceDeleteMany).toHaveBeenCalledWith({ where: { fcmToken: { in: ["dead"] } } });
  });

  it("never throws when FCM fails", async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: "p", client_email: "e", private_key: "k" });
    deviceFindMany.mockResolvedValue([{ fcmToken: "t" }]);
    sendEachForMulticast.mockRejectedValue(new Error("network"));
    const { sendPushToUsers } = await import("@/lib/push");
    await expect(sendPushToUsers(["u1"], { type: "X" })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/push.test.ts`
Expected: FAIL — module `@/lib/push` not found.

- [ ] **Step 4: Implement `src/lib/push.ts`**

```ts
// FCM push sender for the Android app (spec D6 / S3).
//
// Fire-and-forget like recordAudit() and emitNotifications(): never
// throws, logs on failure. When FIREBASE_SERVICE_ACCOUNT_JSON is unset
// every call is a no-op so the web-only deployment keeps working.
//
// Data-only messages: the app renders the notification itself (title/
// body are already Uzbek strings from emitNotifications), routes the
// deep link, and invalidates its cache. High priority so a closed app
// wakes for "payment confirmed" / "order placed".

import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "@/lib/prisma";

const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);
const FCM_MULTICAST_LIMIT = 500;

let app: App | null | undefined; // undefined = not yet attempted

function loadApp(): App | null {
  if (app !== undefined) return app;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    app = null;
    return app;
  }
  try {
    // Accept raw JSON or base64(JSON) — base64 avoids quoting pain in .env.
    const json = raw.trim().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    const creds = JSON.parse(json) as { project_id: string; client_email: string; private_key: string };
    app = getApps()[0] ?? initializeApp({ credential: cert({
      projectId: creds.project_id,
      clientEmail: creds.client_email,
      privateKey: creds.private_key.replace(/\\n/g, "\n"),
    }) });
  } catch (err) {
    console.error("[push] FIREBASE_SERVICE_ACCOUNT_JSON is invalid; push disabled:", err);
    app = null;
  }
  return app;
}

export function isPushConfigured(): boolean {
  return loadApp() !== null;
}

async function pruneDeadTokens(tokens: string[]): Promise<void> {
  if (!tokens.length) return;
  try {
    await prisma.device.deleteMany({ where: { fcmToken: { in: tokens } } });
  } catch (err) {
    console.error("[push] failed to prune dead tokens:", err);
  }
}

/**
 * Send one data message to every registered device of the given users.
 * `data` values must be strings (FCM constraint) — callers stringify.
 */
export async function sendPushToUsers(
  userIds: string[],
  data: Record<string, string>,
): Promise<void> {
  if (!userIds.length) return;
  const fb = loadApp();
  if (!fb) return;
  try {
    const devices = await prisma.device.findMany({
      where: { userId: { in: userIds } },
      select: { fcmToken: true },
    });
    const tokens = devices.map((d) => d.fcmToken);
    if (!tokens.length) return;

    const messaging = getMessaging(fb);
    const dead: string[] = [];
    for (let i = 0; i < tokens.length; i += FCM_MULTICAST_LIMIT) {
      const chunk = tokens.slice(i, i + FCM_MULTICAST_LIMIT);
      const res = await messaging.sendEachForMulticast({
        tokens: chunk,
        data,
        android: { priority: "high" },
      });
      res.responses.forEach((r, idx) => {
        const code = r.error?.code;
        if (!r.success && code && DEAD_TOKEN_CODES.has(code)) dead.push(chunk[idx]);
      });
    }
    await pruneDeadTokens(dead);
  } catch (err) {
    console.error("[push] sendPushToUsers failed:", err);
  }
}
```

- [ ] **Step 5: Run tests and type-check**

Run: `npx vitest run tests/push.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add precast-crm/package.json precast-crm/package-lock.json precast-crm/src/lib/push.ts precast-crm/tests/push.test.ts
git commit -m "Feat(mobile) · FCM push sender with dead-token pruning

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Device registry routes and push fan-out from `emitNotifications` (S3, part 2)

**Files:**
- Modify: `src/lib/validation.ts` (add `DeviceRegisterSchema`)
- Create: `src/app/api/devices/route.ts`
- Create: `src/app/api/devices/[token]/route.ts`
- Modify: `src/lib/notifications.ts:46-63`
- Test: `tests/devices-route.test.ts` (create), `tests/notifications-push.test.ts` (create)

**Interfaces:**
- Consumes: `sendPushToUsers` (Task 3), `withAuth` (existing)
- Produces: `PUT /api/devices { fcmToken, platform:"android", appVersion? }` → `{ id, fcmToken }`; `DELETE /api/devices/[token]` → `{ deleted: boolean }`; FCM data payload `{ type, notificationId, title, body, orderId, paymentId, projectId, commentId, conversationId }` (missing ids sent as `""`).

- [ ] **Step 1: Write the failing tests**

Create `tests/devices-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
const upsert = vi.fn();
const deleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { device: { upsert: (...a: unknown[]) => upsert(...a), deleteMany: (...a: unknown[]) => deleteMany(...a) } },
}));

import { getCurrentUser } from "@/lib/auth";
import { PUT } from "@/app/api/devices/route";
import { DELETE } from "@/app/api/devices/[token]/route";
import { DeviceRegisterSchema } from "@/lib/validation";

const user = { id: "u1", email: "", name: "A", role: "SALES" as const, permissions: [], isActive: true, mustChangePassword: false };

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue(user);
  upsert.mockReset();
  deleteMany.mockReset();
});

const put = (body: unknown) =>
  new NextRequest(new URL("http://localhost/api/devices"), {
    method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  });

describe("DeviceRegisterSchema", () => {
  it("requires fcmToken and platform=android", () => {
    expect(DeviceRegisterSchema.safeParse({ fcmToken: "abc", platform: "android" }).success).toBe(true);
    expect(DeviceRegisterSchema.safeParse({ fcmToken: "", platform: "android" }).success).toBe(false);
    expect(DeviceRegisterSchema.safeParse({ fcmToken: "abc", platform: "ios" }).success).toBe(false);
  });
});

describe("PUT /api/devices", () => {
  it("upserts by token and re-points it to the current user", async () => {
    upsert.mockResolvedValue({ id: "d1", fcmToken: "tok" });
    const res = await PUT(put({ fcmToken: "tok", platform: "android", appVersion: "1.0.0" }), { params: {} });
    expect(res.status).toBe(200);
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ fcmToken: "tok" });
    expect(arg.create.userId).toBe("u1");
    expect(arg.update.userId).toBe("u1");
    expect(arg.update.appVersion).toBe("1.0.0");
    const body = await res.json();
    expect(body.data.fcmToken).toBe("tok");
  });
  it("returns 401 without a session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await PUT(put({ fcmToken: "tok", platform: "android" }), { params: {} });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/devices/[token]", () => {
  it("deletes only the caller's own row", async () => {
    deleteMany.mockResolvedValue({ count: 1 });
    const req = new NextRequest(new URL("http://localhost/api/devices/tok"), { method: "DELETE" });
    const res = await DELETE(req, { params: { token: "tok" } });
    expect(deleteMany).toHaveBeenCalledWith({ where: { fcmToken: "tok", userId: "u1" } });
    expect((await res.json()).data.deleted).toBe(true);
  });
});
```

Create `tests/notifications-push.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();
const $transaction = vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (...a: unknown[]) => $transaction(...(a as [Promise<unknown>[]])), notification: { create: (...a: unknown[]) => create(...a) } },
}));
const emit = vi.fn();
vi.mock("@/lib/notification-bus", () => ({ notificationBus: { emit: (...a: unknown[]) => emit(...a) } }));
const sendPushToUsers = vi.fn(async () => undefined);
vi.mock("@/lib/push", () => ({ sendPushToUsers: (...a: unknown[]) => sendPushToUsers(...a) }));

import { emitNotifications } from "@/lib/notifications";

beforeEach(() => { create.mockReset(); emit.mockReset(); sendPushToUsers.mockClear(); });

describe("emitNotifications push fan-out", () => {
  it("sends one push per created row with string-only data", async () => {
    const now = new Date("2026-09-02T10:00:00Z");
    create.mockImplementation(async (args: { data: { userId: string } }) => ({
      id: `n-${args.data.userId}`, type: "PAYMENT_CONFIRMED", userId: args.data.userId,
      title: "Тўлов тасдиқланди", body: null, orderId: "o1", paymentId: "p1",
      projectId: null, commentId: null, conversationId: null, createdAt: now,
    }));
    await emitNotifications({ type: "PAYMENT_CONFIRMED", userIds: ["u1", "u2"], title: "Тўлов тасдиқланди", orderId: "o1", paymentId: "p1" });
    // Let the fire-and-forget promise settle.
    await new Promise((r) => setTimeout(r, 0));
    expect(sendPushToUsers).toHaveBeenCalledTimes(2);
    const [userIds, data] = sendPushToUsers.mock.calls[0] as [string[], Record<string, string>];
    expect(userIds).toEqual(["u1"]);
    expect(data).toEqual({
      type: "PAYMENT_CONFIRMED", notificationId: "n-u1", title: "Тўлов тасдиқланди", body: "",
      orderId: "o1", paymentId: "p1", projectId: "", commentId: "", conversationId: "",
      createdAt: now.toISOString(),
    });
    expect(emit).toHaveBeenCalledTimes(2); // SSE path unchanged
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/devices-route.test.ts tests/notifications-push.test.ts`
Expected: FAIL — routes/schema missing; `sendPushToUsers` never called.

- [ ] **Step 3: Add the schema to `src/lib/validation.ts`** (after `ChangePinSchema`)

```ts
// ── Mobile push devices ─────────────────────────────────────────
export const DeviceRegisterSchema = z.object({
  fcmToken: z.string().min(1).max(4096),
  platform: z.literal("android"),
  appVersion: z.string().max(40).optional(),
});
```

- [ ] **Step 4: Create `src/app/api/devices/route.ts`**

```ts
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import { DeviceRegisterSchema } from "@/lib/validation";

/**
 * PUT /api/devices — any active user (the Android app, after login and
 * on every FCM token refresh). Upserts by token; a token that belonged
 * to another user (shared phone) is re-pointed to the caller so the
 * previous user stops receiving that phone's notifications.
 */
export const PUT = withAuth(async (req: NextRequest, { user }) => {
  const body = DeviceRegisterSchema.parse(await req.json());
  const device = await prisma.device.upsert({
    where: { fcmToken: body.fcmToken },
    create: {
      userId: user.id,
      fcmToken: body.fcmToken,
      platform: body.platform,
      appVersion: body.appVersion ?? null,
    },
    update: {
      userId: user.id,
      appVersion: body.appVersion ?? null,
      lastSeenAt: new Date(),
    },
    select: { id: true, fcmToken: true },
  });
  return ok(device);
});
```

- [ ] **Step 5: Create `src/app/api/devices/[token]/route.ts`**

```ts
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";

/** DELETE /api/devices/[token] — sign-out on the phone. Scoped to the
 *  caller's own rows so one user cannot unregister another's device. */
export const DELETE = withAuth<{ token: string }>(async (_req: NextRequest, { user, params }) => {
  const res = await prisma.device.deleteMany({
    where: { fcmToken: params.token, userId: user.id },
  });
  return ok({ deleted: res.count > 0 });
});
```

- [ ] **Step 6: Hook push into `src/lib/notifications.ts`**

Add the import and, after the `for (const row of rows) { … }` loop (line 63), the fan-out:

```ts
import { sendPushToUsers } from "@/lib/push";
```

```ts
    // Android push (spec S3). One call per row keeps per-user targeting
    // and lets FCM prune dead tokens per device. Fire-and-forget.
    for (const row of rows) {
      void sendPushToUsers([row.userId], {
        type: row.type,
        notificationId: row.id,
        title: row.title,
        body: row.body ?? "",
        orderId: row.orderId ?? "",
        paymentId: row.paymentId ?? "",
        projectId: row.projectId ?? "",
        commentId: row.commentId ?? "",
        conversationId: row.conversationId ?? "",
        createdAt: row.createdAt.toISOString(),
      });
    }
```

- [ ] **Step 7: Run tests and type-check**

Run: `npx vitest run tests/devices-route.test.ts tests/notifications-push.test.ts tests/push.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 8: Commit**

```bash
git add precast-crm/src/lib/validation.ts precast-crm/src/app/api/devices precast-crm/src/lib/notifications.ts precast-crm/tests/devices-route.test.ts precast-crm/tests/notifications-push.test.ts
git commit -m "Feat(mobile) · device registry + FCM fan-out from emitNotifications

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `withIdempotency()` wrapper (S4, part 1)

**Files:**
- Modify: `prisma/schema.prisma` (add `IdempotencyKey`)
- Create: `src/lib/idempotency.ts`
- Test: `tests/idempotency.test.ts` (create)

**Interfaces:**
- Consumes: `RouteContext<P>` from `src/lib/api-auth.ts` (has `user.id`)
- Produces: `withIdempotency<P>(fn: (req: NextRequest, ctx: RouteContext<P>) => Promise<Response>): (req, ctx) => Promise<Response>`; header name constant `IDEMPOTENCY_HEADER = "idempotency-key"`; replayed responses carry header `Idempotency-Replayed: true`.

- [ ] **Step 1: Add the model to `prisma/schema.prisma`** (after `model Device`)

```prisma
// Replay cache for mobile upload retries (spec S4). Scope = user + key
// so two users can never collide. Rows older than 24 h are pruned lazily
// by withIdempotency(). responseBody is the JSON the route returned.
model IdempotencyKey {
  id             String   @id            // `${userId}:${key}`
  userId         String
  route          String
  status         String   @default("IN_PROGRESS") // IN_PROGRESS | DONE
  responseStatus Int?
  responseBody   Json?
  createdAt      DateTime @default(now())

  @@index([createdAt])
  @@map("idempotency_keys")
}
```

Run: `npx prisma db push && npx prisma generate`

- [ ] **Step 2: Write the failing test**

Create `tests/idempotency.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Row = { id: string; userId: string; route: string; status: string; responseStatus: number | null; responseBody: unknown; createdAt: Date };
const table = new Map<string, Row>();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    idempotencyKey: {
      findUnique: async ({ where }: { where: { id: string } }) => table.get(where.id) ?? null,
      create: async ({ data }: { data: Omit<Row, "createdAt" | "status" | "responseStatus" | "responseBody"> }) => {
        if (table.has(data.id)) {
          const err = Object.assign(new Error("unique"), { code: "P2002" });
          throw err;
        }
        const row: Row = { ...data, status: "IN_PROGRESS", responseStatus: null, responseBody: null, createdAt: new Date() };
        table.set(data.id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = table.get(where.id)!;
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => { table.delete(where.id); },
      deleteMany: async () => ({ count: 0 }),
    },
  },
}));

import { withIdempotency } from "@/lib/idempotency";

const ctx = { user: { id: "u1", email: "", name: "", role: "SALES" as const, permissions: [], isActive: true, mustChangePassword: false }, params: {} };
const req = (key?: string) =>
  new NextRequest(new URL("http://localhost/api/orders/o1/delivery-proof"), {
    method: "POST", headers: key ? { "idempotency-key": key } : {},
  });

beforeEach(() => table.clear());

describe("withIdempotency", () => {
  it("passes through when no header is sent", async () => {
    const inner = vi.fn(async () => Response.json({ ok: true, data: { n: 1 } }));
    const res = await withIdempotency(inner)(req(), ctx);
    expect(inner).toHaveBeenCalledTimes(1);
    expect((await res.json()).data.n).toBe(1);
  });

  it("runs once and replays the stored response for the same user+key", async () => {
    let n = 0;
    const inner = vi.fn(async () => Response.json({ ok: true, data: { n: ++n } }, { status: 201 }));
    const wrapped = withIdempotency(inner);
    const a = await wrapped(req("k1"), ctx);
    const b = await wrapped(req("k1"), ctx);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect((await b.json()).data.n).toBe(1);
    expect(b.headers.get("Idempotency-Replayed")).toBe("true");
  });

  it("scopes keys per user", async () => {
    const inner = vi.fn(async () => Response.json({ ok: true, data: {} }));
    const wrapped = withIdempotency(inner);
    await wrapped(req("k1"), ctx);
    await wrapped(req("k1"), { ...ctx, user: { ...ctx.user, id: "u2" } });
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it("returns 409 while the first attempt is still in progress", async () => {
    table.set("u1:k9", { id: "u1:k9", userId: "u1", route: "/api/x", status: "IN_PROGRESS", responseStatus: null, responseBody: null, createdAt: new Date() });
    const inner = vi.fn(async () => Response.json({ ok: true, data: {} }));
    const res = await withIdempotency(inner)(req("k9"), ctx);
    expect(res.status).toBe(409);
    expect(inner).not.toHaveBeenCalled();
  });

  it("does not cache 5xx so the client can retry", async () => {
    const inner = vi.fn(async () => Response.json({ ok: false, error: "boom" }, { status: 500 }));
    const wrapped = withIdempotency(inner);
    await wrapped(req("k2"), ctx);
    await wrapped(req("k2"), ctx);
    expect(inner).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/idempotency.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/lib/idempotency.ts`**

```ts
// Idempotent retries for mobile uploads (spec D7 / S4).
//
// The Android outbox retries a POST after a dropped connection. Without
// this, a delivery proof or receipt could be recorded twice. The wrapper
// stores the first successful JSON response under (userId, key) for 24 h
// and replays it byte-for-byte on a retry. It composes INSIDE a
// withPermission/withAuth wrapper because it needs ctx.user.
//
//   export const POST = withPermission("order.edit", withIdempotency(async (req, ctx) => …));
//
// Requests without the header are untouched — the web never sends it.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail } from "@/lib/api";
import type { RouteContext } from "@/lib/api-auth";

export const IDEMPOTENCY_HEADER = "idempotency-key";
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_KEY_LEN = 128;

type Fn<P> = (req: NextRequest, ctx: RouteContext<P>) => Promise<Response>;

async function pruneExpired(): Promise<void> {
  try {
    await prisma.idempotencyKey.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - TTL_MS) } },
    });
  } catch (err) {
    console.error("[idempotency] prune failed:", err);
  }
}

function replay(status: number, body: unknown): Response {
  const res = NextResponse.json(body, { status });
  res.headers.set("Idempotency-Replayed", "true");
  return res;
}

export function withIdempotency<P = Record<string, string>>(fn: Fn<P>): Fn<P> {
  return async (req, ctx) => {
    const key = req.headers.get(IDEMPOTENCY_HEADER)?.trim();
    if (!key) return fn(req, ctx);
    if (key.length > MAX_KEY_LEN) {
      return fail("Idempotency-Key жуда узун · Idempotency-Key too long", 400);
    }
    const id = `${ctx.user.id}:${key}`;
    const route = new URL(req.url).pathname;

    const existing = await prisma.idempotencyKey.findUnique({ where: { id } });
    if (existing) {
      if (existing.status === "DONE" && existing.responseStatus !== null) {
        return replay(existing.responseStatus, existing.responseBody);
      }
      return fail("Сўров ҳали бажарилмоқда · Request still in progress", 409, {
        code: "IDEMPOTENT_IN_PROGRESS",
      });
    }

    try {
      await prisma.idempotencyKey.create({ data: { id, userId: ctx.user.id, route } });
    } catch (err) {
      // Lost the race with a concurrent duplicate — it owns the key now.
      if (
        (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") ||
        (err as { code?: string }).code === "P2002"
      ) {
        return fail("Сўров ҳали бажарилмоқда · Request still in progress", 409, {
          code: "IDEMPOTENT_IN_PROGRESS",
        });
      }
      throw err;
    }

    void pruneExpired();

    let res: Response;
    try {
      res = await fn(req, ctx);
    } catch (err) {
      await prisma.idempotencyKey.delete({ where: { id } }).catch(() => undefined);
      throw err;
    }

    // Only cache definitive outcomes. A 5xx means "try again later" and
    // must not be replayed; non-JSON bodies (binary) are not cached either.
    const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
    if (res.status >= 500 || !isJson) {
      await prisma.idempotencyKey.delete({ where: { id } }).catch(() => undefined);
      return res;
    }
    const body = (await res.clone().json()) as Prisma.InputJsonValue;
    await prisma.idempotencyKey.update({
      where: { id },
      data: { status: "DONE", responseStatus: res.status, responseBody: body },
    });
    return res;
  };
}
```

- [ ] **Step 5: Run tests and type-check**

Run: `npx vitest run tests/idempotency.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add precast-crm/prisma/schema.prisma precast-crm/src/lib/idempotency.ts precast-crm/tests/idempotency.test.ts
git commit -m "Feat(mobile) · withIdempotency wrapper backed by idempotency_keys

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Apply `withIdempotency` to the seven upload/comment routes (S4, part 2)

**Files:**
- Modify: `src/app/api/orders/[id]/delivery-proof/route.ts:38-40`
- Modify: `src/app/api/orders/[id]/load/route.ts` (the `withPermission` line)
- Modify: `src/app/api/orders/[id]/loaded-photos/route.ts:14`
- Modify: `src/app/api/orders/[id]/shipments/[sid]/load/route.ts:19-21`
- Modify: `src/app/api/payments/upload-receipt/route.ts:11`
- Modify: `src/app/api/payments/[id]/receipts/route.ts:12`
- Modify: `src/app/api/orders/[id]/comments/route.ts` (the `POST` export)
- Test: `tests/idempotency-routes.test.ts` (create)

**Interfaces:**
- Consumes: `withIdempotency` (Task 5)
- Produces: the seven routes honour `Idempotency-Key`. Handler bodies are unchanged.

- [ ] **Step 1: Write the failing test**

Create `tests/idempotency-routes.test.ts` — a source-level guard so a future edit cannot silently drop the wrapper:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/idempotency-routes.test.ts`
Expected: FAIL for all seven files.

- [ ] **Step 3: Wrap each route**

Pattern (the inner arrow function and its body are untouched; only the `withPermission(` call gains a `withIdempotency(` layer, and the generic moves to the inner wrapper):

`delivery-proof/route.ts` lines 38–40 become:

```ts
import { withIdempotency } from "@/lib/idempotency";
// …
export const POST = withPermission<{ id: string }>(
  "order.edit",
  withIdempotency<{ id: string }>(async (req: NextRequest, { user, params }) => {
```

and the matching closing on the last line changes from `});` to `}));`.

Apply the same to:

- `load/route.ts`: `withPermission<{ id: string }>("order.edit", withIdempotency<{ id: string }>(async (req, { user, params }) => { … }))`
- `loaded-photos/route.ts` line 14: `withPermission<{ id: string }>("order.edit", withIdempotency<{ id: string }>(async (req: NextRequest, { user, params }) => { … }))`
- `shipments/[sid]/load/route.ts`: `withPermission<{ id: string; sid: string }>("dispatch.create", withIdempotency<{ id: string; sid: string }>(async (req, { user, params }) => { … }))`
- `payments/upload-receipt/route.ts` line 11: `withPermission("payment.record", withIdempotency(async (req: NextRequest, { user }) => { … }))`
- `payments/[id]/receipts/route.ts` line 12: `withPermission<{ id: string }>("payment.record", withIdempotency<{ id: string }>(async (req: NextRequest, { user, params }) => { … }))`
- `orders/[id]/comments/route.ts`: only the `POST` export: `withPermission<Params>("order.view", withIdempotency<Params>(async (req: NextRequest, { user, params }) => { … }))`

In each file add `import { withIdempotency } from "@/lib/idempotency";` next to the `withPermission` import.

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run tests/idempotency-routes.test.ts tests/idempotency.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean. (If tsc complains about the generic on `withIdempotency`, the inner handler's `ctx` type must be `RouteContext<P>` — check the closing parenthesis count.)

- [ ] **Step 5: Smoke-run the whole suite**

Run: `npx vitest run`
Expected: all existing tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add "precast-crm/src/app/api/orders/[id]/delivery-proof/route.ts" "precast-crm/src/app/api/orders/[id]/load/route.ts" "precast-crm/src/app/api/orders/[id]/loaded-photos/route.ts" "precast-crm/src/app/api/orders/[id]/shipments/[sid]/load/route.ts" precast-crm/src/app/api/payments/upload-receipt/route.ts "precast-crm/src/app/api/payments/[id]/receipts/route.ts" "precast-crm/src/app/api/orders/[id]/comments/route.ts" precast-crm/tests/idempotency-routes.test.ts
git commit -m "Feat(mobile) · Idempotency-Key on upload and comment routes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Header-based inbox unlock (S5)

**Files:**
- Modify: `src/lib/inbox-auth.ts:21-51`
- Modify: `src/app/api/inbox/unlock/route.ts:20-21`
- Test: `tests/inbox-auth-header.test.ts` (create)

**Interfaces:**
- Produces: `mintInboxUnlockToken(): Promise<string>`; `setInboxUnlockCookie()` now returns the token; `isInboxUnlocked()` also accepts header `X-Inbox-Unlock: <jwt>`; `POST /api/inbox/unlock` returns `{ unlocked: true, token }`; constant `INBOX_UNLOCK_HEADER = "x-inbox-unlock"`.

- [ ] **Step 1: Write the failing test**

Create `tests/inbox-auth-header.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
const headerStore = { get: vi.fn() };
vi.mock("next/headers", () => ({ cookies: () => cookieStore, headers: () => headerStore }));

import { mintInboxUnlockToken, isInboxUnlocked, INBOX_UNLOCK_HEADER } from "@/lib/inbox-auth";

beforeEach(() => { cookieStore.get.mockReturnValue(undefined); headerStore.get.mockReset(); });

describe("isInboxUnlocked via header", () => {
  it("accepts a freshly minted token in X-Inbox-Unlock", async () => {
    const tok = await mintInboxUnlockToken();
    headerStore.get.mockImplementation((k: string) => (k === INBOX_UNLOCK_HEADER ? tok : null));
    expect(await isInboxUnlocked()).toBe(true);
  });
  it("rejects garbage in the header", async () => {
    headerStore.get.mockReturnValue("nope");
    expect(await isInboxUnlocked()).toBe(false);
  });
  it("still honours the cookie", async () => {
    cookieStore.get.mockReturnValue({ value: await mintInboxUnlockToken() });
    headerStore.get.mockReturnValue(null);
    expect(await isInboxUnlocked()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/inbox-auth-header.test.ts`
Expected: FAIL — `mintInboxUnlockToken` / `INBOX_UNLOCK_HEADER` not exported.

- [ ] **Step 3: Implement in `src/lib/inbox-auth.ts`**

Replace lines 1 and 20–51 with:

```ts
import { cookies, headers } from "next/headers";
```

```ts
export const INBOX_UNLOCK_HEADER = "x-inbox-unlock";

/** Mint the 12 h unlock JWT. Shared by the cookie (web) and the header (Android). */
export async function mintInboxUnlockToken(): Promise<string> {
  return new SignJWT({ inbox: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(SECRET);
}

/** Issue the short-lived unlock cookie after a correct password. Returns the
 *  token so the unlock route can also hand it to a cookie-less client. */
export async function setInboxUnlockCookie(): Promise<string> {
  const token = await mintInboxUnlockToken();
  cookies().set(UNLOCK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: UNLOCK_TTL_SECONDS,
  });
  return token;
}

/** Delete the unlock cookie, effectively locking the inbox immediately. */
export function clearInboxUnlockCookie(): void {
  cookies().delete(UNLOCK_COOKIE);
}

async function verifyUnlock(t: string | undefined | null): Promise<boolean> {
  if (!t) return false;
  try {
    await jwtVerify(t, SECRET);
    return true;
  } catch {
    return false;
  }
}

/** True if a valid, unexpired unlock token is present — cookie (web) or
 *  `X-Inbox-Unlock` header (Android, which keeps it in memory only). */
export async function isInboxUnlocked(): Promise<boolean> {
  if (await verifyUnlock(cookies().get(UNLOCK_COOKIE)?.value)) return true;
  return verifyUnlock(headers().get(INBOX_UNLOCK_HEADER));
}
```

- [ ] **Step 4: Return the token from the unlock route**

`src/app/api/inbox/unlock/route.ts` lines 20–21:

```ts
  const token = await setInboxUnlockCookie();
  // The web ignores `token` (cookie does the work); Android sends it back
  // as X-Inbox-Unlock on every inbox request.
  return ok({ unlocked: true, token });
```

- [ ] **Step 5: Run tests and type-check**

Run: `npx vitest run tests/inbox-auth-header.test.ts tests/inbox-auth.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add precast-crm/src/lib/inbox-auth.ts precast-crm/src/app/api/inbox/unlock/route.ts precast-crm/tests/inbox-auth-header.test.ts
git commit -m "Feat(mobile) · inbox unlock via X-Inbox-Unlock header

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Envelope on drawings GET/DELETE routes (S6)

**Files:**
- Modify: `src/app/api/drawings/list/route.ts:19-24, 61`
- Modify: `src/app/api/drawings/status/route.ts:70-74`
- Modify: `src/app/api/drawings/request/[id]/route.ts:32-36`
- Modify: `src/app/api/drawings/request/[id]/delete/route.ts:24-26, 43`
- Modify: `src/components/blender-bridge/BlenderStatusIndicator.tsx:52`
- Test: `tests/drawings-envelope.test.ts` (create)

**Interfaces:**
- Produces: all four routes return `{ok:true,data}` / `{ok:false,error}`; field names inside `data` unchanged. The POST `request` / `request-cad` / `pdf` routes are out of scope (Phase 3; their web callers read custom bodies).

- [ ] **Step 1: Write the failing test**

Create `tests/drawings-envelope.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
const findMany = vi.fn();
const findUnique = vi.fn();
const orderFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    drawingRequest: { findMany: (...a: unknown[]) => findMany(...a), findUnique: (...a: unknown[]) => findUnique(...a) },
    order: { findUnique: (...a: unknown[]) => orderFindUnique(...a) },
  },
}));

import { getCurrentUser } from "@/lib/auth";
import { GET as listGET } from "@/app/api/drawings/list/route";
import { GET as oneGET } from "@/app/api/drawings/request/[id]/route";

const owner = { id: "u1", email: "", name: "", role: "OWNER" as const, permissions: ["blender.bridge"], isActive: true, mustChangePassword: false };
beforeEach(() => { vi.mocked(getCurrentUser).mockResolvedValue(owner); findMany.mockReset(); findUnique.mockReset(); });

describe("drawings routes use the standard envelope", () => {
  it("list wraps rows in data", async () => {
    findMany.mockResolvedValue([{ id: "d1", status: "PENDING" }]);
    const res = await listGET(new NextRequest(new URL("http://localhost/api/drawings/list?projectId=p1")), { params: {} });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data[0].id).toBe("d1");
  });
  it("list returns ok:false on missing ids", async () => {
    const res = await listGET(new NextRequest(new URL("http://localhost/api/drawings/list")), { params: {} });
    expect(res.status).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });
  it("single request wraps the row and 404s with ok:false", async () => {
    findUnique.mockResolvedValue({ id: "d1", status: "DELIVERED" });
    const ok = await oneGET(new NextRequest(new URL("http://localhost/api/drawings/request/d1")), { params: { id: "d1" } });
    expect((await ok.json()).data.status).toBe("DELIVERED");
    findUnique.mockResolvedValue(null);
    const nf = await oneGET(new NextRequest(new URL("http://localhost/api/drawings/request/x")), { params: { id: "x" } });
    expect(nf.status).toBe(404);
    expect((await nf.json()).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/drawings-envelope.test.ts`
Expected: FAIL — `body.ok` is undefined; `body.data` is undefined.

- [ ] **Step 3: Update the four routes**

`list/route.ts`: replace the import of `NextResponse` with `import { ok, fail } from "@/lib/api";`, lines 20–23 become `return fail("orderId ёки projectId керак · Provide orderId or projectId", 400);`, line 61 becomes `return ok(rows);`.

`status/route.ts`: import `ok`; lines 70–74 become:

```ts
    return ok({
      blenderConnected: bridge.connected,
      connectedSince: bridge.connectedSince,
      recentRequests,
    });
```

`request/[id]/route.ts`: import `ok, fail`; line 33 → `return fail("Топилмади · Not found", 404);`, line 36 → `return ok(row);`.

`request/[id]/delete/route.ts`: import `ok, fail`; line 25 → `return fail("Топилмади · Not found", 404);`, line 43 → `return ok({ deleted: true });`.

Remove the now-unused `NextResponse` imports in each file.

- [ ] **Step 4: Update the one web consumer that reads a bare body**

`src/components/blender-bridge/BlenderStatusIndicator.tsx` line 52:

```ts
        const body = (await res.json()) as { ok: boolean; data?: { blenderConnected: boolean } };
        if (alive) setStatus(body.ok && body.data?.blenderConnected ? "connected" : "offline");
```

(`DrawingsSection.tsx` uses `api()` from `fetcher.ts`, which already unwraps `payload.data ?? payload`, and its `DELETE` ignores the body — no change needed.)

- [ ] **Step 5: Run tests and type-check**

Run: `npx vitest run tests/drawings-envelope.test.ts && npx tsc --noEmit && npx next lint --dir src/components/blender-bridge`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add precast-crm/src/app/api/drawings precast-crm/src/components/blender-bridge/BlenderStatusIndicator.tsx precast-crm/tests/drawings-envelope.test.ts
git commit -m "Fix(drawings) · standard {ok,data} envelope on GET/DELETE routes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `GET /api/mobile/bootstrap` and shared capacity thresholds (S7)

**Files:**
- Create: `src/lib/capacity.ts`
- Modify: `src/app/api/orders/capacity/route.ts:69-72`
- Create: `src/app/api/mobile/bootstrap/route.ts`
- Test: `tests/mobile-bootstrap.test.ts` (create)

**Interfaces:**
- Produces: `CAPACITY_THRESHOLDS = { low: 300, moderate: 450, heavy: 600 } as const`; `GET /api/mobile/bootstrap` → `{ me, pricing, capacityThresholds, regionsVersion, minSupportedAppVersion, serverTime }` where `me` matches `GET /api/auth/me` and `pricing` matches `GET /api/pricing`.

- [ ] **Step 1: Write the failing test**

Create `tests/mobile-bootstrap.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/pricing-config", () => ({
  loadPricingConfig: async () => ({
    m2_price_tiers: [{ max_beam_length: 4.3, price: 140000 }],
    extra_beam_price_tiers: [{ max_beam_length: 4.3, price: 60000 }],
    block_unit_price: 6000,
  }),
  loadPricingMeta: async () => ({ updatedAt: null }),
}));

import { getCurrentUser } from "@/lib/auth";
import { GET } from "@/app/api/mobile/bootstrap/route";
import { CAPACITY_THRESHOLDS } from "@/lib/capacity";

const user = { id: "u1", email: "", name: "Азиз", role: "SALES" as const, permissions: ["order.view"], isActive: true, mustChangePassword: false };
const orig = process.env.MOBILE_MIN_APP_VERSION;
beforeEach(() => vi.mocked(getCurrentUser).mockResolvedValue(user));
afterEach(() => { process.env.MOBILE_MIN_APP_VERSION = orig; });

describe("GET /api/mobile/bootstrap", () => {
  it("returns me, pricing, thresholds, regions version and min app version", async () => {
    process.env.MOBILE_MIN_APP_VERSION = "1.2.0";
    const res = await GET(new NextRequest(new URL("http://localhost/api/mobile/bootstrap")), { params: {} });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.me.id).toBe("u1");
    expect(data.me.permissions).toEqual(["order.view"]);
    expect(data.pricing.blockUnitPrice).toBe(6000);
    expect(data.pricing.m2PriceTiers[0]).toEqual({ max_beam_length: 4.3, price: 140000 });
    expect(data.capacityThresholds).toEqual(CAPACITY_THRESHOLDS);
    expect(data.regionsVersion).toMatch(/^\d+-\d+$/);
    expect(data.minSupportedAppVersion).toBe("1.2.0");
    expect(typeof data.serverTime).toBe("string");
  });
  it("defaults minSupportedAppVersion to 0", async () => {
    delete process.env.MOBILE_MIN_APP_VERSION;
    const res = await GET(new NextRequest(new URL("http://localhost/api/mobile/bootstrap")), { params: {} });
    expect((await res.json()).data.minSupportedAppVersion).toBe("0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mobile-bootstrap.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/lib/capacity.ts`**

```ts
// Daily production capacity tiers in m² — the only place these numbers
// live. Used by the capacity calendar route and the mobile bootstrap.
export const CAPACITY_THRESHOLDS = { low: 300, moderate: 450, heavy: 600 } as const;
```

Then in `src/app/api/orders/capacity/route.ts` add `import { CAPACITY_THRESHOLDS } from "@/lib/capacity";` and replace line 72 with `thresholds: CAPACITY_THRESHOLDS,`.

- [ ] **Step 4: Create `src/app/api/mobile/bootstrap/route.ts`**

```ts
export const dynamic = "force-dynamic";

import { ok } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import { loadPricingConfig, loadPricingMeta } from "@/lib/pricing-config";
import { CAPACITY_THRESHOLDS } from "@/lib/capacity";
import { VILOYATS, TUMANS } from "@/lib/regions";

/**
 * GET /api/mobile/bootstrap — any active user.
 *
 * One cold-start round trip for the Android app (spec S7): the session
 * (same shape as /api/auth/me), live pricing (same shape as /api/pricing),
 * the capacity tiers, a regions catalogue version so the app knows when
 * to refresh its bundled copy, and the minimum app version the server
 * still supports (force-upgrade lever, env MOBILE_MIN_APP_VERSION).
 */
export const GET = withAuth(async (_req, { user }) => {
  const [config, meta] = await Promise.all([loadPricingConfig(), loadPricingMeta()]);
  return ok({
    me: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: user.permissions,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
    },
    pricing: {
      m2PriceTiers: config.m2_price_tiers,
      extraBeamPriceTiers: config.extra_beam_price_tiers,
      blockUnitPrice: config.block_unit_price,
      updatedAt: meta.updatedAt,
    },
    capacityThresholds: CAPACITY_THRESHOLDS,
    regionsVersion: `${VILOYATS.length}-${TUMANS.length}`,
    minSupportedAppVersion: process.env.MOBILE_MIN_APP_VERSION ?? "0",
    serverTime: new Date().toISOString(),
  });
});
```

- [ ] **Step 5: Run tests and type-check**

Run: `npx vitest run tests/mobile-bootstrap.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add precast-crm/src/lib/capacity.ts precast-crm/src/app/api/orders/capacity/route.ts precast-crm/src/app/api/mobile precast-crm/tests/mobile-bootstrap.test.ts
git commit -m "Feat(mobile) · GET /api/mobile/bootstrap

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Live pricing in `/api/calculate` and `POST /api/calculate/batch` (S9)

**Files:**
- Modify: `src/app/api/calculate/route.ts:12-20`
- Create: `src/app/api/calculate/batch/schema.ts`
- Create: `src/app/api/calculate/batch/route.ts`
- Test: `tests/calculate-batch.test.ts` (create)

**Interfaces:**
- Consumes: `computeOrderTotals(rooms, opts, pricing)` from `src/lib/order-totals.ts`; `RoomCalcInputSchema` from validation; `loadPricingConfig()`.
- Produces: `CalculateBatchSchema = { rooms: RoomCalcInput[] (1..50), discountPercent=0, discountAmount=0, deliveryCost=0, otherCost=0 }`; response `{ rooms: SlabResult[], roomsSubtotal, totalArea, totalBlocks, totalBeams, discountAmount, resolvedDiscountPercent, discountMode, totalPrice }`.

- [ ] **Step 1: Write the failing test**

Create `tests/calculate-batch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
const loadPricingConfig = vi.fn();
vi.mock("@/lib/pricing-config", () => ({ loadPricingConfig: (...a: unknown[]) => loadPricingConfig(...a) }));

import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_PRICE_CONFIG } from "@/services/calculation-engine";
import { computeOrderTotals } from "@/lib/order-totals";
import { POST } from "@/app/api/calculate/batch/route";
import { CalculateBatchSchema } from "@/app/api/calculate/batch/schema";

const user = { id: "u1", email: "", name: "", role: "SALES" as const, permissions: ["calculator.use"], isActive: true, mustChangePassword: false };
beforeEach(() => { vi.mocked(getCurrentUser).mockResolvedValue(user); loadPricingConfig.mockResolvedValue(DEFAULT_PRICE_CONFIG); });

const post = (body: unknown) => new NextRequest(new URL("http://localhost/api/calculate/batch"), {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
});

describe("CalculateBatchSchema", () => {
  it("requires at least one room and defaults the money fields", () => {
    const p = CalculateBatchSchema.parse({ rooms: [{ innerWidth: 4.2, innerLength: 6.1 }] });
    expect(p.discountPercent).toBe(0);
    expect(p.deliveryCost).toBe(0);
    expect(CalculateBatchSchema.safeParse({ rooms: [] }).success).toBe(false);
  });
});

describe("POST /api/calculate/batch", () => {
  it("matches computeOrderTotals exactly under live pricing", async () => {
    const rooms = [{ innerWidth: 4.2, innerLength: 6.1 }, { innerWidth: 3.6, innerLength: 5 }];
    const res = await POST(post({ rooms, discountPercent: 5, deliveryCost: 200000 }), { params: {} });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const expected = computeOrderTotals(rooms, { discountPercent: 5, discountAmount: 0, deliveryCost: 200000, otherCost: 0 }, DEFAULT_PRICE_CONFIG);
    expect(data.totalPrice).toBe(expected.totalPrice);
    expect(data.roomsSubtotal).toBe(expected.roomsSubtotal);
    expect(data.rooms[0].beam_count).toBe(expected.computed[0].result.beam_count);
    expect(data.discountMode).toBe("PERCENT");
  });
  it("uses the DB pricing, not the hard-coded defaults", async () => {
    loadPricingConfig.mockResolvedValue({
      ...DEFAULT_PRICE_CONFIG,
      m2_price_tiers: DEFAULT_PRICE_CONFIG.m2_price_tiers.map((t) => ({ ...t, price: t.price * 2 })),
    });
    const res = await POST(post({ rooms: [{ innerWidth: 4.2, innerLength: 6.1 }] }), { params: {} });
    const { data } = await res.json();
    expect(data.rooms[0].m2_price).toBe(DEFAULT_PRICE_CONFIG.m2_price_tiers[0].price * 2);
  });
  it("returns 403 without calculator.use", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...user, permissions: [] });
    const res = await POST(post({ rooms: [{ innerWidth: 4.2, innerLength: 6.1 }] }), { params: {} });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/calculate-batch.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Fix the single-room route to use live pricing**

`src/app/api/calculate/route.ts`: add `import { loadPricingConfig } from "@/lib/pricing-config";` and change lines 12–20 to:

```ts
  // Live tiers, same as /api/projects and /api/orders. Previously this
  // route silently billed at DEFAULT_PRICE_CONFIG (spec S9).
  const pricing = await loadPricingConfig();
  const result = calculateSlab(
    {
      inner_width: body.innerWidth,
      inner_length: body.innerLength,
      bearing: body.bearing,
      correction: body.correction,
      extra_beams: body.extraBeams,
      force_start_beam: body.forceStartBeam,
      pattern: body.patternOverride ?? undefined,
    },
    pricing,
  );
```

- [ ] **Step 4: Create `src/app/api/calculate/batch/schema.ts`**

```ts
import { z } from "zod";
import { RoomCalcInputSchema } from "@/lib/validation";

// Kept out of route.ts because the App Router forbids non-route exports.
export const CalculateBatchSchema = z.object({
  rooms: z.array(RoomCalcInputSchema).min(1).max(50),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  discountAmount: z.coerce.number().min(0).default(0),
  deliveryCost: z.coerce.number().min(0).default(0),
  otherCost: z.coerce.number().min(0).default(0),
});
export type CalculateBatchInput = z.infer<typeof CalculateBatchSchema>;
```

- [ ] **Step 5: Create `src/app/api/calculate/batch/route.ts`**

```ts
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { loadPricingConfig } from "@/lib/pricing-config";
import { computeOrderTotals } from "@/lib/order-totals";
import { CalculateBatchSchema } from "./schema";

/**
 * POST /api/calculate/batch — calculator.use
 *
 * Server-side quote for a whole project: every room through the engine
 * at live pricing plus the discount/delivery roll-up, exactly as
 * /api/orders would price it. Persists nothing. The Android app ports
 * the engine and uses this route as its parity oracle (spec S9 / §6.4).
 */
export const POST = withPermission("calculator.use", async (req: NextRequest) => {
  const body = CalculateBatchSchema.parse(await req.json());
  const pricing = await loadPricingConfig();
  const totals = computeOrderTotals(
    body.rooms,
    {
      discountPercent: body.discountPercent,
      discountAmount: body.discountAmount,
      deliveryCost: body.deliveryCost,
      otherCost: body.otherCost,
    },
    pricing,
  );
  return ok({
    rooms: totals.computed.map((c) => c.result),
    roomsSubtotal: totals.roomsSubtotal,
    totalArea: totals.totalArea,
    totalBlocks: totals.totalBlocks,
    totalBeams: totals.totalBeams,
    discountAmount: totals.discountAmount,
    resolvedDiscountPercent: totals.resolvedDiscountPercent,
    discountMode: totals.discountMode,
    totalPrice: totals.totalPrice,
  });
});
```

- [ ] **Step 6: Run tests and type-check**

Run: `npx vitest run tests/calculate-batch.test.ts tests/order-totals.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 7: Commit**

```bash
git add precast-crm/src/app/api/calculate precast-crm/tests/calculate-batch.test.ts
git commit -m "Feat(calc) · live pricing in /api/calculate + POST /api/calculate/batch

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Golden calculation vectors (`docs/api/calc-golden.json`) (§6.4)

**Files:**
- Create: `scripts/export-calc-golden.ts`
- Create (generated): `docs/api/calc-golden.json` (repo-root `docs/`)
- Modify: `package.json` scripts
- Test: `tests/calc-golden.test.ts` (create)

**Interfaces:**
- Produces: JSON `{ version: 1, pricing: PriceConfig, cases: [{ name, input: SlabInput, result: SlabResult }] }`; npm script `golden:calc`. The Kotlin `:core:calc` test suite replays this file.

- [ ] **Step 1: Write the failing test**

Create `tests/calc-golden.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { GOLDEN_CASES, buildGolden } from "../scripts/export-calc-golden";
import { calculateSlab, DEFAULT_PRICE_CONFIG } from "@/services/calculation-engine";

describe("calc golden vectors", () => {
  it("covers every pattern, extras-only, overrides, and the BLENDER_CALC_SPEC cases", () => {
    const names = GOLDEN_CASES.map((c) => c.name).join("\n");
    expect(names).toMatch(/GB/);
    expect(names).toMatch(/BGB/);
    expect(names).toMatch(/GBG/);
    expect(names).toMatch(/extras-only/);
    expect(names).toMatch(/spec-test-1/);
    expect(GOLDEN_CASES.length).toBeGreaterThanOrEqual(25);
  });
  it("results are reproducible from the engine", () => {
    const g = buildGolden();
    for (const c of g.cases) {
      expect(calculateSlab(c.input, DEFAULT_PRICE_CONFIG)).toEqual(c.result);
    }
    expect(g.pricing).toEqual(DEFAULT_PRICE_CONFIG);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/calc-golden.test.ts`
Expected: FAIL — script module not found.

- [ ] **Step 3: Create `scripts/export-calc-golden.ts`**

```ts
// Export deterministic engine vectors so the Kotlin port (Android
// :core:calc) can assert bit-for-bit parity. Run: npm run golden:calc
//
// Cases: the numbered tests in BLENDER_CALC_SPEC.md, one per pattern
// branch of autoPickPattern, start-beam promotions, manual extras,
// correction, extras-only mode, and a bearing sweep. Add a case here
// whenever a rule changes; the Android suite fails until it is ported.

import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import {
  calculateSlab,
  DEFAULT_PRICE_CONFIG,
  type SlabInput,
  type SlabResult,
  type PriceConfig,
} from "../src/services/calculation-engine";

export interface GoldenCase { name: string; input: SlabInput; result: SlabResult }
export interface GoldenFile { version: 1; pricing: PriceConfig; cases: GoldenCase[] }

const inputs: Array<{ name: string; input: SlabInput }> = [
  // BLENDER_CALC_SPEC.md verification tests (Tests 1–5)
  { name: "spec-test-1 plain GB", input: { inner_width: 4.0, inner_length: 5.8 } },
  { name: "spec-test-2 BGB small remainder", input: { inner_width: 4.0, inner_length: 5.95 } },
  { name: "spec-test-3 GBG medium remainder", input: { inner_width: 4.0, inner_length: 6.2 } },
  { name: "spec-test-4 large remainder bumps pitches", input: { inner_width: 4.0, inner_length: 6.7 } },
  { name: "spec-test-5 correction", input: { inner_width: 4.0, inner_length: 5.8, correction: 0.15 } },
  // Pattern overrides
  { name: "override GB on GBG geometry", input: { inner_width: 4.2, inner_length: 6.2, pattern: "GB" } },
  { name: "override BGB on GB geometry", input: { inner_width: 4.2, inner_length: 5.8, pattern: "BGB" } },
  { name: "override GBG on GB geometry", input: { inner_width: 4.2, inner_length: 5.8, pattern: "GBG" } },
  // Start-beam promotions
  { name: "force_start_beam on GBG", input: { inner_width: 3.6, inner_length: 6.2, force_start_beam: true } },
  { name: "force_start_beam on GB", input: { inner_width: 3.6, inner_length: 5.8, force_start_beam: true } },
  { name: "force_start_beam on BGB no-op", input: { inner_width: 3.6, inner_length: 5.95, force_start_beam: true } },
  // Manual extras
  { name: "GB + 2 extra beams", input: { inner_width: 5.0, inner_length: 5.8, extra_beams: 2 } },
  { name: "GBG + 1 extra consumed by start promotion", input: { inner_width: 5.0, inner_length: 6.2, extra_beams: 1 } },
  // Bearing sweep (tier boundaries)
  { name: "bearing 0.10 tier 4.30", input: { inner_width: 4.1, inner_length: 5.0, bearing: 0.10 } },
  { name: "bearing 0.15 tier 4.30 boundary", input: { inner_width: 4.0, inner_length: 5.0 } },
  { name: "bearing 0.15 tier 5.30", input: { inner_width: 5.0, inner_length: 5.0 } },
  { name: "bearing 0.15 tier 6.30", input: { inner_width: 6.0, inner_length: 5.0 } },
  { name: "bearing 0.15 tier 7.30", input: { inner_width: 7.0, inner_length: 5.0 } },
  { name: "bearing 0.15 tier 8.30", input: { inner_width: 8.0, inner_length: 5.0 } },
  { name: "beyond last tier clamps", input: { inner_width: 9.0, inner_length: 5.0 } },
  { name: "bearing 0.20", input: { inner_width: 4.0, inner_length: 5.0, bearing: 0.20 } },
  // Extras-only mode
  { name: "extras-only 3 beams 4.5m", input: { inner_width: 4.2, inner_length: 0, extra_beams: 3 } },
  { name: "extras-only 1 beam 6.0m", input: { inner_width: 5.7, inner_length: 0, extra_beams: 1 } },
  // Rounding edge cases
  { name: "half-away rounding length", input: { inner_width: 3.335, inner_length: 4.6455 } },
  { name: "tiny room", input: { inner_width: 1.0, inner_length: 1.0 } },
  { name: "long room many pitches", input: { inner_width: 4.0, inner_length: 12.0 } },
];

export const GOLDEN_CASES = inputs;

export function buildGolden(): GoldenFile {
  return {
    version: 1,
    pricing: DEFAULT_PRICE_CONFIG,
    cases: inputs.map((c) => ({
      name: c.name,
      input: c.input,
      result: calculateSlab(c.input, DEFAULT_PRICE_CONFIG),
    })),
  };
}

if (require.main === module) {
  const out = path.resolve(__dirname, "../../docs/api/calc-golden.json");
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(buildGolden(), null, 2) + "\n");
  console.log(`wrote ${out}`);
}
```

All inputs are valid for `calculateSlab`: every case has `inner_length > 0` except the two extras-only cases, which the engine accepts because `extra_beams >= 1` (calculation-engine.ts:247). `calculateSlab(input, priceConfig)` is the exact signature (line 267).

- [ ] **Step 4: Add the npm script and generate the file**

In `package.json` scripts add `"golden:calc": "tsx scripts/export-calc-golden.ts"`. Run: `npm run golden:calc`
Expected: `docs/api/calc-golden.json` written at the repo root with ≥25 cases.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/calc-golden.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add precast-crm/scripts/export-calc-golden.ts precast-crm/package.json precast-crm/tests/calc-golden.test.ts docs/api/calc-golden.json
git commit -m "Feat(calc) · export golden engine vectors for the Android port

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: OpenAPI contract for the Phase 1 surface (S8)

**Files:**
- Create: `src/lib/openapi/registry.ts`
- Create: `scripts/generate-openapi.ts`
- Create (generated): `docs/api/openapi.json`
- Modify: `package.json` (dev dependency + scripts)
- Test: `tests/openapi.test.ts` (create)

**Interfaces:**
- Produces: `buildOpenApiDocument(): OpenAPIObject` covering the routes the Phase 1 app consumes; npm scripts `openapi:generate` and `openapi:check` (CI fails if the committed file is stale). Scope is explicitly the Phase 1 surface; later phases register their routes when they need them.

- [ ] **Step 1: Install the dev dependency**

Run: `npm install --save-dev @asteasolutions/zod-to-openapi@^7`

- [ ] **Step 2: Write the failing test**

Create `tests/openapi.test.ts`:

```ts
import { describe, it, expect } from "vitest";
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
    ]) {
      expect(paths, `missing ${p}`).toContain(p);
    }
  });
  it("uses bearer auth and the standard envelope", () => {
    expect(doc.components?.securitySchemes?.bearerAuth).toBeDefined();
    expect(doc.components?.schemas?.ApiError).toBeDefined();
    const login = doc.paths?.["/api/auth/login"]?.post;
    expect(login?.security).toEqual([]); // public
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/openapi.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Create `src/lib/openapi/registry.ts`**

```ts
// OpenAPI 3.1 document for the surface the Android app consumes (spec S8).
// Request bodies come straight from the Zod schemas the routes parse, so
// the contract cannot drift from validation. Response schemas are
// declared here as loosely-typed envelopes where the route builds ad-hoc
// Prisma selects; tighten them as the Kotlin models firm up.
//
// Regenerate: npm run openapi:generate   ·   Verify in CI: npm run openapi:check

import { z } from "zod";
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import {
  LoginSchema, ChangePinSchema, DeviceRegisterSchema, ClientCreateSchema, ClientUpdateSchema,
  PlaceOrderSchema, OrderUpdateSchema, PaymentRecordSchema, PaymentConfirmSchema,
  PaymentRejectSchema, CommentCreateSchema, DriverCreateSchema, OrderStatusEnum,
  OrderPaymentStateEnum, PaymentStatusEnum, PaymentMethodEnum, RoleEnum,
} from "@/lib/validation";
import { CalculateBatchSchema } from "@/app/api/calculate/batch/schema";

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http", scheme: "bearer", bearerFormat: "JWT",
});

const ApiError = registry.register("ApiError", z.object({
  ok: z.literal(false),
  error: z.string().describe("Bilingual 'Uzbek · English' message"),
  details: z.unknown().optional(),
}));

const Money = z.string().regex(/^-?\d+(\.\d{1,2})?$/).describe("Decimal UZS serialised as a string, e.g. \"1250000.00\"");

const Me = registry.register("Me", z.object({
  id: z.string(), email: z.string().nullable(), name: z.string(), role: RoleEnum,
  permissions: z.array(z.string()), isActive: z.boolean(), mustChangePassword: z.boolean(),
}));

const Pricing = registry.register("Pricing", z.object({
  m2PriceTiers: z.array(z.object({ max_beam_length: z.number(), price: z.number() })),
  extraBeamPriceTiers: z.array(z.object({ max_beam_length: z.number(), price: z.number() })),
  blockUnitPrice: z.number(),
  updatedAt: z.string().nullable(),
}));

const OrderListItem = registry.register("OrderListItem", z.object({
  id: z.string(), orderNumber: z.string(), status: OrderStatusEnum, paymentState: OrderPaymentStateEnum,
  totalPrice: Money, confirmedPaid: Money, totalArea: z.string(), totalBlocks: z.number(), totalBeams: z.number(),
  scheduledAt: z.string(), placedAt: z.string(),
  client: z.object({ id: z.string(), name: z.string(), phone: z.string(), address: z.string().nullable() }),
}).passthrough());

const Notification = registry.register("Notification", z.object({
  id: z.string(), type: z.string(), title: z.string(), body: z.string().nullable(),
  orderId: z.string().nullable(), paymentId: z.string().nullable(), projectId: z.string().nullable(),
  commentId: z.string().nullable(), conversationId: z.string().nullable(),
  createdAt: z.string(), readAt: z.string().nullable(),
}));

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ ok: z.literal(true), data });
}
const Any = z.object({}).passthrough();
const bearer = [{ bearerAuth: [] }];

function json<T extends z.ZodTypeAny>(schema: T) {
  return { content: { "application/json": { schema } } };
}
const errors = {
  401: { description: "No session", ...json(ApiError) },
  403: { description: "Disabled or missing permission", ...json(ApiError) },
  422: { description: "Validation failed", ...json(ApiError) },
};
const multipart = (fields: Record<string, z.ZodTypeAny>) => ({
  content: { "multipart/form-data": { schema: z.object(fields) } },
});
const File = z.string().openapi({ format: "binary" });
const idem = z.string().max(128).optional().openapi({ param: { name: "Idempotency-Key", in: "header" } });

// ── Auth ────────────────────────────────────────────────────────
registry.registerPath({ method: "post", path: "/api/auth/login", security: [], request: { body: json(LoginSchema) },
  responses: { 200: { description: "Session", ...json(envelope(z.object({ token: z.string(), user: Me.omit({ isActive: true }), redirectTo: z.string() }))) }, 401: errors[401], 403: errors[403] } });
registry.registerPath({ method: "get", path: "/api/auth/me", security: bearer, responses: { 200: { description: "Me", ...json(envelope(Me)) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/users/me/password", security: bearer, request: { body: json(ChangePinSchema) }, responses: { 200: { description: "Changed", ...json(envelope(z.object({ changed: z.literal(true) }))) }, ...errors } });
registry.registerPath({ method: "get", path: "/api/mobile/bootstrap", security: bearer, responses: { 200: { description: "Bootstrap", ...json(envelope(z.object({
  me: Me, pricing: Pricing, capacityThresholds: z.object({ low: z.number(), moderate: z.number(), heavy: z.number() }),
  regionsVersion: z.string(), minSupportedAppVersion: z.string(), serverTime: z.string() }))) }, ...errors } });
registry.registerPath({ method: "put", path: "/api/devices", security: bearer, request: { body: json(DeviceRegisterSchema) }, responses: { 200: { description: "Registered", ...json(envelope(z.object({ id: z.string(), fcmToken: z.string() }))) }, ...errors } });
registry.registerPath({ method: "delete", path: "/api/devices/{token}", security: bearer, request: { params: z.object({ token: z.string() }) }, responses: { 200: { description: "Deleted", ...json(envelope(z.object({ deleted: z.boolean() }))) }, ...errors } });
registry.registerPath({ method: "get", path: "/api/pricing", security: bearer, responses: { 200: { description: "Pricing", ...json(envelope(Pricing)) }, ...errors } });

// ── Orders ──────────────────────────────────────────────────────
registry.registerPath({ method: "get", path: "/api/orders", security: bearer,
  request: { query: z.object({ q: z.string().optional(), status: OrderStatusEnum.optional(), day: z.string().optional(), page: z.number().int().optional(), pageSize: z.number().int().max(100).optional() }) },
  responses: { 200: { description: "Page", ...json(envelope(z.object({ items: z.array(OrderListItem), total: z.number(), page: z.number(), pageSize: z.number(), totalPages: z.number() }))) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/orders", security: bearer, request: { body: json(PlaceOrderSchema) }, responses: { 201: { description: "Order", ...json(envelope(Any)) }, ...errors, 409: { description: "Already placed", ...json(ApiError) } } });
registry.registerPath({ method: "get", path: "/api/orders/capacity", security: bearer, request: { query: z.object({ from: z.string(), to: z.string() }) },
  responses: { 200: { description: "Days", ...json(envelope(z.object({ days: z.array(z.object({ date: z.string(), totalArea: z.number(), totalOrders: z.number(), totalBlocks: z.number() })), thresholds: z.object({ low: z.number(), moderate: z.number(), heavy: z.number() }) }))) }, ...errors } });
registry.registerPath({ method: "get", path: "/api/orders/{id}", security: bearer, request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: "Order aggregate", ...json(envelope(Any)) }, 404: { description: "Not found", ...json(ApiError) }, ...errors } });
registry.registerPath({ method: "patch", path: "/api/orders/{id}", security: bearer, request: { params: z.object({ id: z.string() }), body: json(OrderUpdateSchema) }, responses: { 200: { description: "Order", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/orders/{id}/load", security: bearer, request: { params: z.object({ id: z.string() }), headers: z.object({ "Idempotency-Key": idem }), body: multipart({ file: File }) }, responses: { 200: { description: "Loaded", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/orders/{id}/loaded-photos", security: bearer, request: { params: z.object({ id: z.string() }), headers: z.object({ "Idempotency-Key": idem }), body: multipart({ file: File }) }, responses: { 201: { description: "Photo", ...json(envelope(z.object({ id: z.string(), url: z.string(), uploadedAt: z.string() }))) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/orders/{id}/delivery-proof", security: bearer, request: { params: z.object({ id: z.string() }), headers: z.object({ "Idempotency-Key": idem }),
  body: multipart({ file: File, cashAmount: z.string().optional(), noCashCollected: z.enum(["true", "false"]).optional(), noCashCollectedNote: z.string().optional(), driverReturned: z.enum(["true", "false"]).optional() }) },
  responses: { 200: { description: "Delivered", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/orders/{id}/shipments", security: bearer, request: { params: z.object({ id: z.string() }) }, responses: { 201: { description: "Shipment", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/orders/{id}/shipments/{sid}/load", security: bearer, request: { params: z.object({ id: z.string(), sid: z.string() }), headers: z.object({ "Idempotency-Key": idem }),
  body: multipart({ file: File, loadedBeams: z.string().describe("JSON Record<beamLength,count>"), loadedBlocks: z.string() }) }, responses: { 200: { description: "Loaded", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/orders/{id}/shipments/{sid}/dispatch", security: bearer, request: { params: z.object({ id: z.string(), sid: z.string() }),
  body: json(z.object({ driverId: z.string().optional(), truckIdentifier: z.string().optional(), driverWillCollectCash: z.boolean().optional(), cashToCollect: z.number().optional(), notes: z.string().optional() })) }, responses: { 200: { description: "Dispatched", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/orders/{id}/shipments/{sid}/deliver", security: bearer, request: { params: z.object({ id: z.string(), sid: z.string() }) }, responses: { 200: { description: "Delivered", ...json(envelope(z.object({ delivered: z.literal(true) }))) }, ...errors } });
registry.registerPath({ method: "get", path: "/api/orders/{id}/comments", security: bearer, request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: "Comments", ...json(envelope(z.array(Any))) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/orders/{id}/comments", security: bearer, request: { params: z.object({ id: z.string() }), headers: z.object({ "Idempotency-Key": idem }), body: json(CommentCreateSchema) }, responses: { 201: { description: "Comment", ...json(envelope(Any)) }, ...errors } });

// ── Payments ────────────────────────────────────────────────────
registry.registerPath({ method: "get", path: "/api/payments", security: bearer, request: { query: z.object({ orderId: z.string().optional(), status: PaymentStatusEnum.optional() }) }, responses: { 200: { description: "Payments", ...json(envelope(z.array(Any))) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/payments", security: bearer, request: { body: json(PaymentRecordSchema) }, responses: { 201: { description: "Payment", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/payments/{id}/confirm", security: bearer, request: { params: z.object({ id: z.string() }), body: json(PaymentConfirmSchema) }, responses: { 200: { description: "Confirmed", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/payments/{id}/reject", security: bearer, request: { params: z.object({ id: z.string() }), body: json(PaymentRejectSchema) }, responses: { 200: { description: "Rejected", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/payments/upload-receipt", security: bearer, request: { headers: z.object({ "Idempotency-Key": idem }), body: multipart({ file: File }) }, responses: { 200: { description: "Stored", ...json(envelope(z.object({ url: z.string() }))) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/payments/{id}/receipts", security: bearer, request: { params: z.object({ id: z.string() }), headers: z.object({ "Idempotency-Key": idem }), body: multipart({ file: File }) }, responses: { 200: { description: "Receipt", ...json(envelope(z.object({ id: z.string(), imageUrl: z.string() }))) }, ...errors } });

// ── Clients / drivers / notifications / gallery / calc ─────────
registry.registerPath({ method: "get", path: "/api/clients", security: bearer, request: { query: z.object({ q: z.string().optional(), phone: z.string().optional(), viloyat: z.string().optional(), page: z.number().int().optional(), pageSize: z.number().int().optional(), sortBy: z.string().optional(), sortDir: z.enum(["asc", "desc"]).optional() }) },
  responses: { 200: { description: "Page (when ?page given) or bare array", ...json(envelope(z.union([z.array(Any), z.object({ rows: z.array(Any), total: z.number(), page: z.number(), pageSize: z.number(), pageCount: z.number(), sources: z.array(z.string()) })]))) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/clients", security: bearer, request: { body: json(ClientCreateSchema) }, responses: { 201: { description: "Client", ...json(envelope(Any)) }, 200: { description: "Existing client (same phone)", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "get", path: "/api/clients/{id}", security: bearer, request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: "Client", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "patch", path: "/api/clients/{id}", security: bearer, request: { params: z.object({ id: z.string() }), body: json(ClientUpdateSchema) }, responses: { 200: { description: "Client", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "get", path: "/api/drivers", security: bearer, request: { query: z.object({ activeOnly: z.enum(["true", "false"]).optional() }) }, responses: { 200: { description: "Drivers", ...json(envelope(z.array(Any))) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/drivers", security: bearer, request: { body: json(DriverCreateSchema) }, responses: { 201: { description: "Driver", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "get", path: "/api/notifications", security: bearer, request: { query: z.object({ limit: z.number().int().optional(), unreadOnly: z.enum(["true", "false"]).optional() }) }, responses: { 200: { description: "Feed", ...json(envelope(z.object({ items: z.array(Notification), unreadCount: z.number() }))) }, ...errors } });
registry.registerPath({ method: "patch", path: "/api/notifications/{id}", security: bearer, request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: "Read", ...json(envelope(z.object({ ok: z.literal(true) }))) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/notifications/read-all", security: bearer, responses: { 200: { description: "Read all", ...json(envelope(z.object({ ok: z.literal(true) }))) }, ...errors } });
registry.registerPath({ method: "get", path: "/api/gallery", security: bearer, request: { query: z.object({ page: z.number().int().optional(), pageSize: z.number().int().max(48).optional(), kind: z.enum(["LOADED", "DELIVERY_PROOF", "SHIPMENT_LOADED"]).optional(), clientId: z.string().optional(), from: z.string().optional(), to: z.string().optional(), q: z.string().optional() }) },
  responses: { 200: { description: "Posts", ...json(envelope(z.object({ posts: z.array(Any), total: z.number(), photoTotal: z.number(), page: z.number(), pageSize: z.number(), pageCount: z.number() }))) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/calculate/batch", security: bearer, request: { body: json(CalculateBatchSchema) }, responses: { 200: { description: "Totals", ...json(envelope(Any)) }, ...errors } });

// Keep these referenced so tree-shaking never drops the enum components.
registry.register("PaymentMethod", PaymentMethodEnum);

export function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: { title: "EtalonSlabs CRM API — mobile surface", version: "1.0.0" },
    servers: [{ url: "https://etalontbm.uz" }],
  });
}
```

Every imported name exists in `src/lib/validation.ts` under exactly that name (verified: `LoginSchema`, `ChangePinSchema`, `DeviceRegisterSchema` (added in Task 4), `ClientCreateSchema`, `ClientUpdateSchema`, `PlaceOrderSchema`, `OrderUpdateSchema`, `PaymentRecordSchema`, `PaymentConfirmSchema`, `PaymentRejectSchema`, `CommentCreateSchema`, `DriverCreateSchema`, and the enums).

- [ ] **Step 5: Create `scripts/generate-openapi.ts`**

```ts
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
```

Add to `package.json` scripts:

```json
"openapi:generate": "tsx scripts/generate-openapi.ts",
"openapi:check": "tsx scripts/generate-openapi.ts --check"
```

- [ ] **Step 6: Generate, test, type-check**

Run: `npm run openapi:generate && npm run openapi:check && npx vitest run tests/openapi.test.ts && npx tsc --noEmit`
Expected: file written, check passes, tests PASS, tsc clean.

- [ ] **Step 7: Commit**

```bash
git add precast-crm/package.json precast-crm/package-lock.json precast-crm/src/lib/openapi precast-crm/scripts/generate-openapi.ts precast-crm/tests/openapi.test.ts docs/api/openapi.json
git commit -m "Feat(api) · OpenAPI contract for the Android Phase 1 surface

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Environment plumbing and deploy notes

**Files:**
- Modify: `.env.example`
- Modify: `../docker-compose.yml` (app service `environment`)
- Modify: `../.env.production.example`
- Modify: `../DEPLOYMENT.md` (short section)

**Interfaces:**
- Produces: env vars `MOBILE_JWT_EXPIRES_IN`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `MOBILE_MIN_APP_VERSION` reach the container.

- [ ] **Step 1: `.env.example`** — append:

```
# ── Android app (Phase 0 mobile enablement) ─────────────────────
# Lifetime of tokens minted for client=android logins (revocable via User.tokenVersion).
MOBILE_JWT_EXPIRES_IN=30d
# Firebase service-account JSON (raw or base64). Unset = push disabled, web unaffected.
FIREBASE_SERVICE_ACCOUNT_JSON=
# Oldest app version the server still supports; the app shows a force-update banner below it.
MOBILE_MIN_APP_VERSION=0
```

- [ ] **Step 2: `../docker-compose.yml`** — in the `app` service `environment`, after `HANDOFF_TG_HANDLE`:

```yaml
      # Android app (spec 2026-09-02). Push is a no-op until the Firebase
      # service account is set; tokens minted for client=android live
      # MOBILE_JWT_EXPIRES_IN and are revoked by User.tokenVersion.
      MOBILE_JWT_EXPIRES_IN: ${MOBILE_JWT_EXPIRES_IN:-30d}
      FIREBASE_SERVICE_ACCOUNT_JSON: ${FIREBASE_SERVICE_ACCOUNT_JSON:-}
      MOBILE_MIN_APP_VERSION: ${MOBILE_MIN_APP_VERSION:-0}
```

- [ ] **Step 3: `../.env.production.example`** — append the same three keys with empty/default values and a one-line comment each.

- [ ] **Step 4: `../DEPLOYMENT.md`** — add a section:

```markdown
## Android app support (Phase 0)

After pulling a build that includes the mobile enablement:

1. `docker compose exec app npx prisma db push` — adds `users.tokenVersion`, `devices`, `idempotency_keys` (additive; no data rewritten).
2. Optional: create a Firebase project, download a service-account JSON, and set `FIREBASE_SERVICE_ACCOUNT_JSON` (base64 of the file is easiest: `base64 -w0 sa.json`). Without it the API works; phones simply get no push.
3. `MOBILE_MIN_APP_VERSION` gates old APKs; leave at `0` until the first Play release.

Rollback: unset the env vars and redeploy the previous image. The three schema additions are harmless to leave in place.
```

- [ ] **Step 5: Verify compose config parses**

Run (repo root): `docker compose config --quiet`
Expected: no output (valid).

- [ ] **Step 6: Commit**

```bash
git add precast-crm/.env.example docker-compose.yml .env.production.example DEPLOYMENT.md
git commit -m "Docs · env plumbing for Android mobile enablement

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: End-to-end verification against a local server

**Files:** none created; this task proves Phase 0's exit criterion ("staff can log in on a test build" — here, via curl) before the Android work starts.

- [ ] **Step 1: Full suite, lint, types**

Run: `npx vitest run && npx tsc --noEmit && npx next lint`
Expected: all green.

- [ ] **Step 2: Start the dev server against the local DB**

Run: `npm run dev` (background) and wait for `Ready`.

- [ ] **Step 3: Exercise the mobile flow with curl (PowerShell shown; use a seeded user from `prisma/seed.ts`)**

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType application/json -Body '{"loginName":"Азиз","pin":"1234","client":"android"}'
$tok = $login.data.token
# Bearer works on a withPermission route, with no cookie:
Invoke-RestMethod -Uri http://localhost:3000/api/orders?pageSize=1 -Headers @{ Authorization = "Bearer $tok" } | ConvertTo-Json -Depth 3
# Bootstrap:
Invoke-RestMethod -Uri http://localhost:3000/api/mobile/bootstrap -Headers @{ Authorization = "Bearer $tok" } | ConvertTo-Json -Depth 3
# Device registry:
Invoke-RestMethod -Method Put -Uri http://localhost:3000/api/devices -Headers @{ Authorization = "Bearer $tok" } -ContentType application/json -Body '{"fcmToken":"test-token","platform":"android","appVersion":"0.0.1"}'
# Idempotent comment (run twice; second response carries Idempotency-Replayed: true):
$orderId = (Invoke-RestMethod -Uri http://localhost:3000/api/orders?pageSize=1 -Headers @{ Authorization = "Bearer $tok" }).data.items[0].id
1..2 | % { Invoke-WebRequest -Method Post -Uri "http://localhost:3000/api/orders/$orderId/comments" -Headers @{ Authorization = "Bearer $tok"; "Idempotency-Key" = "demo-1" } -ContentType application/json -Body '{"body":"Тест"}' | Select-Object StatusCode, @{n="replayed";e={$_.Headers["Idempotency-Replayed"]}} }
# Cache header present on API:
(Invoke-WebRequest -Uri http://localhost:3000/api/auth/me -Headers @{ Authorization = "Bearer $tok" }).Headers["Cache-Control"]
```

Expected: 200s, `Cache-Control: no-store`, second comment call shows `replayed = true` and only one comment exists on the order.

- [ ] **Step 4: Confirm the web is unaffected**

Open `http://localhost:3000/login` in a browser, log in with the same user, open `/orders` and `/inbox` (unlock). Everything behaves as before.

- [ ] **Step 5: Stop the dev server. No commit (nothing changed).**

---

## Self-review

**Spec coverage (§3.2 S1–S9 + §6.4):** S1 → Task 1 · S2 → Task 2 · S3 → Tasks 3–4 · S4 → Tasks 5–6 · S5 → Task 7 · S6 → Task 8 · S7 → Task 9 · S8 → Task 12 · S9 → Task 10 · golden vectors → Task 11 · env/deploy → Task 13 · exit criterion → Task 14. Not in scope (deliberately): push for the `orders` broadcast nudge (the app refetches on resume), envelope on the drawings POST/PDF routes (Phase 3), OpenAPI for routes outside the Phase 1 surface.

**Placeholder scan:** none. Every code step contains the code. The two "if the name differs" notes in Tasks 11 and 12 give the exact command to resolve them.

**Type consistency:** `SignTokenOptions` / `mobileTokenOptions` (Task 2) used by the login route (Task 2); `withIdempotency<P>` signature (Task 5) matches the call sites (Task 6); `CAPACITY_THRESHOLDS` (Task 9) used by capacity route and bootstrap; `CalculateBatchSchema` (Task 10) imported by the OpenAPI registry (Task 12); `sendPushToUsers(userIds, data)` (Task 3) called with that exact shape from `notifications.ts` (Task 4); `mintInboxUnlockToken` / `INBOX_UNLOCK_HEADER` (Task 7) match the test.
