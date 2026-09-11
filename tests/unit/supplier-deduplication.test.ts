import { describe, it, expect } from "vitest";

type RawSupplierOffer = {
  supplierKey: string;
  hotelRef: string;
  hotelName: string;
  city: string;
  roomName: string;
  sellTotal: number;
};

type DeduplicatedHotel = {
  hotelName: string;
  city: string;
  lowestSupplierKey: string;
  lowestPrice: number;
  totalSuppliers: number;
  offers: RawSupplierOffer[];
  comparison: { supplierKey: string; minPrice: number }[];
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function deduplicateSupplierHotels(
  rawOffers: RawSupplierOffer[],
  canonicalMappings?: Map<string, string>,
): DeduplicatedHotel[] {
  const clusters = new Map<string, RawSupplierOffer[]>();

  for (const offer of rawOffers) {
    let groupKey: string;

    const mappedCanonicalId = canonicalMappings?.get(`${offer.supplierKey}:${offer.hotelRef}`);
    if (mappedCanonicalId) {
      groupKey = `canonical:${mappedCanonicalId}`;
    } else {
      const normCity = normalizeText(offer.city);
      const normName = normalizeText(offer.hotelName);
      groupKey = `name:${normCity}:${normName}`;
    }

    const list = clusters.get(groupKey) ?? [];
    list.push(offer);
    clusters.set(groupKey, list);
  }

  const results: DeduplicatedHotel[] = [];

  for (const offers of clusters.values()) {
    const supplierPrices = new Map<string, number>();

    for (const offer of offers) {
      const currentMin = supplierPrices.get(offer.supplierKey) ?? Number.POSITIVE_INFINITY;
      if (offer.sellTotal < currentMin) {
        supplierPrices.set(offer.supplierKey, offer.sellTotal);
      }
    }

    const comparison = Array.from(supplierPrices.entries()).map(([supplierKey, minPrice]) => ({
      supplierKey,
      minPrice,
    }));

    comparison.sort((a, b) => a.minPrice - b.minPrice);
    const best = comparison[0]!;

    const firstOffer = offers[0]!;

    results.push({
      hotelName: firstOffer.hotelName,
      city: firstOffer.city,
      lowestSupplierKey: best.supplierKey,
      lowestPrice: best.minPrice,
      totalSuppliers: supplierPrices.size,
      offers,
      comparison,
    });
  }

  // Sort hotels by lowest available rate
  results.sort((a, b) => a.lowestPrice - b.lowestPrice);
  return results;
}

describe("Multi-Supplier Aggregation & Deduplication Engine", () => {
  const mockOffers: RawSupplierOffer[] = [
    {
      supplierKey: "hotelbeds",
      hotelRef: "hb-101",
      hotelName: "Steigenberger Hotel El Tahrir",
      city: "Cairo",
      roomName: "Superior Room",
      sellTotal: 180,
    },
    {
      supplierKey: "webbeds",
      hotelRef: "wb-990",
      hotelName: "Steigenberger El Tahrir Cairo",
      city: "Cairo",
      roomName: "Standard Deluxe",
      sellTotal: 165,
    },
    {
      supplierKey: "tbo",
      hotelRef: "tbo-55",
      hotelName: "Steigenberger Hotel El Tahrir",
      city: "Cairo",
      roomName: "Standard Room",
      sellTotal: 175,
    },
    {
      supplierKey: "internal",
      hotelRef: "int-01",
      hotelName: "Kempinski Nile Hotel",
      city: "Cairo",
      roomName: "Nile View Suite",
      sellTotal: 310,
    },
    {
      supplierKey: "ratehawk",
      hotelRef: "rh-44",
      hotelName: "Kempinski Nile Hotel",
      city: "Cairo",
      roomName: "Junior Suite",
      sellTotal: 295,
    },
  ];

  const mappings = new Map<string, string>([
    ["hotelbeds:hb-101", "hotel-steigenberger-tahrir"],
    ["webbeds:wb-990", "hotel-steigenberger-tahrir"],
    ["tbo:tbo-55", "hotel-steigenberger-tahrir"],
    ["internal:int-01", "hotel-kempinski-cairo"],
    ["ratehawk:rh-44", "hotel-kempinski-cairo"],
  ]);

  it("normalizes and merges multiple supplier records for the same physical property via mappings", () => {
    const deduplicated = deduplicateSupplierHotels(mockOffers, mappings);

    expect(deduplicated).toHaveLength(2); // Steigenberger and Kempinski
  });

  it("correctly identifies the lowest supplier rate for Steigenberger", () => {
    const deduplicated = deduplicateSupplierHotels(mockOffers, mappings);
    const steigenberger = deduplicated.find((h) => h.hotelName.includes("Steigenberger"))!;

    expect(steigenberger).toBeDefined();
    expect(steigenberger.totalSuppliers).toBe(3); // hotelbeds, webbeds, tbo
    expect(steigenberger.lowestSupplierKey).toBe("webbeds");
    expect(steigenberger.lowestPrice).toBe(165);
  });

  it("correctly identifies the lowest supplier rate for Kempinski", () => {
    const deduplicated = deduplicateSupplierHotels(mockOffers, mappings);
    const kempinski = deduplicated.find((h) => h.hotelName.includes("Kempinski"))!;

    expect(kempinski).toBeDefined();
    expect(kempinski.totalSuppliers).toBe(2); // internal, ratehawk
    expect(kempinski.lowestSupplierKey).toBe("ratehawk");
    expect(kempinski.lowestPrice).toBe(295);
  });

  it("clusters unmapped records by normalized name and city", () => {
    const unmappedOffers: RawSupplierOffer[] = [
      {
        supplierKey: "hotelbeds",
        hotelRef: "hb-201",
        hotelName: "Four Seasons Cairo",
        city: "Cairo",
        roomName: "Deluxe",
        sellTotal: 400,
      },
      {
        supplierKey: "webbeds",
        hotelRef: "wb-202",
        hotelName: "Four Seasons Cairo",
        city: "Cairo",
        roomName: "Deluxe",
        sellTotal: 380,
      },
    ];

    const deduplicated = deduplicateSupplierHotels(unmappedOffers);
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]!.lowestSupplierKey).toBe("webbeds");
    expect(deduplicated[0]!.lowestPrice).toBe(380);
  });

  it("ranks the entire search results by lowest available rate", () => {
    const deduplicated = deduplicateSupplierHotels(mockOffers, mappings);

    expect(deduplicated[0]!.lowestPrice).toBeLessThanOrEqual(deduplicated[1]!.lowestPrice);
  });
});
