import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext } from "@dnd-kit/core";
import { BucketCanvas } from "@/components/builder/BucketCanvas";
import { piece } from "@/test/bucket-fixtures";

const base = { kind: "bouquet" as const, editors: [], cursors: {}, you: "me", onPointer: vi.fn() };

describe("BucketCanvas", () => {
  it("prompts when empty", () => {
    render(<DndContext><BucketCanvas {...base} pieces={[]} disabled={false} onRemove={vi.fn()} /></DndContext>);
    expect(screen.getByText(/Drag items here/)).toBeInTheDocument();
  });

  it("places pieces by fraction and removes them", async () => {
    const onRemove = vi.fn();
    render(
      <DndContext>
        <BucketCanvas {...base} pieces={[piece({ x: 0.25, y: 0.75, qty: 2 })]} disabled={false} onRemove={onRemove} />
      </DndContext>,
    );
    const handle = screen.getByRole("button", { name: /Red Rose × 2/ });
    const wrapper = handle.parentElement as HTMLElement;
    expect([wrapper.style.left, wrapper.style.top]).toEqual(["25%", "75%"]);
    await userEvent.click(screen.getByRole("button", { name: "Remove Red Rose" }));
    expect(onRemove).toHaveBeenCalledWith("k1");
  });

  it("shows other people's cursors but not your own", () => {
    render(
      <DndContext>
        <BucketCanvas
          {...base}
          pieces={[]}
          disabled
          onRemove={vi.fn()}
          editors={[{ id: "me", name: "Me", color: "#111" }, { id: "c2", name: "Bilal", color: "#222" }]}
          cursors={{ me: { x: 0.1, y: 0.1 }, c2: { x: 0.5, y: 0.5 } }}
        />
      </DndContext>,
    );
    expect(screen.getByText("Bilal")).toBeInTheDocument();
    expect(screen.queryByText("Me")).not.toBeInTheDocument();
  });
});
