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

function getStatus() {
  const gemini = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  return {
    ready: gemini,
    providers: {
      gemini,
    },
  };
}

export async function GET() {
  return Response.json(getStatus());
}

export async function POST(request: NextRequest) {
  try {
    const { googleApiKey } = (await request.json()) as {
      googleApiKey?: string;
    };

    if (googleApiKey == null || googleApiKey.trim() === "") {
      return Response.json({ error: "No API key provided." }, { status: 400 });
    }

    const env = readEnvFile();

    if (googleApiKey != null && googleApiKey.trim() !== "") {
      const trimmedGoogle = googleApiKey.trim();
      if (trimmedGoogle.length < 10 || trimmedGoogle.length > 200) {
        return Response.json({ error: "Invalid Google API key format." }, { status: 400 });
      }
      env.GOOGLE_GENERATIVE_AI_API_KEY = trimmedGoogle;
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = trimmedGoogle;
    }
    delete env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    writeEnvFile(env);

    return Response.json({ success: true, ...getStatus() });
  } catch (error) {
    console.error("Config error:", error);
    return Response.json({ error: "Failed to save API key." }, { status: 500 });
  }
}
