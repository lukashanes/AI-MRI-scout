"use client";

import { useCallback, useRef, useState, useEffect, type InputHTMLAttributes } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { t, type Lang } from "@/lib/i18n";

interface DirectoryPickerFileHandle {
  kind: "file";
  name: string;
  getFile: () => Promise<File>;
}

interface DirectoryPickerDirectoryHandle {
  kind: "directory";
  name: string;
  values: () => AsyncIterable<DirectoryPickerFileHandle | DirectoryPickerDirectoryHandle>;
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: () => Promise<DirectoryPickerDirectoryHandle>;
}

interface UploadedImage {
  id: string;
  file: File;
  name: string;
  preview: string;
  base64: string;
  mediaType: string;
  sourceType: "image" | "dicom";
  originalName?: string;
  dicomMeta?: {
    modality?: string;
    seriesDescription?: string;
    protocolName?: string;
    seriesNumber?: number;
    instanceNumber?: number;
    transferSyntax?: string;
    rows: number;
    cols: number;
  };
}

interface UploadZoneProps {
  images: UploadedImage[];
  onImagesChange: (images: UploadedImage[]) => void;
  disabled?: boolean;
  lang?: Lang;
}

const MAX_SIZE = 20 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_UPLOAD_DIMENSION = 1400;
const JPEG_QUALITY = 0.72;
const DIRECTORY_INPUT_PROPS = { webkitdirectory: "", directory: "" } as unknown as InputHTMLAttributes<HTMLInputElement>;

function isBlobUrl(url: string): boolean {
  return url.startsWith("blob:");
}

function isDirectoryHandle(
  handle: DirectoryPickerFileHandle | DirectoryPickerDirectoryHandle
): handle is DirectoryPickerDirectoryHandle {
  return handle.kind === "directory";
}

async function collectFilesFromDirectory(
  directoryHandle: DirectoryPickerDirectoryHandle
): Promise<File[]> {
  const files: File[] = [];

  for await (const entry of directoryHandle.values()) {
    if (isDirectoryHandle(entry)) {
      files.push(...await collectFilesFromDirectory(entry));
      continue;
    }

    files.push(await entry.getFile());
  }

  return files;
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function optimizeImageForUpload(file: File): Promise<{
  base64: string;
  mediaType: string;
}> {
  const sourceDataUrl = await fileToDataURL(file);
  const img = await loadImage(sourceDataUrl);

  const longestSide = Math.max(img.width, img.height);
  const scale = longestSide > MAX_UPLOAD_DIMENSION ? MAX_UPLOAD_DIMENSION / longestSide : 1;
  const targetWidth = Math.max(1, Math.round(img.width * scale));
  const targetHeight = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      base64: sourceDataUrl.split(",")[1],
      mediaType: file.type,
    };
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  const optimizedDataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const originalBase64 = sourceDataUrl.split(",")[1];
  const optimizedBase64 = optimizedDataUrl.split(",")[1];

  if (optimizedBase64.length >= originalBase64.length) {
    return {
      base64: originalBase64,
      mediaType: file.type,
    };
  }

  return {
    base64: optimizedBase64,
    mediaType: "image/jpeg",
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type { UploadedImage };

export function UploadZone({
  images,
  onImagesChange,
  disabled,
  lang = "en",
}: UploadZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [processingLabel, setProcessingLabel] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const preventBrowserFileOpen = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("dragover", preventBrowserFileOpen);
    window.addEventListener("drop", preventBrowserFileOpen);

    return () => {
      window.removeEventListener("dragover", preventBrowserFileOpen);
      window.removeEventListener("drop", preventBrowserFileOpen);
    };
  }, []);

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      setProcessingLabel(
        lang.startsWith("cs") ? "Připravuji snímky k analýze..." : "Preparing images for analysis..."
      );
      const newImages: UploadedImage[] = [];
      const list = Array.from(files);
      const failures: string[] = [];

      const { convertDicomFile } = await import("@/lib/dicom-client");

      for (let index = 0; index < list.length; index++) {
        const file = list[index];
        if (file.name.toLowerCase() === "desktop.ini") continue;
        if (file.size > MAX_SIZE) continue;

        setProcessingLabel(
          lang.startsWith("cs")
            ? `Zpracovávám ${index + 1}/${list.length}: ${file.name || "DICOM slice"}`
            : `Processing ${index + 1}/${list.length}: ${file.name || "DICOM slice"}`
        );

        if (ACCEPTED_TYPES.includes(file.type)) {
          const optimized = await optimizeImageForUpload(file);
          newImages.push({
            id: crypto.randomUUID(),
            file,
            name: file.name,
            preview: URL.createObjectURL(file),
            base64: optimized.base64,
            mediaType: optimized.mediaType,
            sourceType: "image",
          });
          continue;
        }

        try {
          const converted = await convertDicomFile(file);
          newImages.push({
            id: crypto.randomUUID(),
            file,
            name: converted.name,
            originalName: file.name,
            preview: converted.preview,
            base64: converted.base64,
            mediaType: converted.mediaType,
            sourceType: "dicom",
            dicomMeta: converted.metadata,
          });
        } catch (error) {
          console.error("Failed to convert DICOM file", file.name, error);
          failures.push(file.name);
          continue;
        }
      }

      onImagesChange([...images, ...newImages]);
      if (newImages.length === 0 && failures.length > 0) {
        setProcessingLabel(
          lang.startsWith("cs")
            ? `Import se nezdařil pro ${failures.length} DICOM souborů.`
            : `Import failed for ${failures.length} DICOM files.`
        );
        setTimeout(() => setProcessingLabel(null), 5000);
      } else {
        setProcessingLabel(null);
      }
    },
    [images, lang, onImagesChange]
  );

  const openMasterFolder = useCallback(async () => {
    if (disabled || processingLabel) return;

    const pickerWindow = window as DirectoryPickerWindow;

    if (pickerWindow.showDirectoryPicker) {
      try {
        const handle = await pickerWindow.showDirectoryPicker();
        const files = await collectFilesFromDirectory(handle);
        if (files.length > 0) {
          await processFiles(files);
        }
        return;
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") {
          return;
        }
      }
    }

    directoryInputRef.current?.click();
  }, [disabled, processingLabel, processFiles]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (disabled) return;
      processFiles(e.dataTransfer.files);
    },
    [disabled, processFiles]
  );

  // Cleanup object URLs on unmount to prevent memory leaks
  const prevUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    const currentUrls = images.map((img) => img.preview);
    // Revoke URLs that are no longer in the list
    for (const url of prevUrlsRef.current) {
      if (!currentUrls.includes(url) && isBlobUrl(url)) {
        URL.revokeObjectURL(url);
      }
    }
    prevUrlsRef.current = currentUrls;
    return () => {
      // On unmount, revoke all
      for (const url of currentUrls) {
        if (isBlobUrl(url)) {
          URL.revokeObjectURL(url);
        }
      }
    };
  }, [images]);

  const totalSize = images.reduce((s, img) => s + img.file.size, 0);

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-mono uppercase tracking-wider text-[#00D4AA]">
        {t(lang, "uploadTitle")}
      </h2>

      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onClick={() => void openMasterFolder()}
        className={cn(
          "border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer",
          dragActive
            ? "border-[#00D4AA] bg-[#042F2E]"
            : "border-[#334155] hover:border-[#64748B]",
          (disabled || !!processingLabel) && "opacity-50 cursor-not-allowed"
        )}
        style={{ backgroundColor: dragActive ? undefined : "#111827" }}
      >
        {processingLabel ? (
          <div className="space-y-1">
            <div className="text-[#94A3B8] text-sm">{processingLabel}</div>
            <div className="text-xs text-[#64748B]">
              {lang.startsWith("cs") ? "Probíhá převod a třídění MRI řezů." : "Converting and organizing MRI slices."}
            </div>
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 text-[#64748B] mx-auto mb-2" />
            <p className="text-[#94A3B8] text-sm">
              {lang.startsWith("cs") ? "Otevřete hlavní MRI složku nebo" : "Open the master MRI folder or"}{" "}
              <span className="text-[#00D4AA] underline">
                {lang.startsWith("cs") ? "přetáhněte celý adresář" : "drag the whole directory"}
              </span>
            </p>
            <p className="text-xs text-[#00D4AA] mt-2">
              {lang.startsWith("cs")
                ? "aplikace sama projde podadresáře a najde DICOM soubory"
                : "the app will scan subfolders automatically and find the DICOM files"}
            </p>
            <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
              <label
                role="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void openMasterFolder();
                }}
                className="rounded-full border border-[#134E4A] bg-[#052E2B] px-3 py-1 text-xs text-[#5EEAD4] hover:border-[#00D4AA] hover:text-[#99F6E4] transition-colors"
              >
                {lang.startsWith("cs") ? "Otevřít MRI složku" : "Open MRI folder"}
              </label>
              <label
                htmlFor="mri-upload-files"
                onClick={(e) => e.stopPropagation()}
                className="rounded-full border border-[#334155] bg-[#0F172A] px-3 py-1 text-xs text-[#F1F5F9] hover:border-[#00D4AA] hover:text-[#00D4AA] transition-colors"
              >
                {lang.startsWith("cs") ? "Vybrat jednotlivé soubory" : "Browse files manually"}
              </label>
            </div>
            <p className="hidden text-[#94A3B8] text-sm">
              {t(lang, "uploadDrop")}{" "}
              <span className="text-[#00D4AA] underline">{t(lang, "uploadBrowse")}</span>
            </p>
            <p className="hidden text-xs text-[#00D4AA] mt-2">
              {lang.startsWith("cs") ? "nebo otevřít DICOM složku z CD" : "or open a DICOM folder from the MRI CD"}
            </p>
            <p className="text-xs text-[#64748B] mt-1">
              {t(lang, "uploadHint")}
            </p>
            <div className="hidden mt-3 flex items-center justify-center gap-2 flex-wrap">
              <label
                htmlFor="mri-upload-files"
                onClick={(e) => e.stopPropagation()}
                className="rounded-full border border-[#334155] bg-[#0F172A] px-3 py-1 text-xs text-[#F1F5F9] hover:border-[#00D4AA] hover:text-[#00D4AA] transition-colors"
              >
                {lang.startsWith("cs") ? "Vybrat soubory" : "Browse files"}
              </label>
              <label
                htmlFor="mri-upload-directory"
                onClick={(e) => e.stopPropagation()}
                className="rounded-full border border-[#134E4A] bg-[#052E2B] px-3 py-1 text-xs text-[#5EEAD4] hover:border-[#00D4AA] hover:text-[#99F6E4] transition-colors"
              >
                {lang.startsWith("cs") ? "Vybrat DICOM složku" : "Browse DICOM folder"}
              </label>
            </div>
          </>
        )}
        <input
          id="mri-upload-files"
          ref={inputRef}
          type="file"
          multiple
          onChange={(e) => e.target.files && processFiles(e.target.files)}
          className="sr-only"
        />
        <input
          id="mri-upload-directory"
          ref={directoryInputRef}
          type="file"
          multiple
          onChange={(e) => e.target.files && processFiles(e.target.files)}
          className="sr-only"
          {...DIRECTORY_INPUT_PROPS}
        />
      </div>

      {images.length > 0 && (
        <div className="flex items-center justify-between text-xs text-[#64748B] px-1">
          <span>
            {images.length} {t(lang, "images")} {t(lang, "uploaded")} (
            {formatSize(totalSize)})
          </span>
          <button
            onClick={() => {
              images.forEach((img) => {
                if (isBlobUrl(img.preview)) {
                  URL.revokeObjectURL(img.preview);
                }
              });
              onImagesChange([]);
            }}
            className="text-[#EF4444] hover:text-[#FCA5A5] transition-colors"
          >
            {t(lang, "uploadClear")}
          </button>
        </div>
      )}
    </div>
  );
}
