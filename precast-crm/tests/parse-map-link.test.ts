import { describe, it, expect } from "vitest";
import { parseMapLink, isGoogleShortLinkHost } from "@/lib/geo/parse-map-link";

describe("parseMapLink", () => {
  it("reads q=lat,lng from a maps query (first match wins over ll)", () => {
    expect(
      parseMapLink("https://maps.google.com/maps?q=40.633937,72.407981&ll=40.6,72.4&z=16"),
    ).toEqual({ lat: 40.633937, lng: 72.407981 });
  });

  it("reads @lat,lng,zoom from a /maps/@ path", () => {
    expect(parseMapLink("https://www.google.com/maps/@40.7128,-74.0060,15z")).toEqual({
      lat: 40.7128,
      lng: -74.006,
    });
  });

  it("reads !3d<lat>!4d<lng> from a place URL", () => {
    expect(
      parseMapLink(
        "https://www.google.com/maps/place/X/@41.31,69.24,17z/data=!3d41.31!4d69.24",
      ),
    ).toEqual({ lat: 41.31, lng: 69.24 });
  });

  it("reads ll=lat,lng", () => {
    expect(parseMapLink("https://maps.google.com/?ll=40.5,72.1")).toEqual({
      lat: 40.5,
      lng: 72.1,
    });
  });

  it("reads query=lat,lng (URL-decoded)", () => {
    expect(parseMapLink("https://maps.google.com/?query=40.5%2C72.1")).toEqual({
      lat: 40.5,
      lng: 72.1,
    });
  });

  it("reads destination=lat,lng", () => {
    expect(parseMapLink("https://www.google.com/maps/dir/?destination=41.0,69.0")).toEqual({
      lat: 41.0,
      lng: 69.0,
    });
  });

  it("reads plain text 'lat, lng' with a space", () => {
    expect(parseMapLink("40.633937, 72.407981")).toEqual({
      lat: 40.633937,
      lng: 72.407981,
    });
  });

  it("reads plain text 'lat,lng' without a space", () => {
    expect(parseMapLink("40.633937,72.407981")).toEqual({
      lat: 40.633937,
      lng: 72.407981,
    });
  });

  it("returns null for non-link text", () => {
    expect(parseMapLink("not a link")).toBeNull();
  });

  it("returns null for out-of-range coordinates", () => {
    expect(parseMapLink("200, 999")).toBeNull();
  });

  it("returns null for out-of-range lat in a query", () => {
    expect(parseMapLink("https://maps.google.com/?q=200,50")).toBeNull();
  });
});

describe("isGoogleShortLinkHost", () => {
  it("accepts maps.app.goo.gl", () => {
    expect(isGoogleShortLinkHost("https://maps.app.goo.gl/abc")).toBe(true);
  });

  it("accepts goo.gl", () => {
    expect(isGoogleShortLinkHost("https://goo.gl/maps/abc")).toBe(true);
  });

  it("accepts g.co", () => {
    expect(isGoogleShortLinkHost("https://g.co/kgs/abc")).toBe(true);
  });

  it("accepts maps.google.com and www.google.com", () => {
    expect(isGoogleShortLinkHost("https://maps.google.com/maps?q=1,2")).toBe(true);
    expect(isGoogleShortLinkHost("https://www.google.com/maps")).toBe(true);
  });

  it("rejects an arbitrary host", () => {
    expect(isGoogleShortLinkHost("https://evil.com/x")).toBe(false);
  });

  it("rejects an internal IP", () => {
    expect(isGoogleShortLinkHost("http://169.254.169.254/")).toBe(false);
  });

  it("rejects localhost", () => {
    expect(isGoogleShortLinkHost("http://localhost:3000/")).toBe(false);
  });

  it("rejects non-URL text", () => {
    expect(isGoogleShortLinkHost("not a url")).toBe(false);
  });

  it("rejects a subdomain spoof of an allowlisted host", () => {
    expect(isGoogleShortLinkHost("https://goo.gl.evil.com/x")).toBe(false);
  });
});
