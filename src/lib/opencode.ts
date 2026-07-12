import { spawn } from "node:child_process";
import type { ExplainResult } from "./types";

// Pikachu talks to opencode through the **opencode CLI** in headless mode
// (`opencode run --format json --auto`) rather than the Anthropic API. This
// reuses whatever AI providers opencode has configured locally (Anthropic,
// OpenAI, free opencode models, etc.), so no separate API key is needed.
//
// Overridable via env:
//   OPENCODE_CLI_BIN    path to the `opencode` binary  (default: "opencode")
//   OPENCODE_CLI_MODEL  model in "provider/model" format (default: "opencode/deepseek-v4-flash-free")
//                       Examples: "anthropic/claude-sonnet-4-5"
//                                 "openai/gpt-4o"
//                                 "opencode/deepseek-v4-flash-free"
const CLI_BIN = process.env.OPENCODE_CLI_BIN || "opencode";
const CLI_MODEL =
  process.env.OPENCODE_CLI_MODEL || "opencode/deepseek-v4-flash-free";

const SYSTEM_PROMPT = `You are Pikachu, a tool that helps software engineers
retain and reconstruct what they learn. Given some input (code, a question, or a
documentation snippet), produce a structured learning entry.

Explain clearly and precisely, as if writing a note the engineer will re-read in
three months and need to fully reconstruct their understanding from.

Respond with ONLY a JSON object (no markdown fences, no prose, no preamble) of this
exact shape:
{
  "title": "concise, specific title",
  "what": "what is it?",
  "why": "why does it exist / what problem does it solve?",
  "how": "how does it work? include concrete detail",
  "summary": "1-2 sentence recap",
  "concepts": ["core concept", "..."],
  "relatedConcepts": ["adjacent concept worth exploring next", "..."]
}`;

// Shape of each NDJSON line emitted by `opencode run --format json`
interface OpenCodeEvent {
  type: string;
  sessionID?: string;
  timestamp?: number;
  part?: {
    type: string;
    text?: string;
    time?: { end?: number };
  };
  error?: {
    name?: string;
    data?: { message?: string };
  };
}

/** Run the opencode CLI headlessly, returning the model's text result. */
function runOpenCode(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "run",
      "--format",
      "json",
      // Auto-approve tool permissions so we never block on an interactive prompt.
      "--auto",
    ];

    if (CLI_MODEL) args.push("-m", CLI_MODEL);

    const child = spawn(CLI_BIN, args, {
      // stdin → pipe so we can write the prompt,
      // stdout → pipe to collect NDJSON events,
      // stderr → pipe to suppress noisy build/log lines.
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      reject(
        new Error(
          `Could not run the opencode CLI ("${CLI_BIN}"). Is opencode installed ` +
            `and on PATH? Original error: ${err.message}`
        )
      );
    });

    child.on("close", (code) => {
      // Parse the NDJSON event stream that `--format json` emits.
      // Each line is one JSON object with a "type" discriminant.
      const lines = stdout.trim().split("\n");
      let text = "";
      let errorMsg: string | undefined;

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as OpenCodeEvent;

          if (event.type === "error") {
            errorMsg =
              event.error?.data?.message ??
              event.error?.name ??
              "opencode returned an error";
            break;
          }

          // `type: "text"` fires when a completed text part is available.
          // Only accumulate when the part has actually finished (time.end set).
          if (
            event.type === "text" &&
            event.part?.type === "text" &&
            typeof event.part.text === "string"
          ) {
            text += event.part.text;
          }
        } catch {
          // Skip non-JSON lines (server startup banners, etc.)
        }
      }

      if (errorMsg) {
        reject(new Error(errorMsg));
        return;
      }

      if (!text && code !== 0) {
        reject(
          new Error(
            `opencode CLI exited with code ${code}.\n` +
              (stderr.trim() || stdout.slice(0, 500))
          )
        );
        return;
      }

      if (!text) {
        reject(
          new Error(
            `No text response from opencode. Raw output: ${stdout.slice(0, 500)}`
          )
        );
        return;
      }

      resolve(text);
    });

    // opencode run reads from stdin when it is not a TTY, combining it with
    // any positional message args. Writing our full prompt here is equivalent
    // to passing it as the message argument but avoids shell-escaping issues
    // with long, multi-line content.
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/** Quick check that the opencode CLI is installed and reachable. */
export function isOpenCodeCliAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(CLI_BIN, ["--version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

/**
 * Generate a structured ExplainResult from raw engineer input via opencode.
 */
export async function explain(input: {
  content: string;
  question?: string;
  language?: string;
}): Promise<ExplainResult> {
  const prompt = [
    SYSTEM_PROMPT,
    "---",
    input.question ? `Question: ${input.question}` : null,
    input.language ? `Language/context: ${input.language}` : null,
    `Input:\n${input.content}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const text = await runOpenCode(prompt);
  return parseExplainJson(text);
}

/** Tolerantly parse the model's JSON, stripping accidental code fences. */
function parseExplainJson(text: string): ExplainResult {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);

  const parsed = JSON.parse(cleaned);
  return {
    title: String(parsed.title ?? "Untitled"),
    what: String(parsed.what ?? ""),
    why: String(parsed.why ?? ""),
    how: String(parsed.how ?? ""),
    summary: String(parsed.summary ?? ""),
    concepts: Array.isArray(parsed.concepts) ? parsed.concepts.map(String) : [],
    relatedConcepts: Array.isArray(parsed.relatedConcepts)
      ? parsed.relatedConcepts.map(String)
      : [],
  };
}
