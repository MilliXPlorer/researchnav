import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import { instituteNames } from "./data";

type Metadata = {
  title: string | null;
  researchers: string[];
  abstract: string | null;
  keywords: string[];
  year: number | null;
  final_binding_date: string | null;
  institute: string | null;
};

type ImportState = "idle" | "importing" | "imported" | "failed";

type ImportResult = {
  source_file_index: number;
  file_name: string;
  file_size: number;
  mime_type: string;
  status: "ready" | "needs_review" | "failed";
  missing_fields: string[];
  metadata: Metadata;
  error?: string;
  import_state: ImportState;
  import_error?: string;
};

type FilterType = "all" | "ready" | "needs_review" | "failed";

const emptyMetadata = (): Metadata => ({
  title: null,
  researchers: [],
  abstract: null,
  keywords: [],
  year: null,
  final_binding_date: null,
  institute: null,
});

const instituteOptions = [...instituteNames, "Unclassified"] as const;

function normalizeMetadata(metadata?: Partial<Metadata>): Metadata {
  return {
    ...emptyMetadata(),
    ...metadata,
    researchers: metadata?.researchers ?? [],
    keywords: metadata?.keywords ?? [],
  };
}

function getMissingFields(metadata: Metadata) {
  const missingFields: string[] = [];

  if (!metadata.title?.trim()) missingFields.push("title");
  if (metadata.researchers.length === 0) missingFields.push("researchers");
  if (!metadata.abstract?.trim()) missingFields.push("abstract");
  if (metadata.keywords.length === 0) missingFields.push("keywords");
  if (!Number.isInteger(metadata.year) || (metadata.year ?? 0) <= 0) {
    missingFields.push("year");
  }
  if (!metadata.final_binding_date?.trim()) {
    missingFields.push("final_binding_date");
  }
  if (!metadata.institute) missingFields.push("institute");

  return missingFields;
}

function formatFileSize(bytes: number) {
  if (!bytes) return "0 KB";

  const mb = bytes / (1024 * 1024);

  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function getFileType(fileName: string) {
  const extension = fileName.split(".").pop()?.toUpperCase();
  return extension || "FILE";
}

function humanizeField(field: string) {
  const labels: Record<string, string> = {
    title: "Research Title",
    researchers: "Researchers",
    abstract: "Abstract",
    keywords: "Keywords",
    year: "Year",
    final_binding_date: "Final Binding Date",
    institute: "Institute",
  };

  return labels[field] || field.replaceAll("_", " ");
}

const styles = {
  page: {
    width: "100%",
    maxWidth: "1120px",
    margin: "0 auto",
    padding: "28px 30px 50px",
    boxSizing: "border-box" as const,
    color: "#1f2937",
  },

  pageHeader: {
    marginBottom: "24px",
  },

  eyebrow: {
    margin: "0 0 5px",
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color: "#667085",
  },

  pageTitle: {
    margin: 0,
    fontSize: "27px",
    lineHeight: 1.25,
    color: "#172033",
    fontWeight: 700,
  },

  pageDescription: {
    maxWidth: "720px",
    margin: "8px 0 0",
    color: "#667085",
    fontSize: "14px",
    lineHeight: 1.6,
  },

  section: {
    background: "#ffffff",
    border: "1px solid #e4e7ec",
    borderRadius: "10px",
    padding: "24px",
    marginBottom: "22px",
  },

  sectionHeading: {
    display: "flex",
    gap: "12px",
    alignItems: "flex-start",
    marginBottom: "20px",
  },

  stepNumber: {
    width: "28px",
    height: "28px",
    minWidth: "28px",
    borderRadius: "50%",
    background: "#263a61",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
    fontWeight: 700,
  },

  sectionTitle: {
    margin: "1px 0 3px",
    fontSize: "18px",
    color: "#172033",
  },

  sectionDescription: {
    margin: 0,
    color: "#667085",
    fontSize: "13px",
    lineHeight: 1.5,
  },

  uploadArea: {
    minHeight: "200px",
    border: "1.5px dashed #b8c0cc",
    borderRadius: "8px",
    background: "#fafbfc",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "center",
    alignItems: "center",
    cursor: "pointer",
    padding: "28px",
    textAlign: "center" as const,
  },

  uploadAreaActive: {
    border: "1.5px dashed #344b76",
    background: "#f5f7fa",
  },

  uploadIcon: {
    width: "42px",
    height: "42px",
    border: "1px solid #d9dee7",
    background: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "8px",
    color: "#344b76",
    fontSize: "23px",
    marginBottom: "12px",
  },

  uploadTitle: {
    margin: 0,
    fontSize: "15px",
    color: "#1f2937",
  },

  uploadText: {
    margin: "5px 0 10px",
    color: "#667085",
    fontSize: "13px",
  },

  uploadHelp: {
    fontSize: "12px",
    color: "#8a94a3",
  },

  selectedFiles: {
    marginTop: "20px",
  },

  selectedHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "10px",
  },

  selectedTitle: {
    margin: 0,
    fontSize: "14px",
    color: "#344054",
  },

  selectedDescription: {
    margin: "3px 0 0",
    color: "#7a8493",
    fontSize: "12px",
  },

  textButton: {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: "#b42318",
    fontSize: "13px",
    fontWeight: 600,
  },

  fileList: {
    borderTop: "1px solid #eaecf0",
  },

  fileRow: {
    display: "flex",
    alignItems: "center",
    minHeight: "63px",
    borderBottom: "1px solid #eaecf0",
    gap: "12px",
  },

  fileType: {
    minWidth: "42px",
    height: "32px",
    padding: "0 7px",
    border: "1px solid #d0d5dd",
    borderRadius: "5px",
    background: "#f9fafb",
    color: "#475467",
    fontSize: "10px",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box" as const,
  },

  fileDetails: {
    minWidth: 0,
    flex: 1,
  },

  fileName: {
    display: "block",
    color: "#344054",
    fontSize: "13px",
    fontWeight: 600,
    wordBreak: "break-word" as const,
  },

  fileSize: {
    display: "block",
    marginTop: "3px",
    color: "#98a2b3",
    fontSize: "11px",
  },

  removeButton: {
    width: "30px",
    height: "30px",
    border: "none",
    background: "transparent",
    color: "#667085",
    fontSize: "20px",
    cursor: "pointer",
  },

  actions: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: "10px",
    marginTop: "18px",
    flexWrap: "wrap" as const,
  },

  primaryButton: {
    minHeight: "39px",
    padding: "0 16px",
    borderRadius: "6px",
    border: "1px solid #263a61",
    background: "#263a61",
    color: "#ffffff",
    fontWeight: 600,
    fontSize: "13px",
    cursor: "pointer",
  },

  disabledPrimaryButton: {
    minHeight: "39px",
    padding: "0 16px",
    borderRadius: "6px",
    border: "1px solid #aeb6c4",
    background: "#aeb6c4",
    color: "#ffffff",
    fontWeight: 600,
    fontSize: "13px",
    cursor: "not-allowed",
  },

  secondaryButton: {
    minHeight: "39px",
    padding: "0 16px",
    borderRadius: "6px",
    border: "1px solid #d0d5dd",
    background: "#ffffff",
    color: "#344054",
    fontWeight: 600,
    fontSize: "13px",
    cursor: "pointer",
  },

  summaryBox: {
    border: "1px solid #e4e7ec",
    borderRadius: "8px",
    padding: "16px 18px",
    background: "#f9fafb",
    marginBottom: "18px",
  },

  summaryTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "15px",
    flexWrap: "wrap" as const,
  },

  summaryTitle: {
    display: "block",
    color: "#344054",
    fontSize: "14px",
  },

  summaryText: {
    display: "block",
    marginTop: "4px",
    color: "#667085",
    fontSize: "12px",
  },

  filterRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap" as const,
    marginTop: "15px",
  },

  filterBase: {
    padding: "9px 14px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },

  listHeading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    margin: "20px 0 12px",
  },

  listHeadingTitle: {
    margin: 0,
    fontSize: "14px",
    color: "#344054",
  },

  listHeadingText: {
    margin: "3px 0 0",
    fontSize: "11px",
    color: "#667085",
  },

  reviewList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "14px",
  },

  reviewCard: {
    border: "1px solid #e4e7ec",
    borderRadius: "8px",
    overflow: "hidden",
    background: "#ffffff",
  },

  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "15px",
    padding: "15px 18px",
    background: "#fbfcfd",
    borderBottom: "1px solid #eaecf0",
    flexWrap: "wrap" as const,
  },

  cardFileInfo: {
    display: "flex",
    gap: "11px",
    alignItems: "center",
    minWidth: 0,
    flex: 1,
  },

  cardTitle: {
    margin: 0,
    color: "#344054",
    fontSize: "14px",
    fontWeight: 650,
    wordBreak: "break-word" as const,
  },

  cardMeta: {
    margin: "3px 0 0",
    color: "#98a2b3",
    fontSize: "11px",
  },

  badgeReady: {
    borderRadius: "4px",
    padding: "5px 8px",
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    color: "#137333",
    background: "#eaf7ee",
  },

  badgeReview: {
    borderRadius: "4px",
    padding: "5px 8px",
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    color: "#8a5705",
    background: "#fff5dd",
  },

  badgeFailed: {
    borderRadius: "4px",
    padding: "5px 8px",
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    color: "#a82019",
    background: "#fdecea",
  },

  badgeImporting: {
    borderRadius: "4px",
    padding: "5px 8px",
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    color: "#344b76",
    background: "#edf2fb",
  },

  badgeImported: {
    borderRadius: "4px",
    padding: "5px 8px",
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    color: "#137333",
    background: "#eaf7ee",
  },

  failedContent: {
    padding: "17px 18px",
  },

  failedBox: {
    padding: "12px 14px",
    border: "1px solid #f3c7c3",
    background: "#fff8f7",
    borderRadius: "6px",
  },

  failedTitle: {
    margin: 0,
    fontSize: "13px",
    color: "#8f1d17",
  },

  failedText: {
    margin: "5px 0 0",
    color: "#7a3430",
    fontSize: "12px",
    lineHeight: 1.55,
  },

  failedNote: {
    margin: "10px 0 0",
    color: "#667085",
    fontSize: "11px",
  },

  importNotice: {
    marginBottom: "18px",
    padding: "11px 13px",
    border: "1px solid #d4e8d9",
    background: "#f2fbf4",
    borderRadius: "6px",
    color: "#137333",
    fontSize: "12px",
  },

  importError: {
    marginBottom: "18px",
    padding: "11px 13px",
    border: "1px solid #f3c7c3",
    background: "#fff8f7",
    borderRadius: "6px",
    color: "#8f1d17",
    fontSize: "12px",
  },

  metadataContent: {
    padding: "18px",
  },

  missingBox: {
    marginBottom: "18px",
    padding: "11px 13px",
    background: "#fffaeb",
    border: "1px solid #f5df9a",
    borderRadius: "6px",
  },

  missingTitle: {
    display: "block",
    fontSize: "12px",
    color: "#805500",
    marginBottom: "8px",
  },

  missingTags: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap" as const,
  },

  missingTag: {
    background: "#ffffff",
    border: "1px solid #efcf74",
    color: "#805500",
    borderRadius: "4px",
    padding: "3px 7px",
    fontSize: "11px",
  },

  field: {
    marginBottom: "16px",
  },

  label: {
    display: "block",
    marginBottom: "6px",
    color: "#344054",
    fontSize: "12px",
    fontWeight: 600,
  },

  hint: {
    display: "block",
    margin: "-3px 0 6px",
    color: "#98a2b3",
    fontSize: "10px",
  },

  input: {
    width: "100%",
    boxSizing: "border-box" as const,
    border: "1px solid #d0d5dd",
    borderRadius: "5px",
    background: "#ffffff",
    padding: "9px 10px",
    minHeight: "39px",
    fontFamily: "inherit",
    fontSize: "13px",
    color: "#344054",
    outline: "none",
  },

  textarea: {
    width: "100%",
    boxSizing: "border-box" as const,
    border: "1px solid #d0d5dd",
    borderRadius: "5px",
    background: "#ffffff",
    padding: "9px 10px",
    fontFamily: "inherit",
    fontSize: "13px",
    color: "#344054",
    lineHeight: 1.5,
    resize: "vertical" as const,
    outline: "none",
  },

  fieldGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
  },

  emptyFilter: {
    padding: "30px 20px",
    textAlign: "center" as const,
    color: "#667085",
    border: "1px dashed #d0d5dd",
    borderRadius: "8px",
    background: "#fafbfc",
    fontSize: "13px",
  },

  reviewFooter: {
    marginTop: "20px",
    paddingTop: "18px",
    borderTop: "1px solid #eaecf0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "18px",
    flexWrap: "wrap" as const,
  },

  reviewFooterTitle: {
    margin: 0,
    fontSize: "13px",
    color: "#344054",
  },

  reviewFooterText: {
    margin: "4px 0 0",
    color: "#667085",
    fontSize: "11px",
  },
};

export default function ResearchOfficeBulkImport({
  contextLabel = "Research Office",
}: {
  contextLabel?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const [activeFilter, setActiveFilter] = useState<FilterType>("all");

  const summary = useMemo(() => {
    return {
      ready: results.filter((item) => item.status === "ready").length,

      review: results.filter((item) => item.status === "needs_review").length,

      failed: results.filter((item) => item.status === "failed").length,
      imported: results.filter((item) => item.import_state === "imported")
        .length,
    };
  }, [results]);

  const readyForImport = useMemo(
    () =>
      results.filter(
        (item) => item.status === "ready" && item.import_state !== "imported",
      ),
    [results],
  );

  const filteredResults = useMemo(() => {
    if (activeFilter === "all") {
      return results;
    }

    return results.filter((result) => result.status === activeFilter);
  }, [results, activeFilter]);

  function addFiles(selectedFiles: File[]) {
    if (extracting || importing) return;
    const allowed = selectedFiles.filter((file) => {
      const extension = file.name.split(".").pop()?.toLowerCase();

      return extension === "docx" || extension === "pdf";
    });

    setFiles((current) => [...current, ...allowed].slice(0, 20));

    setResults([]);
    setActiveFilter("all");
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (!event.target.files) return;

    addFiles(Array.from(event.target.files));

    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();

    setDragActive(false);

    addFiles(Array.from(event.dataTransfer.files));
  }

  function removeFile(index: number) {
    if (extracting || importing) return;
    setFiles((current) =>
      current.filter((_, fileIndex) => fileIndex !== index),
    );

    setResults([]);
    setActiveFilter("all");
  }

  function clearFiles() {
    if (extracting || importing) return;
    setFiles([]);
    setResults([]);
    setActiveFilter("all");
  }

  async function handleExtract() {
    if (files.length === 0 || importing) return;

    setExtracting(true);
    setResults([]);
    setActiveFilter("all");

    const extractedResults: ImportResult[] = [];

    for (const [sourceFileIndex, file] of files.entries()) {
      try {
        const formData = new FormData();

        formData.append("files[]", file);

        const response = await fetch("/api/office/bulk-import/preview", {
          method: "POST",
          body: formData,
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          let message = `Unable to extract this manuscript (${response.status}).`;

          try {
            const errorData = await response.json();

            if (errorData?.message) {
              message = errorData.message;
            }
          } catch {
            // Keep fallback message.
          }

          if (response.status === 413) {
            message = "This manuscript exceeds the server upload limit.";
          }

          extractedResults.push({
            source_file_index: sourceFileIndex,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
            status: "failed",
            missing_fields: [],
            metadata: emptyMetadata(),
            import_state: "idle",
            error: message,
          });

          continue;
        }

        const body = await response.json();

        if (Array.isArray(body?.data) && body.data.length > 0) {
          const previewResult = body.data[0];
          const metadata = normalizeMetadata(previewResult.metadata);
          const missingFields =
            previewResult.status === "failed" ? [] : getMissingFields(metadata);

          extractedResults.push({
            ...previewResult,
            source_file_index: sourceFileIndex,
            metadata,
            missing_fields: missingFields,
            status:
              previewResult.status === "failed"
                ? "failed"
                : missingFields.length === 0
                  ? "ready"
                  : "needs_review",
            import_state: "idle",
          });
        } else {
          extractedResults.push({
            source_file_index: sourceFileIndex,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
            status: "failed",
            missing_fields: [],
            metadata: emptyMetadata(),
            import_state: "idle",
            error:
              "No metadata extraction result was returned for this manuscript.",
          });
        }
      } catch {
        extractedResults.push({
          source_file_index: sourceFileIndex,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          status: "failed",
          missing_fields: [],
          metadata: emptyMetadata(),
          import_state: "idle",
          error: "Unable to connect to the manuscript extraction service.",
        });
      }
    }

    setResults(extractedResults);
    setExtracting(false);
  }

  function updateMetadata(
    resultIndex: number,
    field: keyof Metadata,
    value: string,
  ) {
    setResults((current) =>
      current.map((result) => {
        if (result.source_file_index !== resultIndex) {
          return result;
        }

        let parsedValue: string | string[] | number | null = value;

        if (field === "researchers") {
          parsedValue = value
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean);
        }

        if (field === "keywords") {
          parsedValue = value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
        }

        if (field === "year") {
          parsedValue = value.trim() !== "" ? Number(value) : null;
        }

        const updatedMetadata: Metadata = {
          ...result.metadata,
          [field]: parsedValue,
        } as Metadata;

        const missingFields = getMissingFields(updatedMetadata);

        return {
          ...result,
          metadata: updatedMetadata,
          missing_fields: missingFields,
          status: missingFields.length === 0 ? "ready" : "needs_review",
          import_state:
            result.import_state === "failed" ? "idle" : result.import_state,
          import_error: undefined,
        };
      }),
    );
  }

  async function handleImportSelected() {
    if (importing || readyForImport.length === 0) return;

    setImporting(true);

    for (const result of readyForImport) {
      const file = files[result.source_file_index];

      setResults((current) =>
        current.map((item) =>
          item.source_file_index === result.source_file_index
            ? {
                ...item,
                import_state: "importing",
                import_error: undefined,
              }
            : item,
        ),
      );

      if (
        !file ||
        file.name !== result.file_name ||
        file.size !== result.file_size
      ) {
        setResults((current) =>
          current.map((item) =>
            item.source_file_index === result.source_file_index
              ? {
                  ...item,
                  import_state: "failed",
                  import_error:
                    "This manuscript no longer matches the uploaded file. Please extract its metadata again before importing.",
                }
              : item,
          ),
        );
        continue;
      }

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("metadata", JSON.stringify(result.metadata));

        const response = await fetch("/api/office/bulk-import", {
          method: "POST",
          body: formData,
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          let message = "We couldn't import this manuscript. Please try again.";

          try {
            const errorData = await response.json();
            if (typeof errorData?.message === "string") {
              message = errorData.message;
            }
          } catch {
            // Keep the friendly fallback message.
          }

          throw new Error(message);
        }

        setResults((current) =>
          current.map((item) =>
            item.source_file_index === result.source_file_index
              ? {
                  ...item,
                  import_state: "imported",
                  import_error: undefined,
                }
              : item,
          ),
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "We couldn't import this manuscript. Please try again.";

        setResults((current) =>
          current.map((item) =>
            item.source_file_index === result.source_file_index
              ? {
                  ...item,
                  import_state: "failed",
                  import_error: message,
                }
              : item,
          ),
        );
      }
    }

    setImporting(false);
  }

  function statusBadge(result: ImportResult) {
    if (result.import_state === "importing") {
      return <span style={styles.badgeImporting}>Importing</span>;
    }

    if (result.import_state === "imported") {
      return <span style={styles.badgeImported}>Imported</span>;
    }

    if (result.import_state === "failed") {
      return <span style={styles.badgeFailed}>Import Failed</span>;
    }

    const { status } = result;

    if (status === "ready") {
      return <span style={styles.badgeReady}>Ready</span>;
    }

    if (status === "needs_review") {
      return <span style={styles.badgeReview}>Needs Review</span>;
    }

    return <span style={styles.badgeFailed}>Failed</span>;
  }

  function getCardStyle(result: ImportResult) {
    const color =
      result.import_state === "imported"
        ? "#17803d"
        : result.import_state === "importing"
          ? "#344b76"
          : result.import_state === "failed"
            ? "#d92d20"
            : result.status === "ready"
              ? "#17803d"
              : result.status === "needs_review"
                ? "#dc8b09"
                : "#d92d20";

    return {
      ...styles.reviewCard,
      borderLeft: `3px solid ${color}`,
    };
  }

  function getFilterStyle(filter: FilterType) {
    const active = activeFilter === filter;

    if (filter === "all") {
      return {
        ...styles.filterBase,
        border: active ? "1px solid #263a61" : "1px solid #d0d5dd",
        background: active ? "#263a61" : "#ffffff",
        color: active ? "#ffffff" : "#344054",
      };
    }

    if (filter === "ready") {
      return {
        ...styles.filterBase,
        border: active ? "1px solid #16803c" : "1px solid #d0d5dd",
        background: active ? "#eaf7ee" : "#ffffff",
        color: "#137333",
      };
    }

    if (filter === "needs_review") {
      return {
        ...styles.filterBase,
        border: active ? "1px solid #c27a06" : "1px solid #d0d5dd",
        background: active ? "#fff5dd" : "#ffffff",
        color: "#8a5705",
      };
    }

    return {
      ...styles.filterBase,
      border: active ? "1px solid #c4322b" : "1px solid #d0d5dd",
      background: active ? "#fdecea" : "#ffffff",
      color: "#a82019",
    };
  }

  function getFilterTitle() {
    if (activeFilter === "ready") {
      return "Ready Manuscripts";
    }

    if (activeFilter === "needs_review") {
      return "Manuscripts Needing Review";
    }

    if (activeFilter === "failed") {
      return "Failed Manuscripts";
    }

    return "All Manuscripts";
  }

  return (
    <div style={styles.page}>
      <div style={styles.pageHeader}>
        <p style={styles.eyebrow}>{contextLabel}</p>

        <h1 style={styles.pageTitle}>Import Manuscript</h1>

        <p style={styles.pageDescription}>
          Upload finalized research manuscripts and review the extracted
          information before they are added to ResearchNAV.
        </p>
      </div>

      <section style={styles.section}>
        <div style={styles.sectionHeading}>
          <span style={styles.stepNumber}>1</span>

          <div>
            <h2 style={styles.sectionTitle}>Upload Manuscripts</h2>

            <p style={styles.sectionDescription}>
              Select DOCX or text-based PDF manuscript files.
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,.pdf"
          multiple
          onChange={handleFileChange}
          style={{
            display: "none",
          }}
        />

        <div
          style={{
            ...styles.uploadArea,
            ...(dragActive ? styles.uploadAreaActive : {}),
          }}
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragActive(false);
          }}
          onDrop={handleDrop}
        >
          <div style={styles.uploadIcon}>↑</div>

          <h3 style={styles.uploadTitle}>Drop manuscript files here</h3>

          <p style={styles.uploadText}>or click to browse from your computer</p>

          <span style={styles.uploadHelp}>
            Supports DOCX and text-based PDF • Maximum 20 MB per file
          </span>
        </div>

        {files.length > 0 && (
          <div style={styles.selectedFiles}>
            <div style={styles.selectedHeader}>
              <div>
                <h3 style={styles.selectedTitle}>Selected files</h3>

                <p style={styles.selectedDescription}>
                  {files.length}{" "}
                  {files.length === 1 ? "manuscript" : "manuscripts"} selected
                </p>
              </div>

              <button
                type="button"
                onClick={clearFiles}
                style={styles.textButton}
                disabled={extracting || importing}
              >
                Clear files
              </button>
            </div>

            <div style={styles.fileList}>
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${file.size}-${index}`}
                  style={styles.fileRow}
                >
                  <div style={styles.fileType}>{getFileType(file.name)}</div>

                  <div style={styles.fileDetails}>
                    <strong style={styles.fileName}>{file.name}</strong>

                    <span style={styles.fileSize}>
                      {formatFileSize(file.size)}
                    </span>
                  </div>

                  <button
                    type="button"
                    style={styles.removeButton}
                    onClick={() => removeFile(index)}
                    disabled={extracting || importing}
                    aria-label={`Remove ${file.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div style={styles.actions}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => fileInputRef.current?.click()}
                disabled={extracting || importing}
              >
                Add More Files
              </button>

              <button
                type="button"
                style={
                  extracting
                    ? styles.disabledPrimaryButton
                    : styles.primaryButton
                }
                disabled={extracting || importing}
                onClick={handleExtract}
              >
                {extracting
                  ? "Extracting Metadata..."
                  : importing
                    ? "Importing Manuscripts..."
                    : "Extract Metadata"}
              </button>
            </div>
          </div>
        )}
      </section>

      {results.length > 0 && (
        <section style={styles.section}>
          <div style={styles.sectionHeading}>
            <span style={styles.stepNumber}>2</span>

            <div>
              <h2 style={styles.sectionTitle}>Review Extracted Metadata</h2>

              <p style={styles.sectionDescription}>
                Check extracted information and correct missing or inaccurate
                details.
              </p>
            </div>
          </div>

          <div style={styles.summaryBox}>
            <div style={styles.summaryTop}>
              <div>
                <strong style={styles.summaryTitle}>
                  {results.length}{" "}
                  {results.length === 1 ? "manuscript" : "manuscripts"}{" "}
                  processed
                </strong>

                <span style={styles.summaryText}>
                  Select a status below to review the manuscripts.
                </span>
              </div>
            </div>

            <div style={styles.filterRow}>
              <button
                type="button"
                onClick={() => setActiveFilter("all")}
                style={getFilterStyle("all")}
              >
                All ({results.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter("ready")}
                style={getFilterStyle("ready")}
              >
                Ready ({summary.ready})
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter("needs_review")}
                style={getFilterStyle("needs_review")}
              >
                Needs Review ({summary.review})
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter("failed")}
                style={getFilterStyle("failed")}
              >
                Failed ({summary.failed})
              </button>
            </div>
          </div>

          <div style={styles.listHeading}>
            <div>
              <h3 style={styles.listHeadingTitle}>{getFilterTitle()}</h3>

              <p style={styles.listHeadingText}>
                {filteredResults.length}{" "}
                {filteredResults.length === 1 ? "manuscript" : "manuscripts"}
              </p>
            </div>
          </div>

          {filteredResults.length === 0 ? (
            <div style={styles.emptyFilter}>
              No manuscripts are currently in this status.
            </div>
          ) : (
            <div style={styles.reviewList}>
              {filteredResults.map((result) => {
                const originalIndex = result.source_file_index;

                return (
                  <article
                    key={`${result.file_name}-${result.file_size}`}
                    style={getCardStyle(result)}
                  >
                    <header style={styles.cardHeader}>
                      <div style={styles.cardFileInfo}>
                        <div style={styles.fileType}>
                          {getFileType(result.file_name)}
                        </div>

                        <div
                          style={{
                            minWidth: 0,
                          }}
                        >
                          <h3 style={styles.cardTitle}>{result.file_name}</h3>

                          <p style={styles.cardMeta}>
                            {getFileType(result.file_name)} •{" "}
                            {formatFileSize(result.file_size)}
                          </p>
                        </div>
                      </div>

                      {statusBadge(result)}
                    </header>

                    {result.status === "failed" ? (
                      <div style={styles.failedContent}>
                        <div style={styles.failedBox}>
                          <strong style={styles.failedTitle}>
                            This manuscript could not be processed.
                          </strong>

                          <p style={styles.failedText}>
                            {result.error ||
                              "Please upload a valid DOCX or text-based PDF copy."}
                          </p>
                        </div>

                        <p style={styles.failedNote}>
                          This failed file will not prevent other manuscripts
                          from being reviewed.
                        </p>
                      </div>
                    ) : (
                      <div style={styles.metadataContent}>
                        {result.import_state === "imported" && (
                          <div style={styles.importNotice} role="status">
                            This manuscript was imported successfully.
                          </div>
                        )}

                        {result.import_state === "failed" && (
                          <div style={styles.importError} role="alert">
                            {result.import_error ||
                              "We couldn't import this manuscript. Please try again."}
                          </div>
                        )}

                        {result.missing_fields.length > 0 && (
                          <div style={styles.missingBox}>
                            <strong style={styles.missingTitle}>
                              Missing information
                            </strong>

                            <div style={styles.missingTags}>
                              {result.missing_fields.map((field) => (
                                <span key={field} style={styles.missingTag}>
                                  {humanizeField(field)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div style={styles.field}>
                          <label
                            htmlFor={`title-${originalIndex}`}
                            style={styles.label}
                          >
                            Research Title
                          </label>

                          <input
                            id={`title-${originalIndex}`}
                            type="text"
                            style={styles.input}
                            value={result.metadata.title || ""}
                            onChange={(event) =>
                              updateMetadata(
                                originalIndex,
                                "title",
                                event.target.value,
                              )
                            }
                            disabled={
                              importing || result.import_state === "imported"
                            }
                          />
                        </div>

                        <div style={styles.field}>
                          <label
                            htmlFor={`researchers-${originalIndex}`}
                            style={styles.label}
                          >
                            Researchers
                          </label>

                          <span style={styles.hint}>
                            Enter one researcher per line.
                          </span>

                          <textarea
                            id={`researchers-${originalIndex}`}
                            rows={4}
                            style={styles.textarea}
                            disabled={
                              importing || result.import_state === "imported"
                            }
                            value={
                              result.metadata.researchers?.join("\n") || ""
                            }
                            onChange={(event) =>
                              updateMetadata(
                                originalIndex,
                                "researchers",
                                event.target.value,
                              )
                            }
                          />
                        </div>

                        <div style={styles.field}>
                          <label
                            htmlFor={`abstract-${originalIndex}`}
                            style={styles.label}
                          >
                            Abstract
                          </label>

                          <textarea
                            id={`abstract-${originalIndex}`}
                            rows={6}
                            style={styles.textarea}
                            disabled={
                              importing || result.import_state === "imported"
                            }
                            value={result.metadata.abstract || ""}
                            onChange={(event) =>
                              updateMetadata(
                                originalIndex,
                                "abstract",
                                event.target.value,
                              )
                            }
                          />
                        </div>

                        <div style={styles.field}>
                          <label
                            htmlFor={`keywords-${originalIndex}`}
                            style={styles.label}
                          >
                            Keywords
                          </label>

                          <span style={styles.hint}>
                            Separate keywords using commas.
                          </span>

                          <input
                            id={`keywords-${originalIndex}`}
                            type="text"
                            style={styles.input}
                            disabled={
                              importing || result.import_state === "imported"
                            }
                            value={result.metadata.keywords?.join(", ") || ""}
                            onChange={(event) =>
                              updateMetadata(
                                originalIndex,
                                "keywords",
                                event.target.value,
                              )
                            }
                          />
                        </div>

                        <div style={styles.fieldGrid}>
                          <div style={styles.field}>
                            <label
                              htmlFor={`institute-${originalIndex}`}
                              style={styles.label}
                            >
                              Institute
                            </label>

                            <select
                              id={`institute-${originalIndex}`}
                              style={styles.input}
                              value={result.metadata.institute || ""}
                              onChange={(event) =>
                                updateMetadata(
                                  originalIndex,
                                  "institute",
                                  event.target.value,
                                )
                              }
                              disabled={
                                importing || result.import_state === "imported"
                              }
                            >
                              <option value="">Select an institute</option>
                              {instituteOptions.map((institute) => (
                                <option key={institute} value={institute}>
                                  {institute}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div style={styles.field}>
                            <label
                              htmlFor={`year-${originalIndex}`}
                              style={styles.label}
                            >
                              Year
                            </label>

                            <input
                              id={`year-${originalIndex}`}
                              type="number"
                              min="2000"
                              max="2100"
                              style={styles.input}
                              disabled={
                                importing || result.import_state === "imported"
                              }
                              value={result.metadata.year || ""}
                              onChange={(event) =>
                                updateMetadata(
                                  originalIndex,
                                  "year",
                                  event.target.value,
                                )
                              }
                            />
                          </div>

                          <div style={styles.field}>
                            <label
                              htmlFor={`final-binding-date-${originalIndex}`}
                              style={styles.label}
                            >
                              Final Binding Date
                            </label>

                            <input
                              id={`final-binding-date-${originalIndex}`}
                              type="text"
                              style={styles.input}
                              value={result.metadata.final_binding_date || ""}
                              onChange={(event) =>
                                updateMetadata(
                                  originalIndex,
                                  "final_binding_date",
                                  event.target.value,
                                )
                              }
                              placeholder="e.g. December 2025"
                              disabled={
                                importing || result.import_state === "imported"
                              }
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          <div style={styles.reviewFooter}>
            <div>
              <strong style={styles.reviewFooterTitle}>
                {readyForImport.length} ready for import
              </strong>

              <p style={styles.reviewFooterText}>
                {summary.imported > 0
                  ? `${summary.imported} manuscript${summary.imported === 1 ? " has" : "s have"} been imported. `
                  : ""}
                Complete manuscripts marked Needs Review before final import.
              </p>
            </div>

            <button
              type="button"
              disabled={importing || readyForImport.length === 0}
              style={
                importing || readyForImport.length === 0
                  ? styles.disabledPrimaryButton
                  : styles.primaryButton
              }
              onClick={handleImportSelected}
            >
              {importing
                ? "Importing Manuscripts..."
                : "Import Selected Manuscripts"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
