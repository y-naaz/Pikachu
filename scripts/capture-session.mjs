#!/usr/bin/env node
// Pikachu — automatic learning capture from Claude Code sessions.
//
// Wired as a Claude Code `SessionEnd` hook. On each session end Claude Code
// pipes a JSON payload (with `transcript_path`, `session_id`, `cwd`) to this
// script on stdin. We:
//   1. read the session transcript (.jsonl),
//   2. ask the local `claude` CLI to judge whether anything reusable was
//      learned and, if so, emit structured learning entries,
//   3. save those entries to Pikachu's SQLite DB via Prisma.
//
// To avoid delaying the user's session from closing, the foreground process
// only drains stdin and then re-spawns itself DETACHED to do the slow work
// (the Claude call + DB writes). Logs go to /tmp/pikachu-capture.log.
//
// Manual use / testing:
//   echo '{"transcript_path":"/path/to/session.jsonl","session_id":"test"}' \
//     | node scripts/capture-session.mjs
//   # or point straight at a transcript:
//   node scripts/capture-session.mjs --transcript /path/to/session.jsonl

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), "..");
const LOG = "/tmp/pikachu-capture.log";
const CLI_BIN = process.env.CLAUDE_CLI_BIN || "claude";
const CLI_MODEL = process.env.CLAUDE_CLI_MODEL || "sonnet";

// Anti-recursion: the judge itself runs `claude -p`, which is ALSO a Claude Code
// session — so its own SessionEnd would re-trigger this hook forever. We defend
// two ways: (1) every capture-spawned `claude` runs with PIKACHU_CAPTURE=1, and a
// hook that sees it bails immediately; (2) the judge prompt embeds CAPTURE_MARKER,
// so any transcript containing it is recognised as our own and skipped.
const CAPTURE_MARKER = "PIKACHU_CAPTURE_ENGINE_v1";

// Point Prisma at this project's DB regardless of where the hook fires from.
process.env.DATABASE_URL =
  process.env.PIKACHU_DATABASE_URL ||
  `file:${path.join(PROJECT_ROOT, "prisma", "dev.db")}`;

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(" ")}\n`;
  try {
    appendFileSync(LOG, line);
  } catch {
    /* best effort */
  }
}

// ---------------------------------------------------------------------------
// Stage 1 (foreground): drain stdin / args, then detach a worker and exit fast.
// ---------------------------------------------------------------------------
async function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    if (process.stdin.isTTY) return resolve("");
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => (data += d));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}

function argOf(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function dispatch() {
  // Guard 1: if this hook fired for a session that capture itself spawned, stop.
  if (process.env.PIKACHU_CAPTURE === "1") {
    log("hook fired inside a capture-spawned session; skip (anti-recursion)");
    return;
  }

  // Resolve the payload from either the hook (stdin JSON) or CLI flags.
  let payload = {};
  const transcriptFlag = argOf("--transcript");
  if (transcriptFlag) {
    payload = { transcript_path: transcriptFlag, session_id: argOf("--session") };
  } else {
    const raw = (await readStdin()).trim();
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        log("could not parse stdin payload; ignoring");
      }
    }
  }

  if (!payload.transcript_path) {
    log("no transcript_path in payload; nothing to do");
    return;
  }

  // Hand off to a detached worker so SessionEnd doesn't block on the Claude call.
  const tmp = path.join(mkdtempSync(path.join(tmpdir(), "pikachu-")), "payload.json");
  writeFileSync(tmp, JSON.stringify(payload));
  const child = spawn(process.execPath, [__filename, "--worker", tmp], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PIKACHU_WORKER: "1" },
  });
  child.unref();
  log(`dispatched worker for session ${payload.session_id || "?"} (${tmp})`);
}

// ---------------------------------------------------------------------------
// Stage 2 (detached worker): the slow path — read transcript, judge, save.
// ---------------------------------------------------------------------------
const JUDGE_PROMPT = `[${CAPTURE_MARKER}] You are Pikachu's capture engine. You read a transcript of a
Claude Code coding session — it contains the engineer's messages, Claude's
replies, and the actual code edits, shell commands, and errors. Read BOTH sides
to understand what was actually figured out, then extract CODE-FIRST technical
learnings the engineer would re-read in three months to rebuild the knowledge fast.

Capture ONLY durable, TRANSFERABLE technical knowledge — things the engineer will
reuse on future projects and would keep in a personal knowledge base:
- how a language / framework / library feature works (e.g. Rust's ? operator,
  Svelte $state, Axum extractors, sqlx attributes)
- how an API, protocol, tool, or config behaves (e.g. CORS rules, git commands,
  Postgres settings, iframe/postMessage semantics)
- a reusable pattern or technique, described GENERALLY (not tied to this one codebase)
- a real gotcha / footgun / environment trap that will recur on other projects

DO NOT capture these (skip them entirely):
- anything about the AI assistant's own tools or workflow — Read/Write/Edit/Bash/
  AskUserQuestion, its sandbox, "diff against the git index", "run the script via its
  runtime", etc. These are not the engineer's learning.
- one-off, project-specific facts: a particular function/variable name, a specific bug
  in one component, a ticket id (e.g. BZ-01), this repo's private architecture, or a
  single API's quirky field formatting
- pure debugging-process narration ("I found it by adding console.logs" / "I grepped
  across repos to trace it") — UNLESS the takeaway is a transferable technical fact
- planning chatter, file listings, and routine edits

When a useful pattern appears in project code, extract the GENERAL reusable pattern
(e.g. "module-level registry to share a callback between Svelte components"), NOT the
project-specific instance (e.g. NOT "kavach's core.ts getShopUrl chain").

For EACH insight, produce:
- "code": the single most important code from the session — a before/after diff
  (use - and + line prefixes) or the key snippet/command. Use the REAL identifiers,
  file names, errors, and values from the transcript. This is the centerpiece;
  never leave it empty for a code insight.
- "note": a clear, BEGINNER-FRIENDLY explanation that actually teaches the idea from
  scratch — about 4-7 sentences, in 1-2 short paragraphs. Walk through: (1) what this
  thing is in plain words, (2) why it matters / what problem it solves, (3) how it
  works, step by step, referring to the code. Assume the reader has never seen this
  API/feature/concept before, so briefly define any term you use. Use the real names
  (API, error, file, function) from the session as concrete examples.
- "summary": ONE short sentence (max ~15 words) recapping the takeaway — this is the
  one-liner shown in list views.

Write EVERYTHING in clear, simple language: short sentences, everyday words, easy to
follow, like a patient teacher explaining to a newcomer. Stay accurate and specific
(use the real errors, identifiers, and code) but never assume prior expertise. Skip
routine edits, file listings, and planning chatter. Prefer several small, focused
entries over one big one.

Respond with ONLY a JSON object (no markdown fences, no prose) of this exact shape:
{
  "learnings": [
    {
      "title": "specific technical title naming the concrete tech/API",
      "language": "primary language/tech, or null",
      "code": "before/after diff or key snippet/command with real identifiers",
      "note": "beginner-friendly explanation, 4-7 sentences in 1-2 short paragraphs",
      "summary": "one short sentence recap for list views",
      "concepts": ["specific API/concept", "..."],
      "relatedConcepts": ["adjacent thing to explore next", "..."]
    }
  ]
}

If nothing technical and reusable was learned, return {"learnings": []}.`;

/** Truncate a value to n chars for inclusion in the judge prompt. */
function clip(v, n) {
  const s = v == null ? "" : String(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/** Flatten a Claude Code .jsonl transcript (raw file contents) into text. */
function transcriptToText(raw) {
  const lines = raw.split("\n");
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    let o;
    try {
      o = JSON.parse(t);
    } catch {
      continue;
    }
    if (o.type !== "user" && o.type !== "assistant") continue;
    const role = o.message?.role || o.type;
    const c = o.message?.content;
    let text = "";
    if (typeof c === "string") text = c;
    else if (Array.isArray(c)) {
      const parts = [];
      for (const b of c) {
        if (!b || typeof b !== "object") continue;
        if (b.type === "text") {
          parts.push(b.text);
        } else if (b.type === "tool_use") {
          // Surface the actual code/commands so the judge sees real detail,
          // not just "[used tool]". This is what makes learnings technical.
          const n = b.name;
          const inp = b.input || {};
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
        } else if (b.type === "tool_result") {
          // Errors and command output live here — keep a trimmed slice.
          let rc = b.content;
          if (Array.isArray(rc))
            rc = rc.map((x) => (x && x.type === "text" ? x.text : "")).join(" ");
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

/** Run the Claude Code CLI headlessly, returning the model's text result. */
function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLI_BIN, ["-p", "--output-format", "json", "--model", CLI_MODEL], {
      stdio: ["pipe", "pipe", "pipe"],
      // Mark this nested session so its SessionEnd hook bails (anti-recursion).
      env: { ...process.env, PIKACHU_CAPTURE: "1" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${stderr || stdout}`));
      try {
        const env = JSON.parse(stdout);
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

function parseLearnings(text) {
  let s = text.trim();
  if (s.startsWith("```")) s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a !== -1 && b !== -1) s = s.slice(a, b + 1);
  const parsed = JSON.parse(s);
  return Array.isArray(parsed.learnings) ? parsed.learnings : [];
}

let _prisma;
async function getPrisma() {
  if (!_prisma) {
    const { PrismaClient } = await import("@prisma/client");
    _prisma = new PrismaClient({ log: ["error"] });
  }
  return _prisma;
}

/**
 * Core: judge one transcript and save any learnings. Reused by the live hook
 * (worker) and the one-time backfill. Does NOT own the Prisma lifecycle.
 * Returns the number of learnings saved.
 */
async function processTranscript(payload, prisma) {
  const sessionId = payload.session_id || path.basename(payload.transcript_path, ".jsonl");
  const repository = payload.cwd
    ? path.basename(payload.cwd)
    : payload.repository ?? null;

  let raw;
  try {
    raw = readFileSync(payload.transcript_path, "utf8");
  } catch (e) {
    log(`could not read transcript ${payload.transcript_path}: ${e.message}`);
    return 0;
  }
  // Guard 2: a transcript carrying our marker IS one of capture's own judge
  // sessions — never re-capture it (anti-recursion, independent of env).
  if (raw.includes(CAPTURE_MARKER)) {
    log(`session ${sessionId} is a capture session; skip (anti-recursion)`);
    return 0;
  }

  const text = transcriptToText(raw);
  if (text.length < 400) {
    log(`session ${sessionId} too short (${text.length} chars); skip`);
    return 0;
  }

  const existing = await prisma.learning.count({ where: { sourceReference: sessionId } });
  if (existing > 0) {
    log(`session ${sessionId} already captured; skip`);
    return 0;
  }

  // Cap transcript size to keep the prompt sane (keep the most recent context).
  // Larger now that we include real code/commands/errors in the flattened text.
  const MAX = 40000;
  const clipped = text.length > MAX ? text.slice(text.length - MAX) : text;
  const prompt = `${JUDGE_PROMPT}\n\n---\nTRANSCRIPT:\n${clipped}`;

  log(`judging session ${sessionId} (${text.length} chars)...`);
  const result = await runClaude(prompt);
  const learnings = parseLearnings(result);
  if (learnings.length === 0) {
    log(`session ${sessionId}: nothing reusable; saved 0`);
    return 0;
  }

  let saved = 0;
  for (const l of learnings) {
    if (!l || !l.title) continue;
    // Code-first: the snippet/diff is the centerpiece; `note` is the full
    // beginner-friendly explanation, `summary` is the one-line card recap.
    const note = String(l.note || l.summary || "").trim();
    const summary = String(l.summary || l.note || "").trim();
    const code = l.code ? String(l.code) : null;
    await prisma.learning.create({
      data: {
        title: String(l.title),
        question: "", // dropped from UI; kept as empty for schema compatibility
        explanation: note,
        summary,
        codeSnippet: code,
        sourceType: "claude",
        sourceReference: sessionId,
        language: l.language ? String(l.language) : null,
        repository,
        concepts: JSON.stringify(Array.isArray(l.concepts) ? l.concepts.map(String) : []),
        relatedConcepts: JSON.stringify(
          Array.isArray(l.relatedConcepts) ? l.relatedConcepts.map(String) : []
        ),
        tags: JSON.stringify([]),
      },
    });
    saved++;
  }
  log(`session ${sessionId}: saved ${saved} learning(s)`);
  return saved;
}

async function worker(payloadFile) {
  const payload = JSON.parse(readFileSync(payloadFile, "utf8"));
  const prisma = await getPrisma();
  try {
    await processTranscript(payload, prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * One-time backfill: scan every existing Claude Code transcript and capture
 * learnings from your whole history. Sub-agent transcripts are skipped (noisy
 * partials). Safe to re-run — dedupes by session id.
 */
async function backfill() {
  const root = path.join(homedir(), ".claude", "projects");
  let rel;
  try {
    rel = readdirSync(root, { recursive: true });
  } catch (e) {
    return log(`backfill: cannot read ${root}: ${e.message}`);
  }
  const files = rel
    .map((r) => String(r))
    .filter((r) => r.endsWith(".jsonl") && !r.includes(`${path.sep}subagents${path.sep}`));

  log(`backfill: ${files.length} transcripts to scan`);
  const prisma = await getPrisma();
  let totalSaved = 0;
  try {
    for (let i = 0; i < files.length; i++) {
      const full = path.join(root, files[i]);
      const projectDir = files[i].split(path.sep)[0]; // e.g. -Users-...-pikachu
      const repository = projectDir.replace(/^-/, "").split("-").pop() || null;
      const session_id = path.basename(full, ".jsonl");
      log(`backfill [${i + 1}/${files.length}] ${repository}/${session_id}`);
      try {
        totalSaved += await processTranscript({ transcript_path: full, session_id, repository }, prisma);
      } catch (e) {
        log(`  backfill error: ${e.message}`);
      }
    }
    log(`backfill complete: saved ${totalSaved} learning(s) from ${files.length} transcripts`);
  } finally {
    await prisma.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
const workerArg = argOf("--worker");
if (process.argv.includes("--backfill")) {
  backfill().catch((e) => log(`backfill fatal: ${e.stack || e.message}`));
} else if (workerArg) {
  worker(workerArg).catch((e) => log(`worker error: ${e.stack || e.message}`));
} else {
  dispatch().catch((e) => log(`dispatch error: ${e.stack || e.message}`));
}
