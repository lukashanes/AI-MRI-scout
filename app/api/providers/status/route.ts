import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    gemini: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
}
