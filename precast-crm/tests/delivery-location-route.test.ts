import { describe, it, expect } from "vitest";
import { DeliveryLocationBody } from "@/app/api/orders/[id]/delivery-location/schema";

describe("DeliveryLocationBody schema", () => {
  it("accepts a full pin with url and label", () => {
    const result = DeliveryLocationBody.safeParse({
      lat: 40.6,
      lng: 72.4,
      url: "https://maps.google.com/?q=40.6,72.4",
      label: "blue gate",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null lat/lng to clear the pin", () => {
    const result = DeliveryLocationBody.safeParse({ lat: null, lng: null });
    expect(result.success).toBe(true);
  });

  it("rejects lat out of range (>90)", () => {
    const result = DeliveryLocationBody.safeParse({ lat: 200, lng: 0 });
    expect(result.success).toBe(false);
  });
});
