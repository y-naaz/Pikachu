"use client";

import { useState, useEffect } from "react";
import { PageHeader, Card, EmptyState } from "@/components/ui";

interface Transcript {
  path: string;
  sessionId: string;
  project: string;
}

interface ImportResult {
  sessionId: string;
  learningsCount: number;
  learnings: Array<{ id: string; title: string }>;
}

export default function ImportPage() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/import")
      .then((r) => r.json())
      .then((d) => {
        setTranscripts(d.transcripts || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function importOne(sessionId: string) {
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResults((prev) => [...prev, data.result]);
      }
    } catch {
      setError("Import failed");
    }
    setImporting(false);
  }

  async function importAll() {
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.result) {
        setResults((prev) => [
          ...prev,
          {
            sessionId: "bulk",
            learningsCount: data.result.saved,
            learnings: [],
          },
        ]);
      }
    } catch {
      setError("Bulk import failed");
    }
    setImporting(false);
  }

  const totalImported = results.reduce((sum, r) => sum + r.learningsCount, 0);

  return (
    <>
      <PageHeader
        title="Import Conversations"
        subtitle="Import learnings from your Claude Code session transcripts."
      />

      {totalImported > 0 && (
        <Card className="mb-6 border-accent/30 bg-accent/5">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <div className="font-semibold">{totalImported} learnings imported</div>
              <div className="text-sm text-muted">
                from {results.length} session{results.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
        </Card>
      )}

      {error && (
        <Card className="mb-6 border-red-500/30 bg-red-500/5">
          <div className="text-sm text-red-500">{error}</div>
        </Card>
      )}

      <div className="mb-6 flex gap-3">
        <button
          onClick={importAll}
          disabled={importing || transcripts.length === 0}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {importing ? "Importing..." : "Import All Sessions"}
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-muted">Loading transcripts...</div>
      ) : transcripts.length === 0 ? (
        <EmptyState
          title="No transcripts found."
          hint="Claude Code session transcripts are stored in ~/.claude/projects. Run some Claude Code sessions first."
        />
      ) : (
        <div className="space-y-2">
          <div className="text-sm text-muted mb-3">
            {transcripts.length} session{transcripts.length !== 1 ? "s" : ""} available
          </div>
          {transcripts.map((t) => {
            const alreadyImported = results.some(
              (r) => r.sessionId === t.sessionId && r.learningsCount > 0
            );
            return (
              <Card key={t.sessionId} className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm truncate">{t.sessionId}</div>
                  <div className="text-xs text-muted">Project: {t.project}</div>
                </div>
                <button
                  onClick={() => importOne(t.sessionId)}
                  disabled={importing || alreadyImported}
                  className="ml-4 shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-2 disabled:opacity-50"
                >
                  {alreadyImported ? "Imported" : importing ? "Importing..." : "Import"}
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
