import { NextRequest, NextResponse } from "next/server";
import { explain as explainClaude, explainStream as explainStreamClaude } from "@/lib/claude";
import { explain as explainOpenCode } from "@/lib/opencode";
import { explainCacheKey, getCachedExplain, setCachedExplain } from "@/lib/explain-cache";
import { composeExplanation } from "@/lib/learning";
import { createLearning } from "@/lib/queries";
import type { ExplainResult } from "@/lib/types";
import type { SourceType } from "@/lib/types";

const SDK_MODEL = process.env.CLAUDE_SDK_MODEL || "claude-sonnet-4-5-20251001";
const CLI_MODEL = process.env.CLAUDE_CLI_MODEL || "sonnet";

/**
 * Explain-and-Save (Feature 2).
 * POST { content, question?, language?, save?, provider?, stream?,
 *        repository?, filePath?, branch?, sourceType?, sourceReference? }
 *
 * - provider: "claude" (default) | "opencode"
 * - stream: true  → SSE stream of Partial<ExplainResult> chunks
 * - Caches by content-hash; same snippet = instant response.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const provider: "claude" | "opencode" =
    body.provider === "opencode" ? "opencode" : "claude";
  const model = process.env.ANTHROPIC_API_KEY ? SDK_MODEL : CLI_MODEL;
  const cacheKey = explainCacheKey({
    content: body.content,
    question: body.question,
    language: body.language,
    provider,
    model,
  });

  // ── Streaming path ─────────────────────────────────────────────────────────
  if (body.stream === true) {
    if (provider !== "claude") {
      return NextResponse.json(
        { error: "Streaming is only supported with the claude provider." },
        { status: 400 }
      );
    }

    const encoder = new TextEncoder();
    const accumulated: Partial<ExplainResult> = {};

    // Check cache first — if hit, stream it field-by-field instantly
    const cached = await getCachedExplain(cacheKey);
    if (cached) {
      const fields = Object.entries(cached) as [keyof ExplainResult, unknown][];
      const stream = new ReadableStream({
        start(controller) {
          const send = (data: unknown) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          for (const [k, v] of fields) send({ [k]: v });
          send({ done: true, cached: true });
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        try {
          for await (const chunk of explainStreamClaude({ content: body.content, question: body.question, language: body.language })) {
            Object.assign(accumulated, chunk);
            send(chunk);
          }
          send({ done: true });
          // Persist complete result to cache (best-effort)
          if (accumulated.title) {
            void setCachedExplain(cacheKey, accumulated as ExplainResult);
          }
        } catch (err) {
          send({ error: err instanceof Error ? err.message : "Streaming failed" });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // ── Non-streaming path ─────────────────────────────────────────────────────

  // Cache check
  const cached = await getCachedExplain(cacheKey);
  if (cached && !body.save) {
    return NextResponse.json({ result: cached, cached: true });
  }

  const explainFn = provider === "opencode" ? explainOpenCode : explainClaude;
  let result: ExplainResult;
  try {
    result = cached ?? (await explainFn({ content: body.content, question: body.question, language: body.language }));
    if (!cached) void setCachedExplain(cacheKey, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate explanation";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!body.save) {
    return NextResponse.json({ result });
  }

  const learning = await createLearning({
    title: result.title,
    question: body.question || `Explain: ${result.title}`,
    explanation: composeExplanation(result),
    summary: result.summary,
    sourceType: (body.sourceType as SourceType) ?? provider,
    sourceReference: body.sourceReference ?? null,
    language: body.language ?? null,
    repository: body.repository ?? null,
    filePath: body.filePath ?? null,
    branch: body.branch ?? null,
    codeSnippet: body.content,
    concepts: result.concepts,
    relatedConcepts: result.relatedConcepts,
    tags: [],
  });

  return NextResponse.json({ result, learning }, { status: 201 });
}
