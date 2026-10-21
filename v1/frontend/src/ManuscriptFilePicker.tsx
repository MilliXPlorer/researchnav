import { useId, useState } from "react";
import type { ChangeEventHandler, Ref } from "react";
import { FileText, Upload } from "lucide-react";

export default function ManuscriptFilePicker({
  label,
  help,
  accept,
  file,
  disabled = false,
  inputRef,
  onChange,
  onChooseFolder,
  onDropFiles,
}: {
  label: string;
  help: string;
  accept: string;
  file: File | null;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onChange: ChangeEventHandler<HTMLInputElement>;
  onChooseFolder?: () => void;
  onDropFiles?: (files: File[]) => void;
}) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={`manuscript-picker${disabled ? " is-disabled" : ""}${dragging ? " is-dragging" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (disabled) return;
        const handleFiles = (files: File[]) => {
          if (!files.length) return;
          if (onDropFiles) {
            onDropFiles(files);
            return;
          }
          const transfer = new DataTransfer();
          transfer.items.add(files[0]);
          const input = document.getElementById(
            inputId,
          ) as HTMLInputElement | null;
          if (!input) return;
          input.files = transfer.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        };
        const directoryEntries = dropEntries(event.dataTransfer);
        if (directoryEntries.some((entry) => entry.isDirectory)) {
          void Promise.all(directoryEntries.map(readEntry)).then((files) =>
            handleFiles(files.flat()),
          );
          return;
        }
        handleFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <span className="manuscript-picker-label">{label}</span>
      <span className="manuscript-picker-surface">
        <span className="manuscript-picker-icon" aria-hidden="true">
          {file ? <FileText size={20} /> : <Upload size={20} />}
        </span>
        <span className="manuscript-picker-copy">
          <strong>{file ? file.name : "Choose manuscript file"}</strong>
          <small>
            {dragging
              ? "Drop file here"
              : file
                ? `${formatFileSize(file.size)} selected · Drop to replace`
                : `${help} · Or drop file here`}
          </small>
        </span>
        <span className="manuscript-picker-actions">
          {onChooseFolder && (
            <button
              type="button"
              className="manuscript-picker-folder-action"
              disabled={disabled}
              onClick={(event) => {
                event.preventDefault();
                onChooseFolder();
              }}
            >
              Select PDF folder
            </button>
          )}
          <button
            type="button"
            className="manuscript-picker-action"
            disabled={disabled}
            onClick={() =>
              (
                document.getElementById(inputId) as HTMLInputElement | null
              )?.click()
            }
          >
            {file ? "Replace file" : "Select one file"}
          </button>
        </span>
      </span>
      <input
        id={inputId}
        ref={inputRef}
        aria-label={label}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}

type LegacyFileSystemEntry = {
  isFile: boolean;
  isDirectory: boolean;
  file: (callback: (file: File) => void) => void;
  createReader: () => {
    readEntries: (callback: (entries: LegacyFileSystemEntry[]) => void) => void;
  };
};

function dropEntries(dataTransfer: DataTransfer): LegacyFileSystemEntry[] {
  const entries: LegacyFileSystemEntry[] = [];
  for (const item of Array.from(dataTransfer.items ?? [])) {
    const getEntry = (
      item as DataTransferItem & {
        webkitGetAsEntry?: () => unknown;
      }
    ).webkitGetAsEntry;
    const entry = getEntry?.call(item);
    if (entry) entries.push(entry as LegacyFileSystemEntry);
  }
  return entries;
}

function readEntry(entry: LegacyFileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => entry.file((file) => resolve([file])));
  }
  if (!entry.isDirectory) return Promise.resolve([]);
  const reader = entry.createReader();
  return new Promise((resolve) => {
    const entries: LegacyFileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length) {
          entries.push(...batch);
          readBatch();
          return;
        }
        void Promise.all(entries.map(readEntry)).then((files) =>
          resolve(files.flat()),
        );
      });
    };
    readBatch();
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
