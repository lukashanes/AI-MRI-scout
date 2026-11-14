import { describe, it, expect } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  it("allows requests under the limit", () => {
    const ip = `test-${Date.now()}-1`;
    const result = checkRateLimit(ip, { maxRequests: 5, windowMs: 60000 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks after exceeding limit", () => {
    const ip = `test-${Date.now()}-2`;
    for (let i = 0; i < 3; i++) {
      checkRateLimit(ip, { maxRequests: 3, windowMs: 60000 });
    }
    const result = checkRateLimit(ip, { maxRequests: 3, windowMs: 60000 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("allows requests from different IPs independently", () => {
    const ip1 = `test-${Date.now()}-3a`;
    const ip2 = `test-${Date.now()}-3b`;
    for (let i = 0; i < 3; i++) {
      checkRateLimit(ip1, { maxRequests: 3, windowMs: 60000 });
    }
    const result = checkRateLimit(ip2, { maxRequests: 3, windowMs: 60000 });
    expect(result.allowed).toBe(true);
  });

  it("tracks remaining correctly", () => {
    const ip = `test-${Date.now()}-4`;
    const r1 = checkRateLimit(ip, { maxRequests: 5, windowMs: 60000 });
    expect(r1.remaining).toBe(4);
    const r2 = checkRateLimit(ip, { maxRequests: 5, windowMs: 60000 });
    expect(r2.remaining).toBe(3);
  });
});
