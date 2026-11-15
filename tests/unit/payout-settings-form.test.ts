import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PayoutSettingsForm } from "@/components/campaigns/payout-settings-form";

describe("Pay & limits form", () => {
  const html = renderToStaticMarkup(
    createElement(PayoutSettingsForm, {
      action: async () => ({}),
      current: {
        baseRate: "0.1000",
        divisor: "50.0000",
        maxPayPerPost: "1000.00",
        viewMinimum: 1000,
        totalBudget: "1000.00",
        dailySubmissionLimit: 100,
        budgetSpent: "67.49",
      },
    }),
  );

  it("is pre-filled with the current values, without trailing zeros", () => {
    expect(html).toContain('name="baseRate"');
    expect(html).toContain('value="0.1"');
    expect(html).toContain('value="50"');
    expect(html).toContain('value="1000"');
    expect(html).toContain('value="100"');
  });

  it("posts every field the server action reads", () => {
    for (const f of ["baseRate", "divisor", "maxPayPerPost", "viewMinimum", "totalBudget", "dailySubmissionLimit"]) {
      expect(html).toContain(`name="${f}"`);
    }
  });

  it("shows what has been paid next to the budget, and explains that old posts keep their terms", () => {
    expect(html).toContain("$67.49 paid so far");
    expect(html).toContain("Posts already");
    expect(html).toContain(">Save settings<");
  });
});
