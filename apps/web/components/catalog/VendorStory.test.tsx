import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VendorStory } from "@/components/catalog/VendorStory";
import type { City, Vendor } from "@/lib/catalog";

const vendor: Vendor = {
  id: "v1",
  city_id: "lhr",
  name: "Layers Bakeshop",
  slug: "layers",
  description: "Family bakery on MM Alam Road since 2010.",
  logo_url: null,
  is_active: true,
};
const LHR: City = { id: "lhr", name: "Lahore", slug: "lahore", timezone: "Asia/Karachi", is_active: true };

describe("VendorStory", () => {
  it("introduces the local maker in their own words", () => {
    render(<VendorStory vendor={vendor} city={LHR} />);

    expect(screen.getByRole("region", { name: "Made by Layers Bakeshop" })).toBeInTheDocument();
    expect(screen.getByText("A local shop in Lahore")).toBeInTheDocument();
    expect(screen.getByText("Family bakery on MM Alam Road since 2010.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "More from Layers Bakeshop" })).toHaveAttribute("href", "/vendor/layers");
  });

  it("renders nothing without a description", () => {
    const { container } = render(<VendorStory vendor={{ ...vendor, description: null }} city={LHR} />);
    expect(container).toBeEmptyDOMElement();
  });
});
