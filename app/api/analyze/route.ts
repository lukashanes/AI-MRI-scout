import { NextRequest } from "next/server";
import { getProvider } from "@/lib/providers";
import { Base64Image } from "@/lib/providers/types";

export const maxDuration = 300;

const MAX_IMAGES = 50;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { images, lang, customPrompt } = body as {
      images: Base64Image[];
      provider: string;
      lang?: string;
      customPrompt?: string;
    };

    if (!images || images.length === 0) {
      return Response.json(
        { error: "No images were uploaded." },
        { status: 400 }
      );
    }

    if (images.length > MAX_IMAGES) {
      return Response.json(
        {
          error: `Too many images (${images.length}). Maximum is ${MAX_IMAGES} per request.`,
        },
        { status: 400 }
      );
    }

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return Response.json(
        { error: "Gemini API key is not configured." },
        { status: 400 }
      );
    }

    const provider = getProvider("gemini");
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        function send(event: string, data: unknown) {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
            )
          );
        }

        try {
          send("status", {
            stage: "processing",
            imageCount: images.length,
            provider: provider.name,
            model: provider.model,
          });

          const result = await provider.analyzeStream(
            images,
            (chunk) => send("chunk", { text: chunk }),
            lang || "en",
            customPrompt
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
          const message =
            err instanceof Error
              ? err.message
              : "Unknown error during analysis.";
          send("error", { error: message });
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
    console.error("Analysis error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error during analysis.";
    return Response.json({ error: message }, { status: 500 });
  }
}
