"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Bot, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface StreamingResultProps {
  provider: string;
  model: string;
  text: string;
  isStreaming: boolean;
}

const PROVIDER_STYLES: Record<string, { color: string; bg: string }> = {
  Gemini: { color: "text-blue-400", bg: "bg-blue-950/30" },
  "Gemini Deep Dive": { color: "text-purple-400", bg: "bg-purple-950/30" },
};

export function StreamingResult({
  provider,
  model,
  text,
  isStreaming,
}: StreamingResultProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const style = PROVIDER_STYLES[provider] || {
    color: "text-gray-400",
    bg: "bg-gray-900",
  };

  useEffect(() => {
    if (scrollRef.current && isStreaming) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text, isStreaming]);

  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden">
      <div
        className={cn(
          "flex items-center justify-between px-4 py-2 border-b border-gray-700",
          style.bg
        )}
      >
        <div className="flex items-center gap-2">
          <Bot className={cn("w-4 h-4", style.color)} />
          <span className={cn("font-semibold text-sm", style.color)}>
            {provider}
          </span>
          <span className="text-xs text-gray-500 font-mono">{model}</span>
        </div>
        {isStreaming && (
          <div className="flex items-center gap-1.5 text-xs text-teal-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{text.length} chars</span>
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        className="p-4 bg-gray-950 max-h-[500px] overflow-y-auto"
      >
        {text ? (
          <article className="analysis-content prose prose-invert prose-sm max-w-none font-mono text-sm leading-relaxed">
            <ReactMarkdown
              components={{
                h2: ({ children, ...props }) => (
                  <h2
                    className="text-teal-400 text-base font-bold mt-6 mb-3 border-b border-gray-800 pb-2"
                    {...props}
                  >
                    {children}
                  </h2>
                ),
                h3: ({ children, ...props }) => (
                  <h3
                    className="text-gray-200 text-sm font-semibold mt-4 mb-2"
                    {...props}
                  >
                    {children}
                  </h3>
                ),
                strong: ({ children, ...props }) => (
                  <strong className="text-gray-100 font-bold" {...props}>
                    {children}
                  </strong>
                ),
                li: ({ children, ...props }) => (
                  <li className="text-gray-300 my-1" {...props}>
                    {children}
                  </li>
                ),
                p: ({ children, ...props }) => {
                  const txt = String(children);
                  let extraClass = "";
                  if (txt.includes("✅"))
                    extraClass =
                      "text-green-400 bg-green-950/30 px-2 py-1 rounded";
                  else if (txt.includes("⚠️"))
                    extraClass =
                      "text-yellow-400 bg-yellow-950/30 px-2 py-1 rounded";
                  else if (txt.includes("🔴"))
                    extraClass =
                      "text-red-400 bg-red-950/30 px-2 py-1 rounded";

                  return (
                    <p
                      className={cn("text-gray-300 my-2", extraClass)}
                      {...props}
                    >
                      {children}
                    </p>
                  );
                },
                ul: ({ children, ...props }) => (
                  <ul
                    className="list-disc list-inside space-y-1 my-2"
                    {...props}
                  >
                    {children}
                  </ul>
                ),
              }}
            >
              {text}
            </ReactMarkdown>
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-teal-400 animate-pulse ml-0.5 align-middle" />
            )}
          </article>
        ) : (
          <div className="flex items-center gap-2 text-gray-600 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Waiting for response...</span>
          </div>
        )}
      </div>
    </div>
  );
}
