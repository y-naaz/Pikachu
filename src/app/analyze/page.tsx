"use client";

import { useState } from "react";
import { PageHeader, Card, EmptyState } from "@/components/ui";

interface AnalysisResult {
  repository: string;
  filesScanned: number;
  learningsCount: number;
  learnings: Array<{ id: string; title: string }>;
}

export default function AnalyzePage() {
  const [repoPath, setRepoPath] = useState("");
  const [maxFiles, setMaxFiles] = useState(50);
  const [languages, setLanguages] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    if (!repoPath.trim()) return;
    setAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: repoPath.trim(),
          maxFiles,
          languages: languages
            ? languages.split(",").map((l) => l.trim())
            : undefined,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data.result);
      }
    } catch {
      setError("Analysis failed");
    }
    setAnalyzing(false);
  }

  return (
    <>
      <PageHeader
        title="Repository Analysis"
        subtitle="Scan a codebase and extract reusable patterns and learnings."
      />

      <Card className="mb-6">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Repository Path
            </label>
            <input
              type="text"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="/path/to/your/repo"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Max Files
              </label>
              <input
                type="number"
                value={maxFiles}
                onChange={(e) => setMaxFiles(Number(e.target.value))}
                min={10}
                max={200}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Languages (comma-separated)
              </label>
              <input
                type="text"
                value={languages}
                onChange={(e) => setLanguages(e.target.value)}
                placeholder="TypeScript, Python (optional)"
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={analyzing || !repoPath.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {analyzing ? "Analyzing..." : "Analyze Repository"}
          </button>
        </div>
      </Card>

      {error && (
        <Card className="mb-6 border-red-500/30 bg-red-500/5">
          <div className="text-sm text-red-500">{error}</div>
        </Card>
      )}

      {result && (
        <Card className="mb-6 border-accent/30 bg-accent/5">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📊</span>
              <div>
                <div className="font-semibold">Analysis Complete</div>
                <div className="text-sm text-muted">
                  {result.repository} — {result.filesScanned} files scanned
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-semibold">{result.filesScanned}</div>
                <div className="text-xs text-muted">Files Scanned</div>
              </div>
              <div>
                <div className="text-2xl font-semibold">{result.learningsCount}</div>
                <div className="text-xs text-muted">Learnings Found</div>
              </div>
              <div>
                <div className="text-2xl font-semibold">
                  {result.learnings.length > 0 ? "✅" : "—"}
                </div>
                <div className="text-xs text-muted">Status</div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {result && result.learnings.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Extracted Learnings
          </h2>
          <div className="space-y-2">
            {result.learnings.map((l) => (
              <Card key={l.id}>
                <a
                  href={`/learnings/${l.id}`}
                  className="font-medium text-accent hover:underline"
                >
                  {l.title}
                </a>
              </Card>
            ))}
          </div>
        </div>
      )}

      {result && result.learningsCount === 0 && !error && (
        <EmptyState
          title="No learnings extracted."
          hint="The analysis didn't find significant patterns. Try a different repository or adjust the settings."
        />
      )}
    </>
  );
}
