import { describe, it, expect } from "vitest";
import { parseCommentTokens } from "@/components/comments/parse-comment";

function joined(body: string): string {
  return parseCommentTokens(body)
    .map((t) => t.value)
    .join("");
}

describe("parseCommentTokens", () => {
  it("plain text → single text token", () => {
    const tokens = parseCommentTokens("Hello world");
    expect(tokens).toEqual([{ type: "text", value: "Hello world" }]);
    expect(joined("Hello world")).toBe("Hello world");
  });

  it("Google Maps URL in the middle", () => {
    const body = "See map: https://maps.google.com/maps?q=123 here";
    const tokens = parseCommentTokens(body);
    expect(tokens[0]).toEqual({ type: "text", value: "See map: " });
    expect(tokens[1]).toEqual({
      type: "link",
      value: "https://maps.google.com/maps?q=123",
    });
    expect(tokens[2]).toEqual({ type: "text", value: " here" });
    expect(joined(body)).toBe(body);
  });

  it("@username preserved as mention token", () => {
    const body = "Hey @alice check this";
    const tokens = parseCommentTokens(body);
    expect(tokens[0]).toEqual({ type: "text", value: "Hey " });
    expect(tokens[1]).toEqual({ type: "mention", value: "@alice" });
    expect(tokens[2]).toEqual({ type: "text", value: " check this" });
    expect(joined(body)).toBe(body);
  });

  it("@email mention preserved", () => {
    const body = "@user@example.com done";
    const tokens = parseCommentTokens(body);
    expect(tokens[0]).toEqual({ type: "mention", value: "@user@example.com" });
    expect(tokens[1]).toEqual({ type: "text", value: " done" });
    expect(joined(body)).toBe(body);
  });

  it("URL followed by ). keeps the ). as text", () => {
    const body = "see (https://x.com).";
    const tokens = parseCommentTokens(body);
    const linkToken = tokens.find((t) => t.type === "link");
    expect(linkToken?.value).toBe("https://x.com");
    // The paren and period must NOT be part of the link
    const textAfter = tokens.find(
      (t, i) => t.type === "text" && i > tokens.indexOf(linkToken!)
    );
    expect(textAfter?.value).toMatch(/\)\./);
    expect(joined(body)).toBe(body);
  });

  it("mixed mention + URL in order", () => {
    const body = "@bob check https://example.com and done";
    const tokens = parseCommentTokens(body);
    expect(tokens[0]).toEqual({ type: "mention", value: "@bob" });
    expect(tokens[1]).toEqual({ type: "text", value: " check " });
    expect(tokens[2]).toEqual({ type: "link", value: "https://example.com" });
    expect(tokens[3]).toEqual({ type: "text", value: " and done" });
    expect(joined(body)).toBe(body);
  });

  it("http:// URL is also recognized", () => {
    const body = "http://example.com";
    const tokens = parseCommentTokens(body);
    expect(tokens).toEqual([{ type: "link", value: "http://example.com" }]);
    expect(joined(body)).toBe(body);
  });

  it("empty string → empty array", () => {
    expect(parseCommentTokens("")).toEqual([]);
  });

  it("concatenation always reproduces the original input", () => {
    const samples = [
      "plain text only",
      "@alice mentioned https://maps.google.com/maps?q=test right?",
      "no mention, just https://x.com/path?q=1&r=2 end.",
      "(https://example.com/foo).",
      "@user@domain.com see https://x.com",
    ];
    for (const s of samples) {
      expect(joined(s)).toBe(s);
    }
  });
});
