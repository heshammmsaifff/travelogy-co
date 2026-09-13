import { describe, it, expect } from "vitest";
import { resolveClientIp } from "@/shared/lib/client-ip";

describe("resolveClientIp", () => {
  it("takes the first address from x-forwarded-for", () => {
    expect(resolveClientIp(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe(
      "203.0.113.9",
    );
  });

  it("falls back to x-real-ip, then cf-connecting-ip", () => {
    expect(resolveClientIp(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(resolveClientIp(new Headers({ "cf-connecting-ip": "192.0.2.7" }))).toBe("192.0.2.7");
  });

  it("returns null — not a placeholder like 127.0.0.1 — when no header is present", () => {
    // A placeholder would let an allow-list containing that address match a
    // request whose real origin is unknown.
    expect(resolveClientIp(new Headers())).toBeNull();
  });
});
