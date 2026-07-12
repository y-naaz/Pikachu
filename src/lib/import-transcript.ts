import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { prisma } from "./prisma";

const CLI_BIN = process.env.CLAUDE_CLI_BIN || "claude";
const CLI_MODEL = process.env.CLAUDE_CLI_MODEL || "sonnet";
const CAPTURE_MARKER = "PIKACHU_CAPTURE_ENGINE_v1";

function clip(v: unknown, n: number): string {
  const s = v == null ? "" : String(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/** Flatten a Claude Code .jsonl transcript into readable text. */
export function transcriptToText(raw: string): string {
  const lines = raw.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(t);
    } catch {
      continue;
    }
    if (o.type !== "user" && o.type !== "assistant") continue;
    const msg = o.message as Record<string, unknown> | undefined;
    const role = (msg?.role as string) || (o.type as string);
    const c = msg?.content;
    let text = "";
    if (typeof c === "string") text = c;
    else if (Array.isArray(c)) {
      const parts: string[] = [];
      for (const b of c) {
        if (!b || typeof b !== "object") continue;
        const block = b as Record<string, unknown>;
        if (block.type === "text") {
          parts.push(block.text as string);
        } else if (block.type === "tool_use") {
          const n = block.name as string;
          const inp = (block.input || {}) as Record<string, unknown>;
          if (n === "Edit" || n === "MultiEdit") {
            parts.push(
              `[Edit ${inp.file_path || ""}]\n- ${clip(inp.old_string, 800)}\n+ ${clip(inp.new_string, 800)}`
            );
          } else if (n === "Write") {
            parts.push(`[Write ${inp.file_path || ""}]\n${clip(inp.content, 1200)}`);
          } else if (n === "Bash") {
            parts.push(`[Bash] ${clip(inp.command, 600)}`);
          } else {
            parts.push(`[${n}] ${clip(JSON.stringify(inp), 300)}`);
          }
        } else if (block.type === "tool_result") {
          let rc = block.content;
          if (Array.isArray(rc))
            rc = rc.map((x: Record<string, unknown>) => (x && x.type === "text" ? x.text : "")).join(" ");
          parts.push(`[result] ${clip(rc, 700)}`);
        }
      }
      text = parts.join("\n");
    }
    text = text.trim();
    if (text) out.push(`${role.toUpperCase()}: ${text}`);
  }
  return out.join("\n\n");
}

const IMPORT_PROMPT = `You are Pikachu's import engine. Read a transcript of a coding session
and extract reusable technical learnings the engineer would re-read in three months
to reconstruct their understanding fast.

Capture ONLY durable, TRANSFERABLE technical knowledge:
- how a language / framework / library feature works
- how an API, protocol, tool, or config behaves
- a reusable pattern or technique, described GENERALLY
- a real gotcha / footgun / environment trap that will recur

DO NOT capture:
- one-off, project-specific facts
- pure debugging-process narration
- planning chatter, file listings, and routine edits

For EACH insight, produce:
- "title": specific technical title naming the concrete tech/API
- "language": primary language/tech, or null
- "code": the single most important code from the session — a before/after diff or key snippet
- "note": clear, beginner-friendly explanation, 4-7 sentences
- "summary": ONE short sentence (max ~15 words) for list views
- "concepts": specific API/concept names
- "relatedConcepts": adjacent things to explore next

Respond with ONLY a JSON object (no markdown fences) of this shape:
{
  "learnings": [
    {
      "title": "...",
      "language": "...",
      "code": "...",
      "note": "...",
      "summary": "...",
      "concepts": ["..."],
      "relatedConcepts": ["..."]
    }
  ]
}

If nothing reusable was learned, return {"learnings": []}.`;

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(CLI_BIN, ["-p", "--output-format", "json", "--model", CLI_MODEL], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PIKACHU_CAPTURE: "1" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d));
    child.stderr.on("data", (d: Buffer) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${stderr || stdout}`));
      try {
        const env = JSON.parse(stdout) as { is_error?: boolean; result?: string; error?: string };
        if (env.is_error || typeof env.result !== "string")
          return reject(new Error(env.error || "claude returned an error"));
        resolve(env.result);
      } catch {
        reject(new Error(`could not parse claude output: ${stdout.slice(0, 300)}`));
      }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function parseLearnings(text: string) {
  let s = text.trim();
  if (s.startsWith("```")) s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a !== -1 && b !== -1) s = s.slice(a, b + 1);
  const parsed = JSON.parse(s);
  return Array.isArray(parsed.learnings) ? parsed.learnings : [];
}

export interface ImportResult {
  sessionId: string;
  learningsCount: number;
  learnings: Array<{
    id: string;
    title: string;
  }>;
}

/** Import a single transcript file and save learnings to DB. */
export async function importTranscript(transcriptPath: string, sessionId?: string): Promise<ImportResult> {
  const sid = sessionId || path.basename(transcriptPath, ".jsonl");

  const existing = await prisma.learning.count({ where: { sourceReference: sid } });
  if (existing > 0) {
    return { sessionId: sid, learningsCount: 0, learnings: [] };
  }

  const raw = readFileSync(transcriptPath, "utf8");
  if (raw.includes(CAPTURE_MARKER)) {
    return { sessionId: sid, learningsCount: 0, learnings: [] };
  }

  const text = transcriptToText(raw);
  if (text.length < 400) {
    return { sessionId: sid, learningsCount: 0, learnings: [] };
  }

  const MAX = 40000;
  const clipped = text.length > MAX ? text.slice(text.length - MAX) : text;
  const prompt = `${IMPORT_PROMPT}\n\n---\nTRANSCRIPT:\n${clipped}`;

  const result = await runClaude(prompt);
  const learnings = parseLearnings(result);

  const saved: Array<{ id: string; title: string }> = [];
  for (const l of learnings) {
    if (!l || !l.title) continue;
    const note = String(l.note || l.summary || "").trim();
    const summary = String(l.summary || l.note || "").trim();
    const code = l.code ? String(l.code) : null;
    const row = await prisma.learning.create({
      data: {
        title: String(l.title),
        question: "",
        explanation: note,
        summary,
        codeSnippet: code,
        sourceType: "claude",
        sourceReference: sid,
        language: l.language ? String(l.language) : null,
        repository: null,
        concepts: JSON.stringify(Array.isArray(l.concepts) ? l.concepts.map(String) : []),
        relatedConcepts: JSON.stringify(
          Array.isArray(l.relatedConcepts) ? l.relatedConcepts.map(String) : []
        ),
        tags: JSON.stringify([]),
      },
    });
    saved.push({ id: row.id, title: row.title });
  }

  return { sessionId: sid, learningsCount: saved.length, learnings: saved };
}

/** List available Claude Code transcripts from ~/.claude/projects. */
export function listAvailableTranscripts(): Array<{
  path: string;
  sessionId: string;
  project: string;
}> {
  const root = path.join(homedir(), ".claude", "projects");
  const results: Array<{ path: string; sessionId: string; project: string }> = [];

  try {
    const files = readdirSync(root, { recursive: true }).map(String);
    const filtered = files.filter(
      (r: string) => r.endsWith(".jsonl") && !r.includes(`${path.sep}subagents${path.sep}`)
    );

    for (const file of filtered) {
      const full = path.join(root, file);
      const parts = file.split(path.sep);
      const project = parts[0]?.replace(/^-/, "").split("-").pop() || "unknown";
      const sessionId = path.basename(full, ".jsonl");
      results.push({ path: full, sessionId, project });
    }
  } catch {
    // ~/.claude/projects may not exist
  }

  return results;
}

/** Bulk import all available transcripts. */
export async function importAllTranscripts(
  onProgress?: (current: number, total: number, sessionId: string) => void
): Promise<{ total: number; saved: number }> {
  const transcripts = listAvailableTranscripts();
  let totalSaved = 0;

  for (let i = 0; i < transcripts.length; i++) {
    const t = transcripts[i];
    onProgress?.(i + 1, transcripts.length, t.sessionId);
    try {
      const result = await importTranscript(t.path, t.sessionId);
      totalSaved += result.learningsCount;
    } catch {
      // Skip failed transcripts
    }
  }

  return { total: transcripts.length, saved: totalSaved };
}
