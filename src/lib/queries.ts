import { prisma } from "./prisma";
import { serializeLists, toLearning } from "./learning";
import type { Learning, SourceType } from "./types";

export interface CreateLearningInput {
  title: string;
  question: string;
  explanation: string;
  summary?: string;
  sourceType?: SourceType;
  sourceReference?: string | null;
  language?: string | null;
  repository?: string | null;
  filePath?: string | null;
  branch?: string | null;
  codeSnippet?: string | null;
  concepts?: string[];
  relatedConcepts?: string[];
  tags?: string[];
}

export async function listLearnings(opts: { take?: number } = {}): Promise<Learning[]> {
  const rows = await prisma.learning.findMany({
    orderBy: { createdAt: "desc" },
    take: opts.take,
  });
  return rows.map(toLearning);
}

export async function getLearning(id: string): Promise<Learning | null> {
  const row = await prisma.learning.findUnique({ where: { id } });
  return row ? toLearning(row) : null;
}

export async function createLearning(input: CreateLearningInput): Promise<Learning> {
  const row = await prisma.learning.create({
    data: {
      title: input.title,
      question: input.question,
      explanation: input.explanation,
      summary: input.summary ?? "",
      sourceType: input.sourceType ?? "manual",
      sourceReference: input.sourceReference ?? null,
      language: input.language ?? null,
      repository: input.repository ?? null,
      filePath: input.filePath ?? null,
      branch: input.branch ?? null,
      codeSnippet: input.codeSnippet ?? null,
      concepts: JSON.stringify(input.concepts ?? []),
      relatedConcepts: JSON.stringify(input.relatedConcepts ?? []),
      tags: JSON.stringify(input.tags ?? []),
    },
  });
  return toLearning(row);
}

export async function updateLearning(
  id: string,
  input: Partial<CreateLearningInput>
): Promise<Learning> {
  const { concepts, relatedConcepts, tags, ...rest } = input;
  const row = await prisma.learning.update({
    where: { id },
    data: { ...rest, ...serializeLists({ concepts, relatedConcepts, tags }) },
  });
  return toLearning(row);
}

export async function deleteLearning(id: string): Promise<void> {
  await prisma.learning.delete({ where: { id } });
}

/**
 * Fast full-text search via the SQLite FTS5 virtual table (learning_fts).
 * Falls back to an empty result for blank queries.
 */
export async function searchLearnings(query: string): Promise<Learning[]> {
  const q = query.trim();
  if (!q) return [];

  // Turn the user query into a prefix-match FTS expression: each token becomes
  // `token*`, so "oau red" matches "oauth", "redis", etc. Quote tokens to keep
  // FTS5 from interpreting punctuation as operators.
  const ftsQuery = q
    .split(/\s+/)
    .map((t) => t.replace(/["*]/g, ""))
    .filter(Boolean)
    .map((t) => `"${t}"*`)
    .join(" ");

  if (!ftsQuery) return [];

  const matches = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM learning_fts
    WHERE learning_fts MATCH ${ftsQuery}
    ORDER BY rank
    LIMIT 50
  `;

  if (matches.length === 0) return [];

  const rows = await prisma.learning.findMany({
    where: { id: { in: matches.map((m) => m.id) } },
  });

  // Preserve FTS rank ordering.
  const order = new Map(matches.map((m, i) => [m.id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return rows.map(toLearning);
}

export interface DashboardStats {
  total: number;
  recent: Learning[];
  topConcepts: Array<{ concept: string; count: number }>;
  streak: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const all = await listLearnings();
  const counts = new Map<string, number>();
  for (const l of all) {
    for (const c of l.concepts) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const topConcepts = [...counts.entries()]
    .map(([concept, count]) => ({ concept, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    total: all.length,
    recent: all.slice(0, 5),
    topConcepts,
    streak: computeStreak(all.map((l) => l.createdAt)),
  };
}

/** Consecutive-day learning streak ending today (local time). */
function computeStreak(dates: Date[]): number {
  if (dates.length === 0) return 0;
  const days = new Set(dates.map((d) => startOfDay(d).getTime()));
  let streak = 0;
  const cursor = startOfDay(new Date());
  // Allow the streak to count even if nothing was logged *today* yet.
  if (!days.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 1);
  while (days.has(cursor.getTime())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Group concepts -> the learnings that mention them, for the Knowledge Explorer. */
export async function getConceptGroups(): Promise<
  Array<{ concept: string; learnings: Array<Pick<Learning, "id" | "title">> }>
> {
  const all = await listLearnings();
  const map = new Map<string, Array<{ id: string; title: string }>>();
  for (const l of all) {
    for (const c of l.concepts) {
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push({ id: l.id, title: l.title });
    }
  }
  return [...map.entries()]
    .map(([concept, learnings]) => ({ concept, learnings }))
    .sort((a, b) => a.concept.localeCompare(b.concept));
}
