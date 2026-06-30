import { NextResponse } from "next/server";

export async function GET() {
  // Only return readiness status, never expose key details
  return NextResponse.json({
    gemini: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    ready: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY || !!process.env.OPENAI_API_KEY,
  });
}
