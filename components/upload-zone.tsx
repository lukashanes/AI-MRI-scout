"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { t, type Lang } from "@/lib/i18n";

interface UploadedImage {
  id: string;
  file: File;
  preview: string;
  base64: string;
  mediaType: string;
}

interface UploadZoneProps {
  images: UploadedImage[];
  onImagesChange: (images: UploadedImage[]) => void;
  disabled?: boolean;
  lang?: Lang;
}

const MAX_SIZE = 20 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      setProcessing(true);
      const newImages: UploadedImage[] = [];

      for (const file of Array.from(files)) {
        if (!ACCEPTED_TYPES.includes(file.type)) continue;
        if (file.size > MAX_SIZE) continue;

        const base64 = await fileToBase64(file);
        newImages.push({
          id: crypto.randomUUID(),
          file,
          preview: URL.createObjectURL(file),
          base64,
          mediaType: file.type,
        });
      }

      onImagesChange([...images, ...newImages]);
      setProcessing(false);
    },
    [images, onImagesChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (disabled) return;
      processFiles(e.dataTransfer.files);
    },
    [disabled, processFiles]
  );

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
        onClick={() => !disabled && !processing && inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer",
          dragActive
            ? "border-[#00D4AA] bg-[#042F2E]"
            : "border-[#334155] hover:border-[#64748B]",
          (disabled || processing) && "opacity-50 cursor-not-allowed"
        )}
        style={{ backgroundColor: dragActive ? undefined : "#111827" }}
      >
        {processing ? (
          <div className="text-[#94A3B8] text-sm">{t(lang, "processing")}</div>
        ) : (
          <>
            <Upload className="w-8 h-8 text-[#64748B] mx-auto mb-2" />
            <p className="text-[#94A3B8] text-sm">
              {t(lang, "uploadDrop")}{" "}
              <span className="text-[#00D4AA] underline">{t(lang, "uploadBrowse")}</span>
            </p>
            <p className="text-xs text-[#64748B] mt-1">
              {t(lang, "uploadHint")}
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp"
          multiple
          onChange={(e) => e.target.files && processFiles(e.target.files)}
          className="hidden"
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
              images.forEach((img) => URL.revokeObjectURL(img.preview));
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
