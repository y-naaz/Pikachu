import { NextRequest, NextResponse } from "next/server";
import { analyzeRepository } from "@/lib/repo-analysis";

/** POST — analyze a repository.
 *  Body: { path: string, maxFiles?: number, languages?: string[] }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  try {
    const result = await analyzeRepository(body.path, {
      maxFiles: body.maxFiles,
      languages: body.languages,
    });
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
