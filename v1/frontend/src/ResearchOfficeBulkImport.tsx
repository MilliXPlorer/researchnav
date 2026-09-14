import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import { instituteNames } from "./data";
import { Modal } from "./Modal";
import { Pencil, RefreshCw, Save } from "lucide-react";

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
  source_file_indices?: number[];
  folder_name?: string;
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

type DirectoryHandle = {
  kind: "directory";
  name: string;
  values(): AsyncIterableIterator<DirectoryHandle | FileHandle>;
};

type FileHandle = {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
};

function selectedSubfolder(file: File) {
  if (!file.webkitRelativePath) return undefined;
  const parts = file.webkitRelativePath.split("/");
  return parts.length > 2 ? parts[1] : undefined;
}

function metadataFileRank(name: string) {
  if (
    /(front|cover|prelim|pre[\s_-]*pages?|title[\s_-]*page|table[\s_-]*of[\s_-]*contents?)/i.test(
      name,
    )
  )
    return 0;
  if (/(source[\s_-]*code|appendix|reference|minutes)/i.test(name)) return 4;
  if (
    /(final[\s_-]*binding|bookbind|full[\s_-]*manuscript|manuscript|thesis)/i.test(
      name,
    )
  )
    return 1;
  if (/(content|body|chapter)/i.test(name)) return 2;
  return 3;
}

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

function uniqueKeywords(keywords: string[]) {
  const seen = new Set<string>();

  return keywords
    .map((keyword) => keyword.trim())
    .filter((keyword) => {
      const normalized = keyword.toLocaleLowerCase();
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

function normalizeMetadata(metadata?: Partial<Metadata>): Metadata {
  return {
    ...emptyMetadata(),
    ...metadata,
    researchers: metadata?.researchers ?? [],
    keywords: uniqueKeywords(metadata?.keywords ?? []),
  };
}

function getMissingFields(metadata: Metadata) {
  const missingFields: string[] = [];

  if (!metadata.title?.trim() || metadata.title.length > 500)
    missingFields.push("title");
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
    color: "#172019",
    fontFamily: '"Inter", Arial, sans-serif',
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
    color: "#5b6660",
  },

  pageTitle: {
    margin: 0,
    fontSize: "27px",
    lineHeight: 1.25,
    color: "#10331f",
    fontWeight: 700,
    fontFamily: '"Source Serif 4", Georgia, serif',
  },

  pageDescription: {
    maxWidth: "720px",
    margin: "8px 0 0",
    color: "#5b6660",
    fontSize: "14px",
    lineHeight: 1.6,
  },

  section: {
    background: "#ffffff",
    border: "1px solid #e2ebe5",
    borderRadius: "11px",
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
    background: "#1f5c3d",
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
    color: "#10331f",
    fontFamily: '"Source Serif 4", Georgia, serif',
  },

  sectionDescription: {
    margin: 0,
    color: "#5b6660",
    fontSize: "13px",
    lineHeight: 1.5,
  },

  uploadArea: {
    minHeight: "200px",
    border: "1.5px dashed #9dbbaa",
    borderRadius: "8px",
    background: "linear-gradient(145deg, #ffffff, #f4f8f5)",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "center",
    alignItems: "center",
    cursor: "pointer",
    padding: "28px",
    textAlign: "center" as const,
  },

  uploadAreaActive: {
    border: "1.5px dashed #276749",
    background: "#f0f7f2",
  },

  uploadIcon: {
    width: "42px",
    height: "42px",
    border: "1px solid #d2e3d8",
    background: "#e8f2eb",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "8px",
    color: "#1f5d42",
    fontSize: "23px",
    marginBottom: "12px",
  },

  uploadTitle: {
    margin: 0,
    fontSize: "15px",
    color: "#173f2d",
  },

  uploadText: {
    margin: "5px 0 10px",
    color: "#5c6f65",
    fontSize: "13px",
  },

  uploadHelp: {
    fontSize: "12px",
    color: "#6f8077",
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
    color: "#10331f",
    fontFamily: '"Source Serif 4", Georgia, serif',
  },

  selectedDescription: {
    margin: "3px 0 0",
    color: "#5b6660",
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
    borderTop: "1px solid #e2ebe5",
  },

  fileRow: {
    display: "flex",
    alignItems: "center",
    minHeight: "63px",
    borderBottom: "1px solid #e2ebe5",
    gap: "12px",
  },

  fileType: {
    minWidth: "42px",
    height: "32px",
    padding: "0 7px",
    border: "1px solid #d2e3d8",
    borderRadius: "5px",
    background: "#f3f7f4",
    color: "#1f5c3d",
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
    color: "#172019",
    fontSize: "13px",
    fontWeight: 600,
    wordBreak: "break-word" as const,
  },

  fileSize: {
    display: "block",
    marginTop: "3px",
    color: "#5b6660",
    fontSize: "11px",
  },

  removeButton: {
    width: "30px",
    height: "30px",
    border: "none",
    background: "transparent",
    color: "#5b6660",
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
    border: "1px solid #1f5d42",
    background: "#1f5d42",
    color: "#ffffff",
    fontWeight: 600,
    fontSize: "13px",
    cursor: "pointer",
  },

  disabledPrimaryButton: {
    minHeight: "39px",
    padding: "0 16px",
    borderRadius: "6px",
    border: "1px solid #9dbbaa",
    background: "#9dbbaa",
    color: "#ffffff",
    fontWeight: 600,
    fontSize: "13px",
    cursor: "not-allowed",
  },

  secondaryButton: {
    minHeight: "39px",
    padding: "0 16px",
    borderRadius: "6px",
    border: "1px solid #bfd2c5",
    background: "#ffffff",
    color: "#1f5d42",
    fontWeight: 600,
    fontSize: "13px",
    cursor: "pointer",
  },

  summaryBox: {
    border: "1px solid #e2ebe5",
    borderRadius: "8px",
    padding: "16px 18px",
    background: "#f3f7f4",
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
    color: "#10331f",
    fontFamily: '"Source Serif 4", Georgia, serif',
    fontSize: "14px",
  },

  summaryText: {
    display: "block",
    marginTop: "4px",
    color: "#5b6660",
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
    color: "#10331f",
    fontFamily: '"Source Serif 4", Georgia, serif',
  },

  listHeadingText: {
    margin: "3px 0 0",
    fontSize: "11px",
    color: "#5b6660",
  },

  reviewList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "14px",
  },

  reviewCard: {
    border: "1px solid #e2ebe5",
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
    background: "#f3f7f4",
    borderBottom: "1px solid #e2ebe5",
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
    color: "#10331f",
    fontFamily: '"Source Serif 4", Georgia, serif',
    fontSize: "14px",
    fontWeight: 650,
    wordBreak: "break-word" as const,
  },

  cardMeta: {
    margin: "3px 0 0",
    color: "#5b6660",
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
    color: "#1f5c3d",
    background: "#e6f1ea",
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
    color: "#5b6660",
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
    color: "#10331f",
    fontSize: "12px",
    fontWeight: 600,
  },

  hint: {
    display: "block",
    margin: "-3px 0 6px",
    color: "#5b6660",
    fontSize: "10px",
  },

  input: {
    width: "100%",
    boxSizing: "border-box" as const,
    border: "1px solid #d2e3d8",
    borderRadius: "5px",
    background: "#ffffff",
    padding: "9px 10px",
    minHeight: "39px",
    fontFamily: "inherit",
    fontSize: "13px",
    color: "#172019",
    outline: "none",
  },

  textarea: {
    width: "100%",
    boxSizing: "border-box" as const,
    border: "1px solid #d2e3d8",
    borderRadius: "5px",
    background: "#ffffff",
    padding: "9px 10px",
    fontFamily: "inherit",
    fontSize: "13px",
    color: "#172019",
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
    color: "#5b6660",
    border: "1px dashed #bfd2c5",
    borderRadius: "8px",
    background: "#fafbfc",
    fontSize: "13px",
  },

  reviewFooter: {
    marginTop: "20px",
    paddingTop: "18px",
    borderTop: "1px solid #e2ebe5",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "18px",
    flexWrap: "wrap" as const,
  },

  reviewFooterTitle: {
    margin: 0,
    fontSize: "13px",
    color: "#10331f",
  },

  reviewFooterText: {
    margin: "4px 0 0",
    color: "#5b6660",
    fontSize: "11px",
  },
};

export default function ResearchOfficeBulkImport({
  contextLabel = "Research Office",
}: {
  contextLabel?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [skippedFiles, setSkippedFiles] = useState<string[]>([]);
  const [extractionProgress, setExtractionProgress] = useState<{
    completed: number;
    total: number;
    current: string;
  } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    completed: number;
    total: number;
    current: string;
  } | null>(null);
  const [uploadReport, setUploadReport] = useState<{
    uploaded: number;
    failed: Array<{ name: string; message: string }>;
  } | null>(null);
  const uploadLock = useRef(false);
  const [editingMetadata, setEditingMetadata] = useState<number | null>(null);
  const [metadataDirty, setMetadataDirty] = useState<Record<number, boolean>>(
    {},
  );
  const [metadataNotice, setMetadataNotice] = useState("");

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
  const retryableUploads = results.filter(
    (item) => item.status === "ready" && item.import_state === "failed",
  ).length;
  const pendingUploads = readyForImport.length - retryableUploads;

  const filteredResults = useMemo(() => {
    if (activeFilter === "all") {
      return results;
    }

    return results.filter((result) => result.status === activeFilter);
  }, [results, activeFilter]);

  const uploadUnits = useMemo(() => {
    const folderGroups = new Map<string, number[]>();
    files.forEach((file, index) => {
      const folder = selectedSubfolder(file);
      if (!folder) return;
      folderGroups.set(folder, [...(folderGroups.get(folder) ?? []), index]);
    });
    const studyFolders = [...folderGroups.values()];
    const groupedIndexes = new Set(studyFolders.flat());

    return [
      ...studyFolders,
      ...files
        .map((_, index) => [index])
        .filter(([index]) => !groupedIndexes.has(index)),
    ].map((indexes) =>
      indexes.sort((a, b) => {
        return (
          metadataFileRank(files[a].name) - metadataFileRank(files[b].name) ||
          files[a].name.localeCompare(files[b].name, undefined, {
            sensitivity: "base",
          }) ||
          files[a].name.localeCompare(files[b].name)
        );
      }),
    );
  }, [files]);

  function addFiles(selectedFiles: File[]) {
    if (extracting || importing) return;
    const allowed = selectedFiles.filter((file) => {
      const extension = file.name.split(".").pop()?.toLowerCase();

      return extension === "docx" || extension === "pdf";
    });
    const skipped = selectedFiles
      .filter((file) => !allowed.includes(file))
      .map((file) => file.webkitRelativePath || file.name);
    setSkippedFiles((current) => [...new Set([...current, ...skipped])]);

    setFiles((current) => {
      const identities = new Set(
        current.map(
          (file) =>
            `${file.webkitRelativePath || file.name}|${file.size}|${file.lastModified}`,
        ),
      );
      return [
        ...current,
        ...allowed.filter((file) => {
          const identity = `${file.webkitRelativePath || file.name}|${file.size}|${file.lastModified}`;
          if (identities.has(identity)) return false;
          identities.add(identity);
          return true;
        }),
      ];
    });

    setResults([]);
    setActiveFilter("all");
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (!event.target.files) return;

    addFiles(Array.from(event.target.files));

    event.target.value = "";
  }

  async function selectFolder() {
    const picker = (
      window as Window & {
        showDirectoryPicker?: () => Promise<DirectoryHandle>;
      }
    ).showDirectoryPicker;
    if (!picker) {
      folderInputRef.current?.click();
      return;
    }

    try {
      const root = await picker();
      const selected: File[] = [];
      async function collect(directory: DirectoryHandle, path: string) {
        for await (const entry of directory.values()) {
          if (entry.kind === "file") {
            const file = await entry.getFile();
            Object.defineProperty(file, "webkitRelativePath", {
              value: `${path}/${entry.name}`,
              configurable: true,
            });
            selected.push(file);
          } else {
            await collect(entry, `${path}/${entry.name}`);
          }
        }
      }
      await collect(root, root.name);
      addFiles(selected);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      folderInputRef.current?.click();
    }
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

  function removeStudy(indexes: number[]) {
    if (extracting || importing) return;
    const removed = new Set(indexes);
    setFiles((current) =>
      current.filter((_, fileIndex) => !removed.has(fileIndex)),
    );
    setResults([]);
    setActiveFilter("all");
  }

  function resetSelection() {
    setFiles([]);
    setSkippedFiles([]);
    setResults([]);
    setActiveFilter("all");
    setEditingMetadata(null);
    setMetadataDirty({});
    setMetadataNotice("");
  }

  function clearFiles() {
    if (extracting || importing) return;
    resetSelection();
  }

  async function handleExtract() {
    if (files.length === 0 || importing) return;

    setExtracting(true);
    setExtractionProgress({
      completed: 0,
      total: uploadUnits.length,
      current: "Preparing manuscripts",
    });
    setResults([]);
    setActiveFilter("all");

    const extractedResults: ImportResult[] = [];

    for (const indexes of uploadUnits) {
      const sourceFileIndex = indexes[0];
      const file = files[sourceFileIndex];
      const folderName = selectedSubfolder(file);
      const groupIdentity = {
        source_file_index: sourceFileIndex,
        source_file_indices: indexes,
        folder_name: folderName,
      };
      setExtractionProgress((current) => ({
        completed: current?.completed ?? 0,
        total: uploadUnits.length,
        current: folderName ?? file.name,
      }));
      try {
        const formData = new FormData();

        for (const index of indexes) {
          formData.append("files[]", files[index]);
          formData.append(
            "relative_paths[]",
            files[index].webkitRelativePath || files[index].name,
          );
        }
        if (folderName) {
          formData.append("group_name", folderName);
        }

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
            ...groupIdentity,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
            status: "failed",
            missing_fields: [],
            metadata: emptyMetadata(),
            import_state: "idle",
            error: message,
          });

          setExtractionProgress((current) => ({
            completed: (current?.completed ?? 0) + 1,
            total: uploadUnits.length,
            current: folderName ?? file.name,
          }));

          continue;
        }

        const body = await response.json();

        if (Array.isArray(body?.data) && body.data.length > 0) {
          const previewResult = body.data[0];
          const extractedMetadata = body.data.reduce(
            (combined: Metadata, item: { metadata?: Partial<Metadata> }) => {
              const next = normalizeMetadata(item.metadata);
              return {
                title: combined.title || next.title,
                researchers:
                  combined.researchers.length > 0
                    ? combined.researchers
                    : next.researchers,
                abstract: combined.abstract || next.abstract,
                keywords:
                  combined.keywords.length > 0
                    ? combined.keywords
                    : next.keywords,
                year: combined.year || next.year,
                final_binding_date:
                  combined.final_binding_date || next.final_binding_date,
                institute: combined.institute || next.institute,
              };
            },
            emptyMetadata(),
          );
          const metadata = normalizeMetadata(extractedMetadata);
          const missingFields =
            previewResult.status === "failed" ? [] : getMissingFields(metadata);

          extractedResults.push({
            ...previewResult,
            ...groupIdentity,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
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
            ...groupIdentity,
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
          ...groupIdentity,
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
      setExtractionProgress((current) => ({
        completed: (current?.completed ?? 0) + 1,
        total: uploadUnits.length,
        current: folderName ?? file.name,
      }));
    }

    setResults(extractedResults);
    setExtracting(false);
    setExtractionProgress(null);
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
          parsedValue = uniqueKeywords(value.split(","));
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
          import_state:
            result.import_state === "failed" ? "idle" : result.import_state,
          import_error: undefined,
        };
      }),
    );
    setMetadataDirty((current) => ({ ...current, [resultIndex]: true }));
  }

  function saveMetadata(result: ImportResult) {
    const missing = getMissingFields(result.metadata);
    setResults((current) =>
      current.map((item) =>
        item.source_file_index === result.source_file_index
          ? {
              ...item,
              missing_fields: missing,
              status: missing.length === 0 ? "ready" : "needs_review",
            }
          : item,
      ),
    );
    setMetadataDirty((current) => ({
      ...current,
      [result.source_file_index]: false,
    }));
    setEditingMetadata(null);
    setMetadataNotice(
      missing.length === 0
        ? `Saved metadata for ${result.folder_name ?? result.file_name}.`
        : `Metadata still needs review for ${result.folder_name ?? result.file_name}.`,
    );
  }

  async function reextractMetadata(result: ImportResult) {
    const indexes = result.source_file_indices ?? [result.source_file_index];
    const formData = new FormData();
    indexes.forEach((index) => {
      formData.append("files[]", files[index]);
      formData.append(
        "relative_paths[]",
        files[index].webkitRelativePath || files[index].name,
      );
    });
    if (result.folder_name) formData.append("group_name", result.folder_name);
    setExtractionProgress({
      completed: 0,
      total: 1,
      current: result.folder_name ?? result.file_name,
    });
    try {
      const response = await fetch("/api/office/bulk-import/preview", {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const body = await response.json();
      if (!response.ok || !body?.data?.[0])
        throw new Error(body?.message || "Metadata could not be extracted.");
      const metadata = normalizeMetadata(body.data[0].metadata);
      const missing = getMissingFields(metadata);
      setResults((current) =>
        current.map((item) =>
          item.source_file_index === result.source_file_index
            ? {
                ...item,
                metadata,
                missing_fields: missing,
                status: missing.length === 0 ? "ready" : "needs_review",
                error: undefined,
              }
            : item,
        ),
      );
      setMetadataDirty((current) => ({
        ...current,
        [result.source_file_index]: false,
      }));
      setMetadataNotice(
        `Re-extracted metadata for ${result.folder_name ?? result.file_name}.`,
      );
    } catch (error) {
      setMetadataNotice(
        error instanceof Error
          ? error.message
          : "Metadata could not be extracted.",
      );
    } finally {
      setExtractionProgress(null);
    }
  }

  async function handleImportSelected() {
    if (uploadLock.current || importing || readyForImport.length === 0) return;

    uploadLock.current = true;
    setImporting(true);
    setUploadReport(null);
    setUploadProgress({
      completed: 0,
      total: readyForImport.length,
      current: "Preparing upload",
    });
    let uploaded = 0;
    const failed: Array<{ name: string; message: string }> = [];

    for (const result of readyForImport) {
      const indexes = result.source_file_indices ?? [result.source_file_index];
      const file = files[result.source_file_index];
      setUploadProgress((current) => ({
        completed: current?.completed ?? 0,
        total: readyForImport.length,
        current: result.folder_name ?? result.file_name,
      }));

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
        const message =
          "This manuscript no longer matches the selected file. Please extract its metadata again before uploading.";
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
        failed.push({ name: result.folder_name ?? result.file_name, message });
        setUploadProgress((current) => ({
          completed: (current?.completed ?? 0) + 1,
          total: readyForImport.length,
          current: result.folder_name ?? result.file_name,
        }));
        continue;
      }

      try {
        const formData = new FormData();
        if (indexes.length === 1 && !files[indexes[0]].webkitRelativePath) {
          formData.append("file", files[indexes[0]]);
        } else {
          for (const index of indexes) {
            formData.append("files[]", files[index]);
            formData.append(
              "relative_paths[]",
              files[index].webkitRelativePath || files[index].name,
            );
          }
        }
        formData.append(
          "metadata",
          JSON.stringify({
            ...result.metadata,
            keywords: uniqueKeywords(result.metadata.keywords),
          }),
        );

        const response = await fetch("/api/office/bulk-import", {
          method: "POST",
          body: formData,
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          let message = "We couldn't upload this manuscript. Please try again.";

          try {
            const errorData = await response.json();
            if (typeof errorData?.message === "string") {
              message = errorData.message;
            }
            const fieldErrors = errorData?.errors
              ? Object.values(errorData.errors)
                  .flat()
                  .filter((value): value is string => typeof value === "string")
              : [];
            if (fieldErrors.length > 0) {
              message = fieldErrors.join(" ");
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
        uploaded++;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "We couldn't upload this manuscript. Please try again.";

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
        failed.push({ name: result.folder_name ?? result.file_name, message });
      }
      setUploadProgress((current) => ({
        completed: (current?.completed ?? 0) + 1,
        total: readyForImport.length,
        current: result.folder_name ?? result.file_name,
      }));
    }

    setImporting(false);
    setUploadProgress(null);
    setUploadReport({ uploaded, failed });
    if (failed.length === 0) {
      resetSelection();
    }
    uploadLock.current = false;
  }

  function statusBadge(result: ImportResult) {
    if (result.import_state === "importing") {
      return <span style={styles.badgeImporting}>Uploading</span>;
    }

    if (result.import_state === "imported") {
      return <span style={styles.badgeImported}>Uploaded</span>;
    }

    if (result.import_state === "failed") {
      return <span style={styles.badgeFailed}>Upload Failed</span>;
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
          ? "#1f5c3d"
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
        border: active ? "1px solid #1f5c3d" : "1px solid #bfd2c5",
        background: active ? "#1f5c3d" : "#ffffff",
        color: active ? "#ffffff" : "#10331f",
      };
    }

    if (filter === "ready") {
      return {
        ...styles.filterBase,
        border: active ? "1px solid #16803c" : "1px solid #bfd2c5",
        background: active ? "#eaf7ee" : "#ffffff",
        color: "#137333",
      };
    }

    if (filter === "needs_review") {
      return {
        ...styles.filterBase,
        border: active ? "1px solid #c27a06" : "1px solid #bfd2c5",
        background: active ? "#fff5dd" : "#ffffff",
        color: "#8a5705",
      };
    }

    return {
      ...styles.filterBase,
      border: active ? "1px solid #c4322b" : "1px solid #bfd2c5",
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
      {extractionProgress && (
        <Modal
          label="Extracting manuscript metadata"
          onClose={() => undefined}
          busy
          showClose={false}
        >
          <div style={{ padding: "28px 30px", maxWidth: "440px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "9px",
                marginBottom: "18px",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#206a4b",
                  boxShadow: "0 0 0 5px #e8f3ed",
                }}
              />
              <span
                style={{
                  color: "#5b6660",
                  fontSize: "12px",
                  fontWeight: 700,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                }}
              >
                Extracting metadata
              </span>
            </div>
            <h2
              style={{
                margin: "0 0 6px",
                color: "#10331f",
                fontFamily: '"Source Serif 4", Georgia, serif',
                fontSize: "21px",
              }}
            >
              Processing manuscripts
            </h2>
            <p
              style={{
                margin: "0 0 22px",
                color: "#5b6660",
                fontSize: "13px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={extractionProgress.current}
            >
              {extractionProgress.current}
            </p>
            <div
              role="progressbar"
              aria-label="Metadata extraction progress"
              aria-valuemin={0}
              aria-valuemax={extractionProgress.total}
              aria-valuenow={extractionProgress.completed}
              style={{
                height: "6px",
                overflow: "hidden",
                borderRadius: "999px",
                background: "#e9edf2",
              }}
            >
              <div
                style={{
                  width: `${(extractionProgress.completed / Math.max(1, extractionProgress.total)) * 100}%`,
                  height: "100%",
                  borderRadius: "999px",
                  background: "#206a4b",
                  transition: "width 180ms ease",
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "10px",
                color: "#5b6660",
                fontSize: "12px",
              }}
            >
              <p role="status" aria-live="polite" style={{ margin: 0 }}>
                {extractionProgress.completed} of {extractionProgress.total}{" "}
                studies
              </p>
              <span>
                {Math.round(
                  (extractionProgress.completed /
                    Math.max(1, extractionProgress.total)) *
                    100,
                )}
                %
              </span>
            </div>
          </div>
        </Modal>
      )}
      {uploadProgress && (
        <Modal
          label="Uploading manuscripts"
          onClose={() => undefined}
          busy
          showClose={false}
        >
          <div style={{ padding: "28px 30px", maxWidth: "440px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "9px",
                marginBottom: "18px",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#206a4b",
                  boxShadow: "0 0 0 5px #e8f3ed",
                }}
              />
              <span
                style={{
                  color: "#5b6660",
                  fontSize: "12px",
                  fontWeight: 700,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                }}
              >
                Uploading manuscripts
              </span>
            </div>
            <h2
              style={{
                margin: "0 0 6px",
                color: "#10331f",
                fontFamily: '"Source Serif 4", Georgia, serif',
                fontSize: "21px",
              }}
            >
              Saving to ResearchNAV
            </h2>
            <p
              style={{
                margin: "0 0 22px",
                color: "#5b6660",
                fontSize: "13px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={uploadProgress.current}
            >
              {uploadProgress.current}
            </p>
            <div
              role="progressbar"
              aria-label="Manuscript upload progress"
              aria-valuemin={0}
              aria-valuemax={uploadProgress.total}
              aria-valuenow={uploadProgress.completed}
              style={{
                height: "6px",
                overflow: "hidden",
                borderRadius: "999px",
                background: "#e9edf2",
              }}
            >
              <div
                style={{
                  width: `${(uploadProgress.completed / Math.max(1, uploadProgress.total)) * 100}%`,
                  height: "100%",
                  borderRadius: "999px",
                  background: "#206a4b",
                  transition: "width 180ms ease",
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "10px",
                color: "#5b6660",
                fontSize: "12px",
              }}
            >
              <p role="status" aria-live="polite" style={{ margin: 0 }}>
                {uploadProgress.completed} of {uploadProgress.total} studies
              </p>
              <span>
                {Math.round(
                  (uploadProgress.completed /
                    Math.max(1, uploadProgress.total)) *
                    100,
                )}
                %
              </span>
            </div>
          </div>
        </Modal>
      )}
      {uploadReport && (
        <Modal
          label="Manuscript upload results"
          onClose={() => setUploadReport(null)}
        >
          <div style={{ padding: "28px 30px", maxWidth: "480px" }}>
            <p style={styles.eyebrow}>Upload complete</p>
            <h2
              style={{
                margin: "0 0 8px",
                color: "#10331f",
                fontFamily: '"Source Serif 4", Georgia, serif',
                fontSize: "21px",
              }}
            >
              {uploadReport.failed.length === 0
                ? "All manuscripts uploaded"
                : "Some manuscripts need attention"}
            </h2>
            <p
              style={{ margin: "0 0 18px", color: "#5b6660", fontSize: "13px" }}
            >
              {uploadReport.uploaded} uploaded · {uploadReport.failed.length}{" "}
              not uploaded
            </p>
            {uploadReport.failed.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gap: "8px",
                  maxHeight: "280px",
                  overflowY: "auto",
                }}
              >
                {uploadReport.failed.map((item) => (
                  <div
                    key={item.name}
                    style={{
                      padding: "11px 12px",
                      border: "1px solid #f1c7c0",
                      borderRadius: "7px",
                      background: "#fff7f5",
                    }}
                  >
                    <strong
                      style={{
                        display: "block",
                        color: "#8a341f",
                        fontSize: "13px",
                      }}
                    >
                      {item.name}
                    </strong>
                    <span style={{ color: "#9b4a38", fontSize: "12px" }}>
                      {item.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "20px",
              }}
            >
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => setUploadReport(null)}
              >
                Close
              </button>
              {uploadReport.failed.length > 0 && (
                <button
                  type="button"
                  style={styles.primaryButton}
                  onClick={() => {
                    setUploadReport(null);
                    void handleImportSelected();
                  }}
                >
                  Retry {uploadReport.failed.length} failed{" "}
                  {uploadReport.failed.length === 1 ? "upload" : "uploads"}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
      <div style={styles.pageHeader}>
        <p style={styles.eyebrow}>{contextLabel}</p>

        <h1 style={styles.pageTitle}>Upload Manuscript</h1>

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
        <input
          ref={folderInputRef}
          type="file"
          multiple
          onChange={handleFileChange}
          style={{ display: "none" }}
          {...({ webkitdirectory: "", directory: "" } as Record<
            string,
            string
          >)}
        />

        <div
          style={{
            ...styles.uploadArea,
            ...(dragActive ? styles.uploadAreaActive : {}),
          }}
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

          <h3 style={styles.uploadTitle}>
            Drop manuscript files or folders here
          </h3>

          <p style={styles.uploadText}>
            Choose standalone files or a folder containing one or more studies.
          </p>

          <div
            style={{
              display: "flex",
              gap: "10px",
              marginBottom: "12px",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={styles.secondaryButton}
              disabled={extracting || importing}
            >
              Select files
            </button>
            <button
              type="button"
              onClick={() => void selectFolder()}
              style={styles.primaryButton}
              disabled={extracting || importing}
            >
              Select folder
            </button>
          </div>

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
                  {uploadUnits.length}{" "}
                  {uploadUnits.length === 1 ? "study" : "studies"},{" "}
                  {files.length} {files.length === 1 ? "file" : "files"}{" "}
                  selected
                </p>
                {skippedFiles.length > 0 && (
                  <div
                    role="status"
                    style={{
                      marginTop: "5px",
                      color: "#b42318",
                      fontSize: "12px",
                    }}
                  >
                    <strong>
                      {skippedFiles.length} unsupported{" "}
                      {skippedFiles.length === 1 ? "file was" : "files were"}{" "}
                      skipped:
                    </strong>
                    {skippedFiles.map((path) => (
                      <div key={path}>{path}</div>
                    ))}
                  </div>
                )}
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

            <div
              style={{
                ...styles.actions,
                position: "sticky",
                top: "12px",
                zIndex: 5,
                margin: "0 0 14px",
                justifyContent: "space-between",
                padding: "12px",
                border: "1px solid #e2ebe5",
                borderRadius: "8px",
                background: "rgba(255,255,255,.96)",
                boxShadow: "0 6px 18px rgba(16,24,40,.07)",
                backdropFilter: "blur(8px)",
              }}
            >
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
                {extracting ? "Extracting Metadata..." : "Extract Metadata"}
              </button>
            </div>

            <div
              style={{
                ...styles.fileList,
                maxHeight: "420px",
                overflowY: "auto",
                paddingRight: "6px",
              }}
            >
              {uploadUnits.map((indexes) => {
                const first = files[indexes[0]];
                const folderName = selectedSubfolder(first) ?? null;
                return (
                  <div
                    key={indexes.join("-")}
                    style={{ borderBottom: "1px solid #e2ebe5" }}
                  >
                    <div style={{ ...styles.fileRow, borderBottom: "none" }}>
                      <div style={styles.fileType}>
                        {folderName ? "FOLDER" : getFileType(first.name)}
                      </div>
                      <div style={styles.fileDetails}>
                        <strong style={styles.fileName}>
                          {folderName ?? first.name}
                        </strong>
                        <span style={styles.fileSize}>
                          {folderName
                            ? `${indexes.length} ${indexes.length === 1 ? "file" : "files"}`
                            : formatFileSize(first.size)}
                        </span>
                      </div>
                      <button
                        type="button"
                        style={styles.removeButton}
                        onClick={() =>
                          folderName
                            ? removeStudy(indexes)
                            : removeFile(indexes[0])
                        }
                        disabled={extracting || importing}
                        aria-label={`Remove ${folderName ?? first.name}`}
                      >
                        ×
                      </button>
                    </div>
                    {folderName &&
                      indexes.map((index) => (
                        <div
                          key={index}
                          style={{
                            padding: "0 16px 10px 68px",
                            color: "#5b6660",
                            fontSize: "12px",
                          }}
                        >
                          {files[index].name} ·{" "}
                          {formatFileSize(files[index].size)}
                        </div>
                      ))}
                  </div>
                );
              })}
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
            <div
              style={{
                ...styles.actions,
                position: "sticky",
                top: "12px",
                zIndex: 5,
                marginTop: "16px",
                padding: "12px",
                border: "1px solid #dfe7e2",
                borderRadius: "8px",
                background: "rgba(255,255,255,.97)",
                boxShadow: "0 6px 18px rgba(16,24,40,.08)",
                backdropFilter: "blur(8px)",
              }}
            >
              <div style={{ marginRight: "auto" }}>
                <strong style={styles.reviewFooterTitle}>
                  {pendingUploads > 0
                    ? `${pendingUploads} ready for upload`
                    : retryableUploads > 0
                      ? `${retryableUploads} failed upload${retryableUploads === 1 ? "" : "s"}`
                      : "Upload complete"}
                </strong>
                <p style={styles.reviewFooterText}>
                  Review flagged metadata before uploading.
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
                  ? "Uploading Manuscripts..."
                  : retryableUploads > 0 && pendingUploads === 0
                    ? "Retry Failed Uploads"
                    : "Upload Selected Manuscripts"}
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
          {metadataNotice && (
            <p role="status" style={{ color: "#206a4b", fontSize: "13px" }}>
              {metadataNotice}
            </p>
          )}

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
                          {result.folder_name
                            ? "FOLDER"
                            : getFileType(result.file_name)}
                        </div>

                        <div
                          style={{
                            minWidth: 0,
                          }}
                        >
                          <h3 style={styles.cardTitle}>
                            {result.folder_name ?? result.file_name}
                          </h3>

                          <p style={styles.cardMeta}>
                            {result.folder_name
                              ? `${result.source_file_indices?.length ?? 1} files`
                              : getFileType(result.file_name)}{" "}
                            • {formatFileSize(result.file_size)}
                          </p>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        {result.status === "needs_review" &&
                          result.import_state !== "imported" && (
                            <>
                              {editingMetadata === originalIndex ||
                              metadataDirty[originalIndex] ? (
                                <button
                                  type="button"
                                  style={{
                                    ...styles.secondaryButton,
                                    width: "38px",
                                    padding: 0,
                                  }}
                                  onClick={() => saveMetadata(result)}
                                  aria-label={`Save metadata for ${result.folder_name ?? result.file_name}`}
                                  title="Save metadata"
                                >
                                  <Save size={16} />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  style={{
                                    ...styles.secondaryButton,
                                    width: "38px",
                                    padding: 0,
                                  }}
                                  onClick={() =>
                                    setEditingMetadata(originalIndex)
                                  }
                                  aria-label={`Edit metadata for ${result.folder_name ?? result.file_name}`}
                                  title="Edit metadata"
                                >
                                  <Pencil size={16} />
                                </button>
                              )}
                              <button
                                type="button"
                                style={{
                                  ...styles.secondaryButton,
                                  width: "38px",
                                  padding: 0,
                                }}
                                onClick={() => void reextractMetadata(result)}
                                aria-label={`Re-extract metadata for ${result.folder_name ?? result.file_name}`}
                                title="Re-extract metadata"
                              >
                                <RefreshCw size={16} />
                              </button>
                            </>
                          )}
                        {statusBadge(result)}
                      </div>
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
                            This manuscript was uploaded successfully.
                          </div>
                        )}

                        {result.import_state === "failed" && (
                          <div style={styles.importError} role="alert">
                            {result.import_error ||
                              "We couldn't upload this manuscript. Please try again."}
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
                            maxLength={500}
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
        </section>
      )}
    </div>
  );
}
