import { NextResponse } from "next/server";

export async function GET() {
  // Only return readiness status, never expose key details
  return NextResponse.json({
    ready: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
}
