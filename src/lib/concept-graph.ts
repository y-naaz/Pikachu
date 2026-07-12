import { prisma } from "./prisma";

interface ConceptLearning {
  id: string;
  title: string;
  summary: string;
  language: string | null;
  reviewCount: number;
  nextReview: Date | null;
}

export interface GraphNode {
  id: string;
  label: string;
  count: number;
  language?: string | null;
  learnings: ConceptLearning[];
  relatedConcepts: string[];
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
    totalLearnings: number;
    masteryPercent: number;
  };
}

export async function getConceptGraph(): Promise<GraphData> {
  const learnings = await prisma.learning.findMany({
    select: {
      id: true,
      title: true,
      summary: true,
      language: true,
      concepts: true,
      relatedConcepts: true,
      reviewCount: true,
      nextReview: true,
    },
  });

  const conceptMap = new Map<string, {
    count: number;
    language: Map<string, number>;
    learnings: ConceptLearning[];
    relatedConcepts: Set<string>;
  }>();

  const coOccurrence = new Map<string, number>();

  for (const l of learnings) {
    let concepts: string[];
    let related: string[];
    try { concepts = JSON.parse(l.concepts); } catch { concepts = []; }
    try { related = JSON.parse(l.relatedConcepts); } catch { related = []; }
    if (!Array.isArray(concepts) || concepts.length === 0) continue;

    const learningPick: ConceptLearning = {
      id: l.id,
      title: l.title,
      summary: l.summary,
      language: l.language,
      reviewCount: l.reviewCount,
      nextReview: l.nextReview,
    };

    for (const c of concepts) {
      const key = c.toLowerCase().trim();
      if (!key) continue;
      if (!conceptMap.has(key)) {
        conceptMap.set(key, { count: 0, language: new Map(), learnings: [], relatedConcepts: new Set() });
      }
      const entry = conceptMap.get(key)!;
      entry.count++;
      entry.learnings.push(learningPick);

      const lang = l.language || "unknown";
      entry.language.set(lang, (entry.language.get(lang) ?? 0) + 1);

      // Add related concepts from this learning
      for (const r of related) {
        const rk = r.toLowerCase().trim();
        if (rk && rk !== key) entry.relatedConcepts.add(rk);
      }
      // Also add other concepts from same learning as related
      for (const other of concepts) {
        const ok = other.toLowerCase().trim();
        if (ok && ok !== key) entry.relatedConcepts.add(ok);
      }
    }

    // Co-occurrence edges
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

  // Build nodes
  const nodes: GraphNode[] = [];
  for (const [id, data] of conceptMap) {
    let dominantLang: string | null = null;
    let maxCount = 0;
    for (const [l, c] of data.language) {
      if (c > maxCount && l !== "unknown") { maxCount = c; dominantLang = l; }
    }

    // Pick related concepts that actually exist in our graph
    const relatedInGraph = [...data.relatedConcepts]
      .filter((r) => conceptMap.has(r))
      .slice(0, 8);

    nodes.push({
      id,
      label: id,
      count: data.count,
      language: dominantLang,
      learnings: data.learnings,
      relatedConcepts: relatedInGraph,
    });
  }

  nodes.sort((a, b) => b.count - a.count);

  const nodeIds = new Set(nodes.map((n) => n.id));

  const edges: GraphEdge[] = [];
  for (const [key, weight] of coOccurrence) {
    const [a, b] = key.split("||");
    if (nodeIds.has(a) && nodeIds.has(b)) {
      edges.push({ source: a, target: b, weight });
    }
  }

  // Mastery: % of learnings that have been reviewed at least once
  const reviewed = learnings.filter((l) => l.reviewCount > 0).length;
  const masteryPercent = learnings.length > 0
    ? Math.round((reviewed / learnings.length) * 100)
    : 0;

  return {
    nodes,
    edges,
    stats: {
      totalConcepts: nodes.length,
      totalConnections: edges.length,
      totalLearnings: learnings.length,
      masteryPercent,
    },
  };
}
