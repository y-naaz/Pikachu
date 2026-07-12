/**
 * Spaced Repetition System (SM-2 Algorithm)
 * 
 * Based on the SuperMemo-2 algorithm with modifications:
 * - Quality ratings: 0-5 (0=complete blackout, 5=perfect recall)
 * - Ease factor: starts at 2.5, adjusted based on performance
 * - Interval: days until next review
 * 
 * The algorithm:
 * 1. If quality >= 3 (correct with effort): increase interval
 * 2. If quality < 3 (incorrect): reset interval to 1 day
 * 3. Adjust ease factor based on quality
 * 4. Cap ease factor at minimum 1.3
 */

export interface ReviewState {
  reviewCount: number;
  easeFactor: number;
  interval: number;
  lastReviewed: Date | null;
  nextReview: Date | null;
}

export interface ReviewResult {
  reviewCount: number;
  easeFactor: number;
  interval: number;
  lastReviewed: Date;
  nextReview: Date;
}

/**
 * Calculate the next review state after a review.
 * 
 * @param state - Current review state
 * @param quality - Quality of recall (0-5)
 *   - 0: Complete blackout
 *   - 1: Wrong answer, but recognized correct when shown
 *   - 2: Wrong answer, but it was easy to recall when shown
 *   - 3: Correct with serious difficulty
 *   - 4: Correct with hesitation
 *   - 5: Perfect recall
 * @returns Updated review state
 */
export function calculateNextReview(
  state: ReviewState,
  quality: number
): ReviewResult {
  const now = new Date();
  const q = Math.max(0, Math.min(5, quality)); // Clamp to 0-5

  let { easeFactor, interval, reviewCount } = state;

  // Increment review count
  reviewCount += 1;

  // Update ease factor using SM-2 formula
  // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  const efDelta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  easeFactor = Math.max(1.3, easeFactor + efDelta);

  // Calculate next interval
  if (q < 3) {
    // Failed: reset to 1 day
    interval = 1;
  } else {
    // Passed: increase interval
    if (reviewCount === 1) {
      interval = 1;
    } else if (reviewCount === 2) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
  }

  // Calculate next review date
  const nextReview = new Date(now);
  nextReview.setDate(nextReview.getDate() + interval);

  return {
    reviewCount,
    easeFactor,
    interval,
    lastReviewed: now,
    nextReview,
  };
}

/**
 * Check if a learning is due for review.
 */
export function isDueForReview(state: ReviewState): boolean {
  if (!state.nextReview) return true; // Never reviewed
  return new Date() >= state.nextReview;
}

/**
 * Get a human-readable description of when the next review is due.
 */
export function getNextReviewLabel(state: ReviewState): string {
  if (!state.nextReview) return "Due now";

  const now = new Date();
  const diff = state.nextReview.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days <= 0) return "Due now";
  if (days === 1) return "Due tomorrow";
  if (days <= 7) return `Due in ${days} days`;
  if (days <= 30) return `Due in ${Math.ceil(days / 7)} weeks`;
  return `Due in ${Math.ceil(days / 30)} months`;
}

/**
 * Calculate initial review state for a new learning.
 * Sets next review to now (immediately available for first review).
 */
export function getInitialState(): ReviewState {
  return {
    reviewCount: 0,
    easeFactor: 2.5,
    interval: 0,
    lastReviewed: null,
    nextReview: new Date(), // Due immediately
  };
}

/**
 * Get quality rating description.
 */
export function getQualityLabel(quality: number): string {
  const labels: Record<number, string> = {
    0: "Blackout",
    1: "Wrong",
    2: "Hard wrong",
    3: "Hard correct",
    4: "Good",
    5: "Easy",
  };
  return labels[quality] || "Unknown";
}

/**
 * Calculate statistics for a set of review states.
 */
export function getReviewStats(
  states: ReviewState[]
): {
  dueCount: number;
  upcomingCount: number;
  masteredCount: number;
  averageEase: number;
  totalReviews: number;
} {
  let dueCount = 0;
  let upcomingCount = 0;
  let masteredCount = 0;
  let totalEase = 0;
  let totalReviews = 0;

  for (const state of states) {
    if (isDueForReview(state)) {
      dueCount++;
    } else {
      upcomingCount++;
    }

    if (state.interval >= 30) {
      masteredCount++;
    }

    totalEase += state.easeFactor;
    totalReviews += state.reviewCount;
  }

  return {
    dueCount,
    upcomingCount,
    masteredCount,
    averageEase: states.length > 0 ? totalEase / states.length : 2.5,
    totalReviews,
  };
}
