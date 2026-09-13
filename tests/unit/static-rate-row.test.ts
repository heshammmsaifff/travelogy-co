import { describe, it, expect } from "vitest";
import {
  candidateFromSheetRow,
  nightsInclusive,
  staticRateRowSchema,
} from "@/modules/hotels/application/static-rate-row";

const base = {
  hotel_code: "htl001",
  room_code: "std",
  plan_code: "bb",
  start_date: "2026-10-01",
  end_date: "2026-10-31",
  currency: "sar",
  net_rate: "450.00",
  min_stay: "1",
  allotment: "10",
};

describe("static rate row parsing", () => {
  it("normalises codes and currency to upper case", () => {
    const c = candidateFromSheetRow(base);
    expect(c).toMatchObject({ hotelCode: "HTL001", roomCode: "STD", planCode: "BB", currency: "SAR" });
    expect(staticRateRowSchema.safeParse(c).success).toBe(true);
  });

  it("keeps an allotment of 0 as 0 (a stop-sell), never a default", () => {
    const c = candidateFromSheetRow({ ...base, allotment: "0" });
    expect(c.allotment).toBe(0);
    expect(staticRateRowSchema.safeParse(c).success).toBe(true);
  });

  it("rejects a blank allotment instead of inventing rooms", () => {
    const c = candidateFromSheetRow({ ...base, allotment: "" });
    const parsed = staticRateRowSchema.safeParse(c);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((i) => i.path[0] === "allotment")).toBe(true);
  });

  it("rejects a blank rate plan instead of assuming room-only", () => {
    const { plan_code: _omit, ...withoutPlan } = base;
    const parsed = staticRateRowSchema.safeParse(candidateFromSheetRow(withoutPlan));
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((i) => i.path[0] === "planCode")).toBe(true);
  });

  it("treats a blank currency as 'use the plan's currency' (null), not SAR", () => {
    expect(candidateFromSheetRow({ ...base, currency: "" }).currency).toBeNull();
  });

  it("rejects an impossible calendar date", () => {
    const parsed = staticRateRowSchema.safeParse(candidateFromSheetRow({ ...base, end_date: "2026-02-30" }));
    expect(parsed.success).toBe(false);
  });

  it("rejects a range that ends before it starts, and asserts that is the reason", () => {
    const parsed = staticRateRowSchema.safeParse(
      candidateFromSheetRow({ ...base, start_date: "2026-10-10", end_date: "2026-10-01" }),
    );
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.message)).toContain("Start date cannot be after end date");
  });

  it("rejects a non-positive or non-numeric net rate", () => {
    expect(staticRateRowSchema.safeParse(candidateFromSheetRow({ ...base, net_rate: "0" })).success).toBe(false);
    expect(staticRateRowSchema.safeParse(candidateFromSheetRow({ ...base, net_rate: "abc" })).success).toBe(false);
  });

  it("accepts the alternative header spellings", () => {
    const c = candidateFromSheetRow({
      "Hotel Code": "HTL002",
      "Room Code": "DLX",
      "Rate Plan": "HB",
      "Start Date": "2026-11-01",
      "End Date": "2026-11-02",
      "Net Rate": "1,250.50",
      Allotment: "3",
    });
    expect(c).toMatchObject({ hotelCode: "HTL002", planCode: "HB", netRate: 1250.5, minStay: 1, allotment: 3 });
    expect(staticRateRowSchema.safeParse(c).success).toBe(true);
  });

  it("lists every night from first to last inclusive, across a month boundary", () => {
    expect(nightsInclusive("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  });
});
