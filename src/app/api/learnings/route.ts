import { NextRequest, NextResponse } from "next/server";
import { createLearning, listLearnings } from "@/lib/queries";

export async function GET() {
  const learnings = await listLearnings();
  return NextResponse.json({ learnings });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.title || !body.question || !body.explanation) {
    return NextResponse.json(
      { error: "title, question, and explanation are required" },
      { status: 400 }
    );
  }

  const learning = await createLearning({
    title: body.title,
    question: body.question,
    explanation: body.explanation,
    summary: body.summary,
    sourceType: body.sourceType,
    sourceReference: body.sourceReference,
    language: body.language,
    repository: body.repository,
    filePath: body.filePath,
    branch: body.branch,
    codeSnippet: body.codeSnippet,
    concepts: body.concepts,
    relatedConcepts: body.relatedConcepts,
    tags: body.tags,
  });

  return NextResponse.json({ learning }, { status: 201 });
}
