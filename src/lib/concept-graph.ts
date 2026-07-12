import { prisma } from "./prisma";

export interface GraphNode {
  id: string;
  label: string;
  count: number; // how many learnings reference this concept
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number; // how many learnings share both concepts
}

/**
 * Build a concept graph: nodes are concepts, edges connect concepts
 * that appear together in the same learning.
 */
export async function getConceptGraph(): Promise<{
  nodes: GraphNode[];
  edges: GraphEdge[];
}> {
  const learnings = await prisma.learning.findMany({
    select: { concepts: true, relatedConcepts: true },
  });

  // Count concept frequency
  const conceptCount = new Map<string, number>();
  // Count co-occurrence
  const coOccurrence = new Map<string, number>();

  for (const l of learnings) {
    let concepts: string[];
    try {
      concepts = JSON.parse(l.concepts);
    } catch {
      concepts = [];
    }
    if (!Array.isArray(concepts) || concepts.length === 0) continue;

    // Count each concept
    for (const c of concepts) {
      const key = c.toLowerCase().trim();
      if (!key) continue;
      conceptCount.set(key, (conceptCount.get(key) ?? 0) + 1);
    }

    // Count co-occurrence pairs
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

  // Build nodes (only concepts appearing >= 2 times for a cleaner graph)
  const nodes: GraphNode[] = [];
  for (const [label, count] of conceptCount) {
    if (count >= 2) {
      nodes.push({ id: label, label, count });
    }
  }

  // If fewer than 3 nodes with count >= 2, include singletons
  if (nodes.length < 3) {
    for (const [label, count] of conceptCount) {
      if (count === 1 && nodes.length < 30) {
        nodes.push({ id: label, label, count });
      }
    }
  }

  const nodeIds = new Set(nodes.map((n) => n.id));

  // Build edges (only between nodes in our set)
  const edges: GraphEdge[] = [];
  for (const [key, weight] of coOccurrence) {
    const [a, b] = key.split("||");
    if (nodeIds.has(a) && nodeIds.has(b)) {
      edges.push({ source: a, target: b, weight });
    }
  }

  return { nodes, edges };
}
