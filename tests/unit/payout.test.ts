import { describe, expect, it } from "vitest";
import { calculatePayout } from "../../lib/payout";

describe("calculatePayout", () => {
  it("matches the worked example from docs/PRODUCT_SPEC.md", () => {
    // 25% qualifying audience, divisor 50, base rate $1.00 -> CPM = $0.50
    // 4,000,000 views -> Earnings = $2,000 -> capped at Max Pay Per Post ($500)
    const result = calculatePayout({
      qualifyingAudiencePct: 25,
      divisor: 50,
      baseRate: 1.0,
      views: 4_000_000,
      maxPayPerPost: 500,
    });

    expect(result.cpm).toBeCloseTo(0.5, 4);
    expect(result.earnings).toBeCloseTo(2000, 2);
    expect(result.payout).toBe(500); // capped, not the full $2,000
  });

  it("pays the full uncapped amount when earnings are under the cap", () => {
    const result = calculatePayout({
      qualifyingAudiencePct: 50,
      divisor: 50,
      baseRate: 1.0,
      views: 10_000,
      maxPayPerPost: 500,
    });

    expect(result.cpm).toBeCloseTo(1.0, 4);
    expect(result.payout).toBeCloseTo(10, 2); // uncapped: $1.00 CPM * 10 (=10,000/1000)
  });

  it("scales CPM proportionally with qualifying audience percentage", () => {
    const cases: Array<[number, number]> = [
      [50, 1.0],
      [40, 0.8],
      [30, 0.6],
      [25, 0.5],
      [20, 0.4],
      [10, 0.2],
    ];

    for (const [pct, expectedCpm] of cases) {
      const { cpm } = calculatePayout({
        qualifyingAudiencePct: pct,
        divisor: 50,
        baseRate: 1.0,
        views: 1000,
        maxPayPerPost: 999999,
      });
      expect(cpm).toBeCloseTo(expectedCpm, 4);
    }
  });

  it("caps CPM at the Base Rate once qualifying audience % reaches the Divisor — it never scales past it", () => {
    // Real bug: 78% with a 50 Divisor used to give CPM = (78/50)*$1.00 = $1.56, above the $1.00 Base Rate.
    const over = calculatePayout({ qualifyingAudiencePct: 78, divisor: 50, baseRate: 1.0, views: 1000, maxPayPerPost: 999999 });
    expect(over.cpm).toBeCloseTo(1.0, 4);
    expect(over.earnings).toBeCloseTo(1.0, 2);

    // Exactly at the threshold: still the uncapped case, CPM == Base Rate either way.
    const at = calculatePayout({ qualifyingAudiencePct: 50, divisor: 50, baseRate: 1.0, views: 1000, maxPayPerPost: 999999 });
    expect(at.cpm).toBeCloseTo(1.0, 4);

    // Fully qualifying (100%) pays no more than a bare pass of the threshold.
    const full = calculatePayout({ qualifyingAudiencePct: 100, divisor: 50, baseRate: 1.0, views: 1000, maxPayPerPost: 999999 });
    expect(full.cpm).toBeCloseTo(1.0, 4);
  });

  it("below the threshold is unaffected by the cap — proportional scaling stays exactly as before", () => {
    const { cpm } = calculatePayout({ qualifyingAudiencePct: 49, divisor: 50, baseRate: 1.0, views: 1000, maxPayPerPost: 999999 });
    expect(cpm).toBeCloseTo(0.98, 4);
  });

  it("rejects a zero divisor rather than dividing by zero", () => {
    expect(() =>
      calculatePayout({
        qualifyingAudiencePct: 25,
        divisor: 0,
        baseRate: 1.0,
        views: 1000,
        maxPayPerPost: 500,
      }),
    ).toThrow();
  });
});
