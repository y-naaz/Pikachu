import { NextRequest, NextResponse } from "next/server";
import {
  importTranscript,
  importAllTranscripts,
  listAvailableTranscripts,
} from "@/lib/import-transcript";

/** GET — list available Claude Code transcripts. */
export async function GET() {
  const transcripts = listAvailableTranscripts();
  return NextResponse.json({ transcripts });
}

/** POST — import one or all transcripts.
 *  Body: { sessionId? } — if sessionId provided, import that one; otherwise import all.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // Import all
  if (!body.sessionId) {
    const result = await importAllTranscripts();
    return NextResponse.json({ result });
  }

  // Import one by sessionId — need to find the path
  const transcripts = listAvailableTranscripts();
  const match = transcripts.find((t) => t.sessionId === body.sessionId);
  if (!match) {
    return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
  }

  const result = await importTranscript(match.path, match.sessionId);
  return NextResponse.json({ result });
}
