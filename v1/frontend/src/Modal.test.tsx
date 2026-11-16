import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Modal } from "./Modal";

it("requires an explicit discard decision and confines focus to its alert dialog", async () => {
  const onClose = vi.fn();
  render(
    <Modal label="Editor" onClose={onClose} dirty>
      <input aria-label="Draft title" />
    </Modal>,
  );

  const close = screen.getByRole("button", { name: "Close Editor" });
  fireEvent.click(close);
  const prompt = await screen.findByRole("alertdialog", {
    name: "Unsaved changes",
  });
  const keepEditing = screen.getByRole("button", { name: "Keep editing" });
  const discard = screen.getByRole("button", { name: "Discard changes" });
  expect(keepEditing).toHaveFocus();

  fireEvent.keyDown(prompt, { key: "Tab", shiftKey: true });
  expect(discard).toHaveFocus();
  fireEvent.keyDown(prompt, { key: "Tab" });
  expect(keepEditing).toHaveFocus();
  fireEvent.keyDown(prompt, { key: "Escape" });
  fireEvent.mouseDown(document.querySelector(".modal-backdrop")!);
  fireEvent.click(close);

  expect(onClose).not.toHaveBeenCalled();
  expect(prompt).toBeInTheDocument();
  fireEvent.click(keepEditing);
  await waitFor(() => expect(close).toHaveFocus());
});
