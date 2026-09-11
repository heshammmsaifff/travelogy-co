import { describe, it, expect } from "vitest";
import { toHalfOpenRange, parseDateRange } from "@/shared/lib/date-range";

describe("Postgres Half-Open Date Range Utility", () => {
  it("converts inclusive end date to half-open range [from, to+1)", () => {
    const range = toHalfOpenRange("2026-06-01", "2026-06-30");
    expect(range).toBe("[2026-06-01,2026-07-01)");
  });

  it("handles leap years and month transitions correctly", () => {
    // 2028 is a leap year (Feb 29)
    const febLeap = toHalfOpenRange("2028-02-01", "2028-02-28");
    expect(febLeap).toBe("[2028-02-01,2028-02-29)");

    const yearEnd = toHalfOpenRange("2026-12-01", "2026-12-31");
    expect(yearEnd).toBe("[2026-12-01,2027-01-01)");
  });

  it("parses half-open range back to inclusive human dates", () => {
    const parsed = parseDateRange("[2026-06-01,2026-07-01)");
    expect(parsed.from).toBe("2026-06-01");
    expect(parsed.to).toBe("2026-06-30");
  });

  it("roundtrips seamlessly without off-by-one errors", () => {
    const start = "2026-10-15";
    const end = "2026-10-25";

    const formatted = toHalfOpenRange(start, end);
    const parsed = parseDateRange(formatted);

    expect(parsed.from).toBe(start);
    expect(parsed.to).toBe(end);
  });

  it("handles malformed or empty inputs gracefully", () => {
    expect(parseDateRange("")).toEqual({ from: "", to: "" });
    expect(parseDateRange("invalid")).toEqual({ from: "", to: "" });
  });
});
