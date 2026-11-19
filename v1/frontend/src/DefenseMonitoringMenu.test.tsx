import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DefenseMonitoringMenu from "./DefenseMonitoringMenu";

describe("DefenseMonitoringMenu", () => {
  it("opens below its trigger and closes after selecting a defense type", () => {
    const onSelect = vi.fn();

    render(
      <DefenseMonitoringMenu
        active={false}
        defenseType="proposal"
        onSelect={onSelect}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Defense Monitoring Forms",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "Proposal Defense" }),
    ).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: "Proposal Defense" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Final Defense" }));

    expect(onSelect).toHaveBeenCalledWith("final");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "Final Defense" }),
    ).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
