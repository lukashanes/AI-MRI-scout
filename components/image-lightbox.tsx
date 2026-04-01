"use client";

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ImageViewer } from "./image-viewer";

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
  markerX?: number;
  markerY?: number;
  markerStatus?: "normal" | "note" | "abnormal";
  caption?: string;
}

export function ImageLightbox({ src, alt, onClose, markerX, markerY, markerStatus, caption }: ImageLightboxProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors z-10"
      >
        <X className="w-6 h-6" />
      </button>
      <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <ImageViewer
          src={src}
          alt={alt}
          height="h-[80vh]"
          markerX={markerX}
          markerY={markerY}
          markerStatus={markerStatus}
        />
        {caption && (
          <p className="text-xs text-gray-500 text-center mt-2 font-mono">{caption}</p>
        )}
      </div>
    </div>,
    document.body
  );
}
