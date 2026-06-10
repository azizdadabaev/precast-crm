import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.INSTAGRAM_VERIFY_TOKEN = "vt-test";
});

import { GET } from "@/app/api/instagram/webhook/route";
import { NextRequest } from "next/server";

describe("Instagram webhook GET verification handshake", () => {
  it("echoes hub.challenge when the verify token matches", async () => {
    const url = "https://x/api/instagram/webhook?hub.mode=subscribe&hub.verify_token=vt-test&hub.challenge=4242";
    const res = GET(new NextRequest(url));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("4242");
  });

  it("403s when the verify token is wrong", async () => {
    const url = "https://x/api/instagram/webhook?hub.mode=subscribe&hub.verify_token=NOPE&hub.challenge=4242";
    const res = GET(new NextRequest(url));
    expect(res.status).toBe(403);
  });

  it("403s when hub.mode is missing", async () => {
    const url = "https://x/api/instagram/webhook?hub.verify_token=vt-test&hub.challenge=4242";
    const res = GET(new NextRequest(url));
    expect(res.status).toBe(403);
  });
});
