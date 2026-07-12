"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Learning } from "@/lib/types";
import { LearningCard } from "@/components/LearningCard";
import { EmptyState } from "@/components/ui";

function SearchInner() {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [results, setResults] = useState<Learning[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearched(false);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json().catch(() => ({ learnings: [] }));
      setResults(data.learnings ?? []);
      setLoading(false);
      setSearched(true);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <>
      <h1 className="text-2xl font-semibold">Search</h1>
      <p className="mt-1 text-sm text-muted">
        Full-text search across titles, questions, explanations, concepts, and
        repositories.
      </p>

      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search your engineering memory…"
        className="mt-6 w-full rounded-lg border border-border bg-surface-2 px-4 py-3 outline-none focus:border-accent"
      />

      <div className="mt-6 grid gap-3">
        {loading && <p className="text-sm text-muted">Searching…</p>}
        {!loading && searched && results.length === 0 && (
          <EmptyState title="No matches." hint="Try a different term." />
        )}
        {results.map((l) => (
          <LearningCard key={l.id} learning={l} />
        ))}
      </div>
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchInner />
    </Suspense>
  );
}
