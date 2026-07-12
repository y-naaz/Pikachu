"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { getQualityLabel, getNextReviewLabel } from "@/lib/spaced-repetition";

interface Learning {
  id: string;
  title: string;
  question: string;
  explanation: string;
  summary: string;
  codeSnippet: string | null;
  language: string | null;
  concepts: string[];
  reviewCount: number;
  easeFactor: number;
  interval: number;
  lastReviewed: string | null;
  nextReview: string | null;
}

interface ReviewStats {
  dueCount: number;
  upcomingCount: number;
  masteredCount: number;
  averageEase: number;
  totalReviews: number;
}

export default function ReviewPage() {
  const [dueLearnings, setDueLearnings] = useState<Learning[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const loadDueLearnings = useCallback(async () => {
    try {
      const res = await fetch("/api/review?limit=20");
      const data = await res.json();
      setDueLearnings(data.learnings || []);
      setStats(data.stats || null);
      setCurrentIndex(0);
      setShowAnswer(false);
      setCompleted(false);
    } catch {
      // Handle error
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/review?limit=20");
        const data = await res.json();
        if (!cancelled) {
          setDueLearnings(data.learnings || []);
          setStats(data.stats || null);
          setCurrentIndex(0);
          setShowAnswer(false);
          setCompleted(false);
        }
      } catch {
        // Handle error
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function submitReview(quality: number) {
    if (submitting || currentIndex >= dueLearnings.length) return;
    setSubmitting(true);

    try {
      const learning = dueLearnings[currentIndex];
      await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learningId: learning.id, quality }),
      });

      // Move to next or complete
      if (currentIndex + 1 >= dueLearnings.length) {
        setCompleted(true);
      } else {
        setCurrentIndex((prev) => prev + 1);
        setShowAnswer(false);
      }
    } catch {
      // Handle error
    }
    setSubmitting(false);
  }

  const currentLearning = dueLearnings[currentIndex];

  return (
    <>
      <PageHeader
        title="Review"
        subtitle="Spaced repetition review for your learnings."
      />

      {/* Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-4 gap-4">
          <Card>
            <div className="text-2xl font-semibold text-accent">{stats.dueCount}</div>
            <div className="text-xs text-muted">Due Now</div>
          </Card>
          <Card>
            <div className="text-2xl font-semibold">{stats.upcomingCount}</div>
            <div className="text-xs text-muted">Upcoming</div>
          </Card>
          <Card>
            <div className="text-2xl font-semibold text-green-500">{stats.masteredCount}</div>
            <div className="text-xs text-muted">Mastered</div>
          </Card>
          <Card>
            <div className="text-2xl font-semibold">{stats.totalReviews}</div>
            <div className="text-xs text-muted">Total Reviews</div>
          </Card>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted">Loading due reviews...</div>
      ) : dueLearnings.length === 0 || completed ? (
        <EmptyState
          title={completed ? "Review session complete!" : "No learnings due for review."}
          hint={
            completed
              ? "Great job! Come back later when more learnings are due."
              : "New learnings will become due as you add them. Check back later."
          }
          cta={
            completed ? (
              <button
                onClick={loadDueLearnings}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black"
              >
                Refresh
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          {/* Progress */}
          <div className="flex items-center gap-3">
            <div className="text-sm text-muted">
              {currentIndex + 1} / {dueLearnings.length}
            </div>
            <div className="flex-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-2 rounded-full bg-accent transition-all"
                style={{
                  width: `${((currentIndex + 1) / dueLearnings.length) * 100}%`,
                }}
              />
            </div>
          </div>

          {/* Learning Card */}
          <Card className="min-h-[300px]">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <h2 className="text-lg font-semibold">{currentLearning.title}</h2>
                <div className="flex gap-2">
                  {currentLearning.language && (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                      {currentLearning.language}
                    </span>
                  )}
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                    {getNextReviewLabel({
                      reviewCount: currentLearning.reviewCount,
                      easeFactor: currentLearning.easeFactor,
                      interval: currentLearning.interval,
                      lastReviewed: currentLearning.lastReviewed
                        ? new Date(currentLearning.lastReviewed)
                        : null,
                      nextReview: currentLearning.nextReview
                        ? new Date(currentLearning.nextReview)
                        : null,
                    })}
                  </span>
                </div>
              </div>

              {currentLearning.summary && (
                <p className="text-muted">{currentLearning.summary}</p>
              )}

              {currentLearning.concepts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {currentLearning.concepts.map((c) => (
                    <span
                      key={c}
                      className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs text-accent"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}

              {showAnswer && (
                <div className="mt-4 space-y-4 border-t border-border pt-4">
                  <div className="prose prose-sm max-w-none text-foreground">
                    <div dangerouslySetInnerHTML={{ __html: currentLearning.explanation.replace(/\n/g, "<br>") }} />
                  </div>
                  {currentLearning.codeSnippet && (
                    <pre className="overflow-x-auto rounded-lg bg-surface-2 p-4 text-sm">
                      <code>{currentLearning.codeSnippet}</code>
                    </pre>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Review Buttons */}
          {!showAnswer ? (
            <button
              onClick={() => setShowAnswer(true)}
              className="w-full rounded-lg border border-border py-3 text-sm font-medium transition-colors hover:bg-surface-2"
            >
              Show Answer
            </button>
          ) : (
            <div className="space-y-3">
              <div className="text-center text-sm text-muted">How well did you remember?</div>
              <div className="grid grid-cols-6 gap-2">
                {[0, 1, 2, 3, 4, 5].map((quality) => (
                  <button
                    key={quality}
                    onClick={() => submitReview(quality)}
                    disabled={submitting}
                    className="rounded-lg border border-border py-3 text-sm font-medium transition-colors hover:bg-surface-2 disabled:opacity-50"
                  >
                    <div className="font-semibold">{quality}</div>
                    <div className="text-xs text-muted">
                      {getQualityLabel(quality)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
