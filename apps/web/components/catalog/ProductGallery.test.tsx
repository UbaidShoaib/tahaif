import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductGallery } from "@/components/catalog/ProductGallery";
import { TrustList } from "@/components/catalog/TrustList";
import type { ProductImage } from "@/lib/catalog";

const img = (id: string, o: Partial<ProductImage> = {}): ProductImage => ({
  id, url: `https://cdn.test/${id}.jpg`, alt_text: null, sort_order: 0, is_primary: false, ...o,
});

describe("ProductGallery", () => {
  it("puts the primary image first and describes each image", () => {
    render(
      <ProductGallery
        productName="Fudge Cake"
        images={[img("side", { sort_order: 1 }), img("front", { is_primary: true, alt_text: "Cake from the front" })]}
      />,
    );
    const shown = screen.getAllByRole("img", { hidden: true }).filter((el) => el.getAttribute("alt"));
    expect(shown[0]).toHaveAttribute("alt", "Cake from the front");
    expect(shown[1]).toHaveAttribute("alt", "Fudge Cake, image 2 of 2");
  });

  it("switches images with thumbnails and marks the current one", async () => {
    render(<ProductGallery productName="Cake" images={[img("a"), img("b"), img("c")]} />);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show image 3 of 3" }));
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show image 3 of 3" })).toHaveAttribute("aria-current", "true");
    await userEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("shows a single image without carousel controls", () => {
    render(<ProductGallery productName="Cake" images={[img("only")]} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("TrustList", () => {
  it("lists the service promises as text", () => {
    render(<TrustList />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText(/Cash on delivery or bank transfer/)).toBeInTheDocument();
  });
});
