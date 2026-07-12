import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import type { ExplainResult } from "./types";

const CACHE_VERSION = "v1";

// L1: in-process memory cache (survives across requests in same server process)
const l1 = new Map<string, ExplainResult>();

/** Normalize code for stable cache keys (strip trailing whitespace, normalize line endings). */
function normalizeCode(code: string): string {
  return code
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .trim();
}

export function explainCacheKey(input: {
  content: string;
  question?: string;
  language?: string;
  provider: string;
  model: string;
}): string {
  const parts = [
    CACHE_VERSION,
    input.model,
    input.provider,
    input.language ?? "",
    (input.question ?? "").trim(),
    normalizeCode(input.content),
  ].join("\x1f");
  return createHash("sha256").update(parts).digest("hex");
}

/** Get from L1 (memory) or L2 (SQLite). Returns null on miss. */
export async function getCachedExplain(key: string): Promise<ExplainResult | null> {
  // L1 hit
  const l1hit = l1.get(key);
  if (l1hit) return l1hit;

  // L2 hit
  const row = await prisma.explainCache.findUnique({ where: { key } });
  if (!row) return null;

  const result = JSON.parse(row.resultJson) as ExplainResult;
  l1.set(key, result); // promote to L1

  // Update stats (fire-and-forget)
  void prisma.explainCache.update({
    where: { key },
    data: { hitCount: { increment: 1 }, lastUsedAt: new Date() },
  });

  return result;
}

/** Store in both L1 and L2. Evict L1 if it exceeds 200 entries. */
export async function setCachedExplain(
  key: string,
  result: ExplainResult
): Promise<void> {
  l1.set(key, result);
  if (l1.size > 200) {
    // Evict oldest key (Map preserves insertion order)
    l1.delete(l1.keys().next().value!);
  }

  await prisma.explainCache.upsert({
    where: { key },
    create: { key, resultJson: JSON.stringify(result) },
    update: { resultJson: JSON.stringify(result), lastUsedAt: new Date() },
  });
}
