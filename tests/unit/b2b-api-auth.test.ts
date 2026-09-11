import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";

// Mock server-only and database environment dependencies for unit testing
vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/supabase/server", () => ({
  createServiceRoleClient: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock("@/shared/lib/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    NEXT_PUBLIC_SITE_URL: "https://test.travelogy.co",
  },
}));

import { hashApiKey, generateApiKey } from "@/modules/b2b-api/infrastructure/api-auth.guard";

describe("B2B API Key Security & Authentication", () => {
  it("generates API keys with prefix and 64-character SHA-256 hash", () => {
    const { rawKey, keyPrefix, keyHash } = generateApiKey();

    expect(rawKey.startsWith("llt_live_")).toBe(true);
    expect(keyPrefix.startsWith("llt_live_")).toBe(true);
    expect(keyPrefix.endsWith("...")).toBe(true);
    expect(keyHash).toHaveLength(64);
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces deterministic SHA-256 hashes for identical inputs", () => {
    const key = "llt_live_test_key_1234567890abcdef";
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);

    const expected = crypto.createHash("sha256").update(key).digest("hex");
    expect(hash1).toBe(expected);
    expect(hash2).toBe(expected);
  });

  it("trims whitespace from input keys before hashing", () => {
    const key = "llt_live_whitespace_test";
    const untrimmed = `  ${key}\n\t  `;

    expect(hashApiKey(untrimmed)).toBe(hashApiKey(key));
  });

  it("produces distinct hashes for different keys", () => {
    const key1 = "llt_live_key_one";
    const key2 = "llt_live_key_two";

    expect(hashApiKey(key1)).not.toBe(hashApiKey(key2));
  });
});
