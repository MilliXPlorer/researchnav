import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ManuscriptFilePicker from "./ManuscriptFilePicker";

describe("ManuscriptFilePicker", () => {
  it("opens and accepts a single PDF from the explicit file button", () => {
    const onChange = vi.fn();
    render(
      <ManuscriptFilePicker
        label="Manuscript file"
        help="Choose one PDF"
        accept="application/pdf,.pdf"
        file={null}
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText("Manuscript file");
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Select one file" }));
    expect(click).toHaveBeenCalledOnce();

    const pdf = new File(["pdf"], "manuscript.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(input, { target: { files: [pdf] } });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("passes dropped files to the shared drop handler", () => {
    const onDropFiles = vi.fn();
    render(
      <ManuscriptFilePicker
        label="Manuscript file"
        help="Choose one PDF"
        accept="application/pdf,.pdf"
        file={null}
        onChange={vi.fn()}
        onDropFiles={onDropFiles}
      />,
    );

    const pdf = new File(["pdf"], "manuscript.pdf", {
      type: "application/pdf",
    });
    fireEvent.drop(screen.getByText("Choose manuscript file").closest("div")!, {
      dataTransfer: { files: [pdf] },
    });
    expect(onDropFiles).toHaveBeenCalledWith([pdf]);
  });

  it("reads PDF files recursively from a dropped browser directory", async () => {
    const onDropFiles = vi.fn();
    const pdf = new File(["pdf"], "chapter.pdf", {
      type: "application/pdf",
    });
    const fileEntry = {
      isFile: true,
      isDirectory: false,
      file: (callback: (file: File) => void) => callback(pdf),
    };
    let read = false;
    const directoryEntry = {
      isFile: false,
      isDirectory: true,
      createReader: () => ({
        readEntries: (callback: (entries: unknown[]) => void) => {
          const entries = read ? [] : [fileEntry];
          read = true;
          callback(entries);
        },
      }),
    };
    render(
      <ManuscriptFilePicker
        label="Manuscript file"
        help="Choose one PDF"
        accept="application/pdf,.pdf"
        file={null}
        onChange={vi.fn()}
        onDropFiles={onDropFiles}
      />,
    );

    fireEvent.drop(screen.getByText("Choose manuscript file").closest("div")!, {
      dataTransfer: {
        files: [],
        items: [{ webkitGetAsEntry: () => directoryEntry }],
      },
    });

    await waitFor(() => expect(onDropFiles).toHaveBeenCalledWith([pdf]));
  });
});
