"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageViewerProps {
  src: string;
  alt?: string;
  className?: string;
  height?: string;
  markerX?: number;
  markerY?: number;
  markerStatus?: "normal" | "note" | "abnormal";
}

export function ImageViewer({ src, alt = "MRI scan", className, height = "h-[400px]", markerX, markerY, markerStatus }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [showMarker, setShowMarker] = useState(true);
  const lastPos = useRef({ x: 0, y: 0 });

  // Reset zoom/pan when src changes
  useEffect(() => { setScale(1); setPosition({ x: 0, y: 0 }); setShowMarker(true); }, [src]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.max(0.5, Math.min(5, s - e.deltaY * 0.001)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return;
    setDragging(true);
    lastPos.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  }, [scale, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setPosition({ x: e.clientX - lastPos.current.x, y: e.clientY - lastPos.current.y });
  }, [dragging]);

  const reset = useCallback(() => { setScale(1); setPosition({ x: 0, y: 0 }); }, []);

  const hasMarker = showMarker && markerX != null && markerY != null && markerStatus && markerStatus !== "normal";
  const markerColor = markerStatus === "abnormal" ? "border-red-400 bg-red-400/20" : "border-yellow-400 bg-yellow-400/20";

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <button onClick={() => setScale((s) => Math.min(5, s + 0.5))} className="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors" title="Zoom in">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button onClick={() => setScale((s) => Math.max(0.5, s - 0.5))} className="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors" title="Zoom out">
          <ZoomOut className="w-4 h-4" />
        </button>
        <button onClick={reset} className="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors" title="Reset">
          <RotateCcw className="w-4 h-4" />
        </button>
        <span className="text-xs text-gray-500 ml-1">{Math.round(scale * 100)}%</span>

        {/* Marker toggle */}
        {markerX != null && markerY != null && markerStatus && markerStatus !== "normal" && (
          <button
            onClick={() => setShowMarker(!showMarker)}
            className={cn(
              "ml-auto p-1.5 rounded transition-colors",
              showMarker
                ? "bg-teal-800 text-teal-300 hover:bg-teal-700"
                : "bg-gray-800 text-gray-500 hover:bg-gray-700"
            )}
            title={showMarker ? "Hide marker" : "Show marker"}
          >
            <Crosshair className="w-4 h-4" />
          </button>
        )}
      </div>
      <div
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
        className={cn("relative overflow-hidden rounded-lg bg-black border border-gray-700 cursor-grab active:cursor-grabbing", height)}
      >
        {/* Image + annotation wrapper — moves together with zoom/pan */}
        <div
          className="absolute top-1/2 left-1/2"
          style={{
            transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: dragging ? "none" : "transform 0.15s ease-out",
          }}
        >
          <img src={src} alt={alt} className="max-w-none select-none" draggable={false} />
          {/* Marker at precise x/y percentage */}
          {hasMarker && (
            <div
              className={cn("absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none", markerColor)}
              style={{ left: `${markerX}%`, top: `${markerY}%` }}
            >
              {/* Outer pulsing ring */}
              <div className={cn("w-10 h-10 rounded-full border-2 animate-pulse -translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2", markerColor)} />
              {/* Crosshair lines */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="w-px h-6 bg-white/60 absolute left-1/2 -translate-x-1/2 -top-3" />
                <div className="w-px h-6 bg-white/60 absolute left-1/2 -translate-x-1/2 top-3" />
                <div className="h-px w-6 bg-white/60 absolute top-1/2 -translate-y-1/2 -left-3" />
                <div className="h-px w-6 bg-white/60 absolute top-1/2 -translate-y-1/2 left-3" />
                <div className="w-2 h-2 rounded-full bg-white/80 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
