import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DetailsForm } from "@/components/campaigns/details-form";

describe("Campaign details form", () => {
  const html = renderToStaticMarkup(
    createElement(DetailsForm, { action: async () => ({}), brandName: "Koonami", name: "Efootball Diwali Campaign" }),
  );

  it("is pre-filled with the current brand and campaign name", () => {
    expect(html).toContain('value="Koonami"');
    expect(html).toContain('value="Efootball Diwali Campaign"');
  });

  it("posts both fields under the names the server action reads", () => {
    expect(html).toContain('name="brandName"');
    expect(html).toContain('name="name"');
    expect(html).toContain(">Save details<");
  });
});
