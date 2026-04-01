import { NextRequest } from "next/server";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const ENV_PATH = join(process.cwd(), ".env.local");

function readEnvFile(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const content = readFileSync(ENV_PATH, "utf-8");
  const env: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
  }
  return env;
}

function writeEnvFile(env: Record<string, string>) {
  const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  writeFileSync(ENV_PATH, lines.join("\n") + "\n", "utf-8");
}

// GET: check if key is set (boolean only, never return the key)
export async function GET() {
  const hasKey = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  return Response.json({ ready: hasKey });
}

// POST: save API key to .env.local and update process.env
export async function POST(request: NextRequest) {
  try {
    const { apiKey } = (await request.json()) as { apiKey?: string };

    if (!apiKey || typeof apiKey !== "string") {
      return Response.json({ error: "No API key provided." }, { status: 400 });
    }

    // Basic validation — Google AI keys start with "AIza"
    const trimmed = apiKey.trim();
    if (trimmed.length < 10 || trimmed.length > 200) {
      return Response.json({ error: "Invalid API key format." }, { status: 400 });
    }

    // Read existing env, update key, write back
    const env = readEnvFile();
    env["GOOGLE_GENERATIVE_AI_API_KEY"] = trimmed;
    writeEnvFile(env);

    // Update process.env so it takes effect immediately (no restart needed)
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = trimmed;

    return Response.json({ success: true, ready: true });
  } catch (error) {
    console.error("Config error:", error);
    return Response.json({ error: "Failed to save API key." }, { status: 500 });
  }
}
