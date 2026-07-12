import { NextRequest, NextResponse } from "next/server";
import { deleteLearning, getLearning, updateLearning } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const learning = await getLearning(id);
  if (!learning) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ learning });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const learning = await updateLearning(id, body);
  return NextResponse.json({ learning });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await deleteLearning(id);
  return NextResponse.json({ ok: true });
}
