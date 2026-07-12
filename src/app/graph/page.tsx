"use client";

import { useState, useEffect, useMemo } from "react";
import { PageHeader, Card, EmptyState } from "@/components/ui";

interface Learning {
  id: string;
  title: string;
  summary: string;
  language: string | null;
  reviewCount: number;
  nextReview: string | null;
}

interface GraphNode {
  id: string;
  label: string;
  count: number;
  language?: string | null;
  learnings: Learning[];
  relatedConcepts: string[];
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalConcepts: number;
    totalConnections: number;
    totalLearnings: number;
    masteryPercent: number;
  };
}

const LANG_COLORS: Record<string, string> = {
  typescript: "#3178c6",
  javascript: "#f7df1e",
  python: "#3776ab",
  rust: "#dea584",
  go: "#00add8",
  sql: "#e38c00",
  shell: "#89e051",
};

function langColor(lang?: string | null): string {
  if (!lang) return "#737373";
  return LANG_COLORS[lang.toLowerCase()] || "#737373";
}

function isDue(nextReview: string | null): boolean {
  if (!nextReview) return true;
  return new Date() >= new Date(nextReview);
}

export default function GraphPage() {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [langFilter, setLangFilter] = useState("all");

  useEffect(() => {
    fetch("/api/graph")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const availableLangs = useMemo(() => {
    if (!data) return [];
    const s = new Set(data.nodes.map((n) => n.language).filter((l): l is string => !!l));
    return [...s].sort();
  }, [data]);

  const filteredNodes = useMemo(() => {
    if (!data) return [];
    return data.nodes.filter((n) => {
      if (langFilter !== "all" && n.language?.toLowerCase() !== langFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return n.label.includes(q) || n.learnings.some((l) => l.title.toLowerCase().includes(q));
      }
      return true;
    });
  }, [data, search, langFilter]);

  const selectedNode = useMemo(
    () => data?.nodes.find((n) => n.id === selected) ?? null,
    [data, selected]
  );

  // Build connection insights for selected node
  const connectionInsights = useMemo(() => {
    if (!selectedNode || !data) return [];
    return data.edges
      .filter((e) => e.source === selected || e.target === selected)
      .map((e) => {
        const otherId = e.source === selected ? e.target : e.source;
        const otherNode = data.nodes.find((n) => n.id === otherId);
        return {
          id: otherId,
          label: otherNode?.label ?? otherId,
          weight: e.weight,
          count: otherNode?.count ?? 0,
        };
      })
      .sort((a, b) => b.weight - a.weight);
  }, [selectedNode, data, selected]);

  if (loading) {
    return (
      <>
        <PageHeader title="Knowledge Explorer" subtitle="Discover how your learnings connect." />
        <div className="text-sm text-muted">Loading...</div>
      </>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <>
        <PageHeader title="Knowledge Explorer" subtitle="Discover how your learnings connect." />
        <EmptyState
          title="No concepts yet."
          hint="Add some learnings first, then come back to explore your knowledge."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Knowledge Explorer"
        subtitle="Click any concept to explore its learnings and connections."
      />

      {/* Stats bar */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <Card>
          <div className="text-2xl font-semibold">{data.stats.totalConcepts}</div>
          <div className="text-xs text-muted">Concepts</div>
        </Card>
        <Card>
          <div className="text-2xl font-semibold">{data.stats.totalLearnings}</div>
          <div className="text-xs text-muted">Learnings</div>
        </Card>
        <Card>
          <div className="text-2xl font-semibold">{data.stats.totalConnections}</div>
          <div className="text-xs text-muted">Connections</div>
        </Card>
        <Card>
          <div className="text-2xl font-semibold">{data.stats.masteryPercent}%</div>
          <div className="text-xs text-muted">Mastered</div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${data.stats.masteryPercent}%` }}
            />
          </div>
        </Card>
      </div>

      {/* Search + filter */}
      <div className="mb-6 flex gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search concepts..."
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <select
          value={langFilter}
          onChange={(e) => setLangFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted"
        >
          <option value="all">All languages</option>
          {availableLangs.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-6">
        {/* Concept grid — the main thing */}
        <div className="flex-1">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {filteredNodes.map((node) => {
              const isSelected = selected === node.id;
              const hasDue = node.learnings.some((l) => isDue(l.nextReview));
              return (
                <button
                  key={node.id}
                  onClick={() => setSelected(isSelected ? null : node.id)}
                  className={`group relative overflow-hidden rounded-xl border p-4 text-left transition-all ${
                    isSelected
                      ? "border-accent bg-accent/10 ring-1 ring-accent/30"
                      : "border-border bg-surface hover:border-accent/30 hover:bg-surface-2"
                  }`}
                >
                  {/* Language dot */}
                  {node.language && (
                    <span
                      className="absolute right-3 top-3 h-2 w-2 rounded-full"
                      style={{ backgroundColor: langColor(node.language) }}
                    />
                  )}

                  {/* Due indicator */}
                  {hasDue && (
                    <span className="absolute left-3 top-3 h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                  )}

                  <div className="mb-1 font-semibold text-sm group-hover:text-accent transition-colors">
                    {node.label}
                  </div>
                  <div className="text-xs text-muted">
                    {node.count} learning{node.count !== 1 ? "s" : ""}
                  </div>

                  {/* Mini preview of first learning */}
                  {node.learnings[0] && (
                    <div className="mt-2 truncate text-xs text-muted/70">
                      {node.learnings[0].summary || node.learnings[0].title}
                    </div>
                  )}

                  {/* Related concept chips (top 3) */}
                  {node.relatedConcepts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {node.relatedConcepts.slice(0, 3).map((r) => (
                        <span
                          key={r}
                          className="inline-block rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted"
                        >
                          {r}
                        </span>
                      ))}
                      {node.relatedConcepts.length > 3 && (
                        <span className="text-[10px] text-muted">
                          +{node.relatedConcepts.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {filteredNodes.length === 0 && (
            <div className="py-12 text-center text-sm text-muted">
              No concepts match your filter.
            </div>
          )}
        </div>

        {/* Detail panel — shows when a concept is selected */}
        {selectedNode && (
          <div className="w-96 shrink-0">
            <Card className="sticky top-4">
              {/* Header */}
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{selectedNode.label}</h3>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    {selectedNode.language && (
                      <span className="flex items-center gap-1">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: langColor(selectedNode.language) }}
                        />
                        {selectedNode.language}
                      </span>
                    )}
                    <span>{selectedNode.count} learning{selectedNode.count !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="text-muted hover:text-foreground"
                >
                  ✕
                </button>
              </div>

              {/* Quick actions */}
              <div className="mb-4 flex gap-2">
                <a
                  href={`/search?q=${encodeURIComponent(selectedNode.label)}`}
                  className="flex-1 rounded-lg bg-accent px-3 py-2 text-center text-xs font-medium text-black hover:opacity-90"
                >
                  Search
                </a>
                <a
                  href="/review"
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-center text-xs font-medium hover:bg-surface-2"
                >
                  Review
                </a>
                <a
                  href={`/explain`}
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-center text-xs font-medium hover:bg-surface-2"
                >
                  + New
                </a>
              </div>

              {/* Learnings list */}
              <div className="mb-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Learnings
                </div>
                <div className="max-h-60 space-y-2 overflow-y-auto">
                  {selectedNode.learnings.map((l) => (
                    <a
                      key={l.id}
                      href={`/learnings/${l.id}`}
                      className="block rounded-lg border border-border p-3 transition-colors hover:border-accent/30 hover:bg-surface-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{l.title}</div>
                          {l.summary && (
                            <div className="mt-0.5 truncate text-xs text-muted">
                              {l.summary}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {l.reviewCount > 0 && (
                            <span className="rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-500">
                              ✓ reviewed
                            </span>
                          )}
                          {isDue(l.nextReview) && (
                            <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-500">
                              due
                            </span>
                          )}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>

              {/* Related concepts — clickable */}
              {connectionInsights.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    Connected concepts
                  </div>
                  <div className="space-y-1">
                    {connectionInsights.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelected(c.id)}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2"
                      >
                        <span className="truncate">{c.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted">{c.count}× used</span>
                          <span className="text-xs text-accent">→</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested next topics */}
              {selectedNode.relatedConcepts.length > 0 && (
                <div className="mt-4 border-t border-border pt-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    Explore next
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedNode.relatedConcepts.slice(0, 6).map((r) => (
                      <button
                        key={r}
                        onClick={() => {
                          const node = data.nodes.find((n) => n.id === r);
                          if (node) setSelected(r);
                        }}
                        className="rounded-full border border-accent/20 bg-accent/5 px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent/15"
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
