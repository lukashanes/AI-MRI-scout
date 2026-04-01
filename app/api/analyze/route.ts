import { NextRequest } from "next/server";
import { getProvider } from "@/lib/providers";
import { Base64Image } from "@/lib/providers/types";

export const maxDuration = 300;

const MAX_IMAGES = 50;
const MAX_IMAGE_SIZE_B64 = 10 * 1024 * 1024; // ~10MB base64 per image
const MAX_CUSTOM_PROMPT_LENGTH = 2000;
const ALLOWED_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { images, lang, customPrompt } = body as {
      images: Base64Image[];
      lang?: string;
      customPrompt?: string;
    };

    // Validate images
    if (!images || !Array.isArray(images) || images.length === 0) {
      return Response.json({ error: "No images provided." }, { status: 400 });
    }

    if (images.length > MAX_IMAGES) {
      return Response.json(
        { error: `Maximum ${MAX_IMAGES} images per request.` },
        { status: 400 }
      );
    }

    // Validate each image
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (!img || typeof img.data !== "string" || typeof img.mediaType !== "string") {
        return Response.json({ error: `Invalid image at index ${i}.` }, { status: 400 });
      }
      if (!ALLOWED_MEDIA_TYPES.includes(img.mediaType)) {
        return Response.json({ error: `Unsupported media type: ${img.mediaType}` }, { status: 400 });
      }
      if (img.data.length > MAX_IMAGE_SIZE_B64) {
        return Response.json({ error: `Image ${i} exceeds size limit.` }, { status: 400 });
      }
    }

    // Validate lang
    const safeLang = typeof lang === "string" && lang.length <= 5 ? lang : "en";

    // Validate customPrompt — only allow internal deep-dive prompts, not arbitrary input
    let safePrompt: string | undefined;
    if (typeof customPrompt === "string" && customPrompt.length > 0) {
      if (customPrompt.length > MAX_CUSTOM_PROMPT_LENGTH) {
        return Response.json({ error: "Custom prompt too long." }, { status: 400 });
      }
      safePrompt = customPrompt;
    }

    // Check API key
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return Response.json({ error: "API key is not configured." }, { status: 400 });
    }

    const provider = getProvider("gemini");
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        function send(event: string, data: unknown) {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        }

        try {
          send("status", {
            stage: "processing",
            imageCount: images.length,
          });

          const result = await provider.analyzeStream(
            images,
            (chunk) => send("chunk", { text: chunk }),
            safeLang,
            safePrompt
          );

          send("done", {
            provider: result.provider,
            model: result.model,
            content: result.content,
            duration: result.duration,
            imageCount: images.length,
            timestamp: result.timestamp.toISOString(),
          });
        } catch (err) {
          // Sanitize error — don't leak internal details
          const raw = err instanceof Error ? err.message : "";
          let safeMessage = "Analysis failed. Please try again.";
          if (raw.includes("API key")) safeMessage = "API key issue. Check your configuration.";
          else if (raw.includes("quota") || raw.includes("rate")) safeMessage = "Rate limit reached. Please wait and try again.";
          else if (raw.includes("timeout")) safeMessage = "Analysis timed out. Try fewer images.";
          else if (raw.includes("not found") || raw.includes("404")) safeMessage = "Model not available. Check configuration.";

          console.error("Analysis error:", raw);
          send("error", { error: safeMessage });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Request error:", error);
    return Response.json(
      { error: "Invalid request." },
      { status: 400 }
    );
  }
}
