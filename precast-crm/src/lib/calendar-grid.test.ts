import { describe, it, expect } from "vitest";
import { monthGridWeeks } from "./calendar-grid";

// Owner ruling (web 2026-10-07, same as Android R16): draw the weeks the month
// needs and not one more. Monday-first grid.
describe("monthGridWeeks", () => {
  it("October 2026 (starts Thursday, 31 days) needs five rows", () => {
    expect(monthGridWeeks(new Date(2026, 9, 1))).toBe(5);
  });
  it("September 2026 (starts Tuesday, 30 days) needs five rows", () => {
    expect(monthGridWeeks(new Date(2026, 8, 15))).toBe(5);
  });
  it("August 2026 (starts Saturday, 31 days) keeps six rows — the 31st is in the sixth", () => {
    expect(monthGridWeeks(new Date(2026, 7, 1))).toBe(6);
  });
  it("February 2027 (starts Monday, 28 days) needs only four rows", () => {
    expect(monthGridWeeks(new Date(2027, 1, 1))).toBe(4);
  });
  it("a Sunday-start month counts the leading week (March 2026: 6 + 31 = 37 cells → six)", () => {
    expect(monthGridWeeks(new Date(2026, 2, 10))).toBe(6);
  });
});
