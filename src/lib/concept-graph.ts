import { prisma } from "./prisma";

export interface GraphNode {
  id: string;
  label: string;
  count: number;
  language?: string | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalConcepts: number;
    totalConnections: number;
    topLanguages: Array<{ language: string; count: number }>;
    mostConnected: Array<{ concept: string; connections: number }>;
  };
}

/**
 * Build a concept graph with rich metadata for filtering and visualization.
 */
export async function getConceptGraph(): Promise<GraphData> {
  const learnings = await prisma.learning.findMany({
    select: { concepts: true, relatedConcepts: true, language: true },
  });

  const conceptCount = new Map<string, number>();
  const conceptLanguage = new Map<string, Map<string, number>>();
  const coOccurrence = new Map<string, number>();
  const languageCount = new Map<string, number>();

  for (const l of learnings) {
    let concepts: string[];
    try {
      concepts = JSON.parse(l.concepts);
    } catch {
      concepts = [];
    }
    if (!Array.isArray(concepts) || concepts.length === 0) continue;

    const lang = l.language || "unknown";
    languageCount.set(lang, (languageCount.get(lang) ?? 0) + 1);

    for (const c of concepts) {
      const key = c.toLowerCase().trim();
      if (!key) continue;
      conceptCount.set(key, (conceptCount.get(key) ?? 0) + 1);

      if (!conceptLanguage.has(key)) conceptLanguage.set(key, new Map());
      const langMap = conceptLanguage.get(key)!;
      langMap.set(lang, (langMap.get(lang) ?? 0) + 1);
    }

    for (let i = 0; i < concepts.length; i++) {
      for (let j = i + 1; j < concepts.length; j++) {
        const a = concepts[i].toLowerCase().trim();
        const b = concepts[j].toLowerCase().trim();
        if (!a || !b || a === b) continue;
        const edgeKey = a < b ? `${a}||${b}` : `${b}||${a}`;
        coOccurrence.set(edgeKey, (coOccurrence.get(edgeKey) ?? 0) + 1);
      }
    }
  }

  // Build nodes — all concepts, let the UI filter
  const nodes: GraphNode[] = [];
  for (const [label, count] of conceptCount) {
    // Find dominant language
    const langMap = conceptLanguage.get(label);
    let dominantLang: string | null = null;
    let maxCount = 0;
    if (langMap) {
      for (const [l, c] of langMap) {
        if (c > maxCount) {
          maxCount = c;
          dominantLang = l;
        }
      }
    }
    nodes.push({ id: label, label, count, language: dominantLang });
  }

  // Sort by count descending
  nodes.sort((a, b) => b.count - a.count);

  const nodeIds = new Set(nodes.map((n) => n.id));

  const edges: GraphEdge[] = [];
  for (const [key, weight] of coOccurrence) {
    const [a, b] = key.split("||");
    if (nodeIds.has(a) && nodeIds.has(b)) {
      edges.push({ source: a, target: b, weight });
    }
  }

  // Compute stats
  const connectionCount = new Map<string, number>();
  for (const e of edges) {
    connectionCount.set(e.source, (connectionCount.get(e.source) ?? 0) + 1);
    connectionCount.set(e.target, (connectionCount.get(e.target) ?? 0) + 1);
  }

  const mostConnected = [...connectionCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([concept, connections]) => ({ concept, connections }));

  const topLanguages = [...languageCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([language, count]) => ({ language, count }));

  return {
    nodes,
    edges,
    stats: {
      totalConcepts: nodes.length,
      totalConnections: edges.length,
      topLanguages,
      mostConnected,
    },
  };
}
