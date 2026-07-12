import { NextResponse } from "next/server";
import { getConceptGraph } from "@/lib/concept-graph";

export async function GET() {
  const graph = await getConceptGraph();
  return NextResponse.json(graph);
}
