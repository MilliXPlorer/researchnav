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
}: {
  label: string;
  help: string;
  accept: string;
  file: File | null;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onChange: ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <label className={`manuscript-picker${disabled ? " is-disabled" : ""}`}>
      <span className="manuscript-picker-label">{label}</span>
      <span className="manuscript-picker-surface">
        <span className="manuscript-picker-icon" aria-hidden="true">
          {file ? <FileText size={20} /> : <Upload size={20} />}
        </span>
        <span className="manuscript-picker-copy">
          <strong>{file ? file.name : "Choose manuscript file"}</strong>
          <small>{file ? `${formatFileSize(file.size)} selected` : help}</small>
        </span>
        <span className="manuscript-picker-action">
          {file ? "Replace" : "Browse"}
        </span>
      </span>
      <input
        ref={inputRef}
        aria-label={label}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={onChange}
      />
    </label>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
