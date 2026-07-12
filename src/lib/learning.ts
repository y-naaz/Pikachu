import type { Learning as PrismaLearning } from "@prisma/client";
import type { ExplainResult, Learning, SourceType } from "./types";

/** Safely parse a JSON-encoded string[] column. */
function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Convert a Prisma row into the app-facing Learning (arrays parsed). */
export function toLearning(row: PrismaLearning): Learning {
  return {
    ...row,
    sourceType: row.sourceType as SourceType,
    concepts: parseList(row.concepts),
    relatedConcepts: parseList(row.relatedConcepts),
    tags: parseList(row.tags),
  };
}

/** Serialize array fields back to JSON strings for storage. */
export function serializeLists(input: {
  concepts?: string[];
  relatedConcepts?: string[];
  tags?: string[];
}) {
  return {
    ...(input.concepts !== undefined
      ? { concepts: JSON.stringify(input.concepts) }
      : {}),
    ...(input.relatedConcepts !== undefined
      ? { relatedConcepts: JSON.stringify(input.relatedConcepts) }
      : {}),
    ...(input.tags !== undefined ? { tags: JSON.stringify(input.tags) } : {}),
  };
}

/**
 * Compose an explanation body from Claude's structured what/why/how output.
 * Stored in Learning.explanation as readable markdown.
 */
export function composeExplanation(r: ExplainResult): string {
  return [
    `## What is it?\n${r.what}`,
    `## Why does it exist?\n${r.why}`,
    `## How does it work?\n${r.how}`,
  ].join("\n\n");
}
