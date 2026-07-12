"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PageHeader, Card, EmptyState } from "@/components/ui";

interface GraphNode {
  id: string;
  label: string;
  count: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

interface GraphData {
  nodes: Array<{ id: string; label: string; count: number }>;
  edges: GraphEdge[];
}

const WIDTH = 800;
const HEIGHT = 500;
const CHARGE = -200;
const LINK_DISTANCE = 100;
const DAMPING = 0.9;
const ITERATIONS = 300;

function initializePositions(nodes: GraphNode[]): GraphNode[] {
  return nodes.map((n, i) => ({
    ...n,
    x: WIDTH / 2 + Math.cos((i / nodes.length) * Math.PI * 2) * 150,
    y: HEIGHT / 2 + Math.sin((i / nodes.length) * Math.PI * 2) * 150,
    vx: 0,
    vy: 0,
  }));
}

function simulate(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = CHARGE / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - LINK_DISTANCE) * 0.01 * edge.weight;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // Center gravity
    for (const n of nodes) {
      n.vx += (WIDTH / 2 - n.x) * 0.001;
      n.vy += (HEIGHT / 2 - n.y) * 0.001;
    }

    // Apply velocities
    for (const n of nodes) {
      n.vx *= DAMPING;
      n.vy *= DAMPING;
      n.x += n.vx;
      n.y += n.vy;
      // Bounds
      n.x = Math.max(40, Math.min(WIDTH - 40, n.x));
      n.y = Math.max(40, Math.min(HEIGHT - 40, n.y));
    }
  }

  return nodes;
}

export default function GraphPage() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulated, setSimulated] = useState<GraphNode[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<string | null>(null);
  const lastMouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    fetch("/api/graph")
      .then((r) => r.json())
      .then((data: GraphData) => {
        setGraphData(data);
        const nodes = initializePositions(
          data.nodes.map((n) => ({ ...n, x: 0, y: 0, vx: 0, vy: 0 }))
        );
        const result = simulate(nodes, data.edges);
        setSimulated(result);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const getNodeAt = useCallback(
    (mx: number, my: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const x = mx - rect.left - offset.x;
      const y = my - rect.top - offset.y;
      for (let i = simulated.length - 1; i >= 0; i--) {
        const n = simulated[i];
        const r = 6 + n.count * 3;
        if ((n.x - x) ** 2 + (n.y - y) ** 2 < r * r) return n;
      }
      return null;
    },
    [simulated, offset]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    const node = getNodeAt(e.clientX, e.clientY);
    if (node) {
      dragging.current = node.id;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging.current) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      setSimulated((prev) =>
        prev.map((n) =>
          n.id === dragging.current
            ? { ...n, x: n.x + dx, y: n.y + dy }
            : n
        )
      );
    }
    const node = getNodeAt(e.clientX, e.clientY);
    setHovered(node?.id ?? null);
  };

  const handleMouseUp = () => {
    if (dragging.current) {
      const node = simulated.find((n) => n.id === dragging.current);
      if (node) setSelected(node.id);
      dragging.current = null;
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader title="Concept Graph" subtitle="Visualize how your concepts connect." />
        <div className="text-sm text-muted">Loading graph...</div>
      </>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <>
        <PageHeader title="Concept Graph" subtitle="Visualize how your concepts connect." />
        <EmptyState
          title="No concepts yet."
          hint="Add some learnings first, then come back to see how concepts connect."
        />
      </>
    );
  }

  const nodeMap = new Map(simulated.map((n) => [n.id, n]));

  return (
    <>
      <PageHeader
        title="Concept Graph"
        subtitle={`${graphData.nodes.length} concepts, ${graphData.edges.length} connections. Drag nodes to rearrange.`}
      />

      <Card className="overflow-hidden">
        <svg
          ref={svgRef}
          width={WIDTH}
          height={HEIGHT}
          className="w-full cursor-grab bg-surface"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            setHovered(null);
            dragging.current = null;
          }}
        >
          {/* Edges */}
          {graphData.edges.map((edge, i) => {
            const a = nodeMap.get(edge.source);
            const b = nodeMap.get(edge.target);
            if (!a || !b) return null;
            const isHighlighted =
              hovered === edge.source || hovered === edge.target;
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={isHighlighted ? "#facc15" : "#404040"}
                strokeWidth={isHighlighted ? 2 : 1}
                strokeOpacity={isHighlighted ? 0.8 : 0.3}
              />
            );
          })}

          {/* Nodes */}
          {simulated.map((node) => {
            const r = 6 + node.count * 3;
            const isHovered = hovered === node.id;
            const isSelected_ = selected === node.id;
            const isConnected =
              hovered !== null &&
              graphData.edges.some(
                (e) =>
                  (e.source === hovered && e.target === node.id) ||
                  (e.target === hovered && e.source === node.id)
              );

            return (
              <g key={node.id}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={r}
                  fill={
                    isSelected_
                      ? "#facc15"
                      : isHovered || isConnected
                      ? "#fbbf24"
                      : "#525252"
                  }
                  stroke={
                    isSelected_ || isHovered ? "#facc15" : "#737373"
                  }
                  strokeWidth={isSelected_ || isHovered ? 2 : 1}
                  className="cursor-pointer transition-colors"
                />
                {(isHovered || isConnected || isSelected_) && (
                  <text
                    x={node.x}
                    y={node.y - r - 4}
                    textAnchor="middle"
                    fill="#e5e5e5"
                    fontSize={11}
                    className="pointer-events-none select-none"
                  >
                    {node.label}
                    {node.count > 1 && (
                      <tspan fill="#a3a3a3"> ({node.count})</tspan>
                    )}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </Card>

      {selected && (
        <Card className="mt-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">{selected}</div>
              <div className="text-sm text-muted">
                {graphData.nodes.find((n) => n.id === selected)?.count ?? 0} learnings
              </div>
            </div>
            <a
              href={`/search?q=${encodeURIComponent(selected)}`}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black"
            >
              Search
            </a>
          </div>
        </Card>
      )}
    </>
  );
}
