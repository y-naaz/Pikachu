import { NextRequest, NextResponse } from "next/server";
import { searchLearnings } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const learnings = await searchLearnings(q);
  return NextResponse.json({ query: q, learnings });
}
