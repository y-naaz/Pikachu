import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateNextReview, getReviewStats } from "@/lib/spaced-repetition";
import { toLearning } from "@/lib/learning";

/** GET — Get learnings due for review, with stats. */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const limit = parseInt(searchParams.get("limit") || "10", 10);

  // Get learnings due for review (nextReview is null or <= now)
  const dueLearnings = await prisma.learning.findMany({
    where: {
      OR: [
        { nextReview: null },
        { nextReview: { lte: new Date() } },
      ],
    },
    orderBy: { nextReview: "asc" },
    take: limit,
  });

  // Get all learnings for stats
  const allLearnings = await prisma.learning.findMany({
    select: {
      reviewCount: true,
      easeFactor: true,
      interval: true,
      lastReviewed: true,
      nextReview: true,
    },
  });

  const stats = getReviewStats(
    allLearnings.map((l) => ({
      reviewCount: l.reviewCount,
      easeFactor: l.easeFactor,
      interval: l.interval,
      lastReviewed: l.lastReviewed,
      nextReview: l.nextReview,
    }))
  );

  return NextResponse.json({
    learnings: dueLearnings.map(toLearning),
    stats,
  });
}

/** POST — Submit a review for a learning.
 *  Body: { learningId: string, quality: number (0-5) }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.learningId || body.quality === undefined) {
    return NextResponse.json(
      { error: "learningId and quality are required" },
      { status: 400 }
    );
  }

  const learning = await prisma.learning.findUnique({
    where: { id: body.learningId },
  });

  if (!learning) {
    return NextResponse.json({ error: "Learning not found" }, { status: 404 });
  }

  const currentState = {
    reviewCount: learning.reviewCount,
    easeFactor: learning.easeFactor,
    interval: learning.interval,
    lastReviewed: learning.lastReviewed,
    nextReview: learning.nextReview,
  };

  const newState = calculateNextReview(currentState, body.quality);

  const updated = await prisma.learning.update({
    where: { id: body.learningId },
    data: {
      reviewCount: newState.reviewCount,
      easeFactor: newState.easeFactor,
      interval: newState.interval,
      lastReviewed: newState.lastReviewed,
      nextReview: newState.nextReview,
    },
  });

  return NextResponse.json({ learning: toLearning(updated) });
}
