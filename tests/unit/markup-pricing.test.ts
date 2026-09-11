import { describe, it, expect } from "vitest";

type MarkupRule = {
  scope: "global" | "hotel" | "agency";
  markupType: "fixed" | "percentage";
  markupValue: number;
  agencyId?: string | null;
  hotelId?: string | null;
};

/**
 * Resolves the effective markup rule according to the hierarchy:
 * 1. Specific agency rule
 * 2. Specific hotel rule
 * 3. Global rule
 */
function resolveEffectiveMarkup(
  rules: MarkupRule[],
  agencyId?: string,
  hotelId?: string,
): MarkupRule | null {
  if (agencyId) {
    const agencyRule = rules.find((r) => r.scope === "agency" && r.agencyId === agencyId);
    if (agencyRule) return agencyRule;
  }
  if (hotelId) {
    const hotelRule = rules.find((r) => r.scope === "hotel" && r.hotelId === hotelId);
    if (hotelRule) return hotelRule;
  }
  return rules.find((r) => r.scope === "global") ?? null;
}

/**
 * Calculates sell price from net price based on markup rule.
 */
function calculateSellPrice(netPrice: number, rule: MarkupRule | null): number {
  if (!rule) return netPrice;
  if (rule.markupType === "fixed") {
    return Math.max(netPrice, netPrice + rule.markupValue);
  }
  if (rule.markupType === "percentage") {
    const markupAmount = (netPrice * rule.markupValue) / 100;
    return Math.max(netPrice, netPrice + markupAmount);
  }
  return netPrice;
}

describe("Markup Engine & Pricing Invariant", () => {
  const globalRule: MarkupRule = {
    scope: "global",
    markupType: "percentage",
    markupValue: 15,
  };

  const hotelRule: MarkupRule = {
    scope: "hotel",
    hotelId: "hotel-hilton-cairo",
    markupType: "percentage",
    markupValue: 20,
  };

  const agencyRule: MarkupRule = {
    scope: "agency",
    agencyId: "agency-vip-tours",
    markupType: "fixed",
    markupValue: 50,
  };

  const allRules = [globalRule, hotelRule, agencyRule];

  it("applies global percentage markup when no specific override exists", () => {
    const rule = resolveEffectiveMarkup(allRules, "agency-standard", "hotel-other");
    expect(rule).toEqual(globalRule);

    const net = 1000;
    const sell = calculateSellPrice(net, rule);
    expect(sell).toBe(1150); // 1000 + 15%
  });

  it("applies hotel-specific markup when no agency rule overrides it", () => {
    const rule = resolveEffectiveMarkup(allRules, "agency-standard", "hotel-hilton-cairo");
    expect(rule).toEqual(hotelRule);

    const net = 1000;
    const sell = calculateSellPrice(net, rule);
    expect(sell).toBe(1200); // 1000 + 20%
  });

  it("prioritizes agency-specific rule over hotel and global rules", () => {
    const rule = resolveEffectiveMarkup(allRules, "agency-vip-tours", "hotel-hilton-cairo");
    expect(rule).toEqual(agencyRule);

    const net = 1000;
    const sell = calculateSellPrice(net, rule);
    expect(sell).toBe(1050); // 1000 + 50 fixed
  });

  it("strictly enforces commercial invariant: sell >= net (no net rate leakage)", () => {
    const net = 2500;
    const rule = resolveEffectiveMarkup(allRules);
    const sell = calculateSellPrice(net, rule);

    expect(sell).toBeGreaterThanOrEqual(net);
    const margin = sell - net;
    expect(margin).toBeGreaterThan(0);
  });

  it("correctly scales pricing for multi-night and multi-room bookings", () => {
    const netPerNight = 800;
    const nights = 4;
    const rooms = 3;

    const rule: MarkupRule = {
      scope: "global",
      markupType: "percentage",
      markupValue: 10,
    };

    const sellPerNight = calculateSellPrice(netPerNight, rule);
    expect(sellPerNight).toBe(880);

    const totalSell = sellPerNight * nights * rooms;
    const totalNet = netPerNight * nights * rooms;

    expect(totalSell).toBe(880 * 4 * 3); // 10560
    expect(totalNet).toBe(800 * 4 * 3); // 9600
    expect(totalSell - totalNet).toBe(960);
  });
});
