import Anthropic from "@anthropic-ai/sdk";
import { spawn } from "node:child_process";
import type { ExplainResult } from "./types";

// ── SDK path (fast — no subprocess, no MCP overhead) ─────────────────────────
// Used when ANTHROPIC_API_KEY is set in the environment.
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const SDK_MODEL = process.env.CLAUDE_SDK_MODEL || "claude-sonnet-4-5-20251001";

// ── CLI fallback (when no API key) ────────────────────────────────────────────
const CLI_BIN = process.env.CLAUDE_CLI_BIN || "claude";
const CLI_MODEL = process.env.CLAUDE_CLI_MODEL || "sonnet";

// ── Prompts ───────────────────────────────────────────────────────────────────

// Non-streaming: structured JSON response
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

// Streaming: TITLE/SUMMARY first so the hover updates fast
const STREAM_SYSTEM_PROMPT = `You are Pikachu, a personal engineering memory tool.
Given code or a doc snippet, explain it. Output EXACTLY in this format — one field per line, nothing else:

TITLE: <concise specific title, max 60 chars>
SUMMARY: <1-2 sentence recap>
CONCEPTS: <concept1>, <concept2>, <concept3>
WHAT: <what it is — 2-3 clear sentences>
WHY: <why it exists / problem it solves — 2-3 sentences>
HOW: <how it works with concrete detail — 2-3 sentences>
RELATED: <concept1>, <concept2>`;

// ── Shared helpers ────────────────────────────────────────────────────────────

function buildUserPrompt(input: {
  content: string;
  question?: string;
  language?: string;
}): string {
  return [
    input.question ? `Question: ${input.question}` : null,
    input.language ? `Language/context: ${input.language}` : null,
    `Input:\n${input.content}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildStreamPrompt(input: {
  content: string;
  question?: string;
  language?: string;
}): string {
  return [
    STREAM_SYSTEM_PROMPT,
    "---",
    input.question ? `Question: ${input.question}` : null,
    input.language ? `Language/context: ${input.language}` : null,
    `Input:\n${input.content}`,
  ]
    .filter(Boolean)
    .join("\n\n");
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

/** Parse accumulated streaming text and yield newly completed labelled fields. */
function* flushFields(
  textBuffer: string,
  yielded: Set<string>
): Generator<Partial<ExplainResult>> {
  for (const line of textBuffer.split("\n")) {
    const m = line.match(
      /^(TITLE|SUMMARY|CONCEPTS|WHAT|WHY|HOW|RELATED):\s*(.+)$/
    );
    if (!m) continue;
    const [, field, raw] = m;
    if (yielded.has(field)) continue;
    const value = raw.trim();
    if (!value) continue;
    yielded.add(field);
    switch (field) {
      case "TITLE":   yield { title: value };   break;
      case "SUMMARY": yield { summary: value }; break;
      case "WHAT":    yield { what: value };    break;
      case "WHY":     yield { why: value };     break;
      case "HOW":     yield { how: value };     break;
      case "CONCEPTS":
        yield { concepts: value.split(",").map((s) => s.trim()).filter(Boolean) };
        break;
      case "RELATED":
        yield { relatedConcepts: value.split(",").map((s) => s.trim()).filter(Boolean) };
        break;
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Quick check that Claude is available (SDK or CLI). */
export async function isClaudeCliAvailable(): Promise<boolean> {
  if (anthropic) return true;
  return new Promise((resolve) => {
    const child = spawn(CLI_BIN, ["--version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

/**
 * Generate a structured ExplainResult.
 * Uses Anthropic SDK when ANTHROPIC_API_KEY is set (fast), otherwise falls
 * back to the Claude Code CLI.
 */
export async function explain(input: {
  content: string;
  question?: string;
  language?: string;
}): Promise<ExplainResult> {
  // ── SDK path ──────────────────────────────────────────────────────────────
  if (anthropic) {
    const msg = await anthropic.messages.create({
      model: SDK_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(input) }],
    });
    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
    return parseExplainJson(text);
  }

  // ── CLI fallback ──────────────────────────────────────────────────────────
  const prompt = [SYSTEM_PROMPT, "---", buildUserPrompt(input)].join("\n\n");
  return new Promise((resolve, reject) => {
    const child = spawn(
      CLI_BIN,
      ["-p", "--output-format", "json", "--model", CLI_MODEL],
      { stdio: ["pipe", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err: Error) =>
      reject(new Error(`Claude CLI error: ${err.message}`))
    );
    child.on("close", (code: number | null) => {
      if (code !== 0) {
        reject(new Error(`Claude CLI exited ${code}. ${stderr.trim() || stdout.trim()}`));
        return;
      }
      try {
        const envelope = JSON.parse(stdout) as { is_error?: boolean; result?: string; error?: string };
        if (envelope.is_error || typeof envelope.result !== "string") {
          reject(new Error(envelope.error || "Claude CLI returned an error."));
          return;
        }
        resolve(parseExplainJson(envelope.result));
      } catch {
        reject(new Error(`Could not parse Claude CLI output: ${stdout.slice(0, 300)}`));
      }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * Streaming version — yields Partial<ExplainResult> as each field line completes.
 * TITLE and SUMMARY arrive first (~1-2s), so the hover can update immediately.
 *
 * Uses Anthropic SDK streaming when ANTHROPIC_API_KEY is set, otherwise falls
 * back to Claude CLI with --output-format stream-json.
 */
export async function* explainStream(input: {
  content: string;
  question?: string;
  language?: string;
}): AsyncGenerator<Partial<ExplainResult>> {
  const yielded = new Set<string>();
  let textBuffer = "";

  // ── SDK streaming path ────────────────────────────────────────────────────
  if (anthropic) {
    const stream = anthropic.messages.stream({
      model: SDK_MODEL,
      max_tokens: 1024,
      system: STREAM_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(input) }],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        textBuffer += event.delta.text;
        yield* flushFields(textBuffer, yielded);
      }
    }
    yield* flushFields(textBuffer, yielded); // final flush
    return;
  }

  // ── CLI streaming fallback ────────────────────────────────────────────────
  const prompt = buildStreamPrompt(input);
  const child = spawn(
    CLI_BIN,
    ["-p", "--output-format", "stream-json", "--verbose", "--model", CLI_MODEL],
    { stdio: ["pipe", "pipe", "pipe"] }
  );

  child.on("error", () => { /* surfaced via close */ });
  child.stdin.write(prompt);
  child.stdin.end();

  let stdoutBuf = "";
  for await (const chunk of child.stdout as AsyncIterable<Buffer>) {
    stdoutBuf += chunk.toString();
    const lines = stdoutBuf.split("\n");
    stdoutBuf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as {
          type: string;
          is_error?: boolean;
          error?: string;
          message?: { content?: Array<{ type: string; text?: string }> };
        };
        if (event.is_error) throw new Error(event.error ?? "Claude CLI error");
        if (event.type === "assistant" && event.message?.content) {
          for (const part of event.message.content) {
            if (part.type === "text" && part.text) {
              textBuffer += part.text;
              yield* flushFields(textBuffer, yielded);
            }
          }
        }
      } catch { /* skip unparseable */ }
    }
  }
  yield* flushFields(textBuffer, yielded);
}
