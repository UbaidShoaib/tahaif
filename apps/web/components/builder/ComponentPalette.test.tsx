import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext } from "@dnd-kit/core";
import { ComponentPalette } from "@/components/builder/ComponentPalette";
import { bucket, piece } from "@/test/bucket-fixtures";

describe("ComponentPalette", () => {
  it("groups by role and adds with a tap", async () => {
    const onAdd = vi.fn();
    render(<DndContext><ComponentPalette bucket={bucket()} disabled={false} onAdd={onAdd} /></DndContext>);
    expect(screen.getByRole("heading", { name: "Flowers" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Wrapping" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add Red Rose" }));
    expect(onAdd).toHaveBeenCalledWith("rose");
  });

  it("disables an item once its limit is reached", () => {
    render(
      <DndContext>
        <ComponentPalette bucket={bucket({ pieces: [piece({ qty: 3 })] })} disabled={false} onAdd={vi.fn()} />
      </DndContext>,
    );
    expect(screen.getByRole("button", { name: "Add Red Rose" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Kraft Wrap" })).toBeEnabled();
  });
});
