import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SelectMenu from "./SelectMenu";

const options = [
  { value: "", label: "All roles" },
  { value: "admin", label: "Admin" },
  { value: "researcher", label: "Researcher" },
];

describe("SelectMenu", () => {
  it("opens, selects, and closes with the ResearchNAV listbox", async () => {
    const onChange = vi.fn();
    render(
      <SelectMenu
        label="Role"
        value=""
        options={options}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Role" });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("option", { name: "Admin" }));
    expect(onChange).toHaveBeenCalledWith("admin");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("supports arrow navigation, selection, Escape, and outside click", () => {
    const onChange = vi.fn();
    render(
      <SelectMenu
        label="Role"
        value=""
        options={options}
        onChange={onChange}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Role" });

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("admin");

    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
