"use client";

import { cn } from "@/lib/utils";
import { CheckCircle2, Info, AlertTriangle } from "lucide-react";

export interface ToastItem {
  id: string;
  message: string;
  type: "info" | "success" | "warning";
}

interface ToastContainerProps {
  toasts: ToastItem[];
}

const TOAST_STYLES = {
  info: { bg: "bg-gray-800/90 border-gray-600", color: "text-gray-200", Icon: Info },
  success: { bg: "bg-green-900/90 border-green-700", color: "text-green-200", Icon: CheckCircle2 },
  warning: { bg: "bg-yellow-900/90 border-yellow-700", color: "text-yellow-200", Icon: AlertTriangle },
};

export function ToastContainer({ toasts }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 no-print">
      {toasts.map((toast) => {
        const style = TOAST_STYLES[toast.type];
        const Icon = style.Icon;
        return (
          <div
            key={toast.id}
            className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg text-sm animate-slide-in",
              style.bg, style.color
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {toast.message}
          </div>
        );
      })}
    </div>
  );
}
