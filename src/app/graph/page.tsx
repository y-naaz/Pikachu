"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { PageHeader, Card, EmptyState } from "@/components/ui";

interface GraphNode {
  id: string;
  label: string;
  count: number;
  language?: string | null;
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
  nodes: Array<{ id: string; label: string; count: number; language?: string | null }>;
  edges: GraphEdge[];
  stats: {
    totalConcepts: number;
    totalConnections: number;
    topLanguages: Array<{ language: string; count: number }>;
    mostConnected: Array<{ concept: string; connections: number }>;
  };
}

const CHARGE = -250;
const LINK_DISTANCE = 90;
const DAMPING = 0.88;
const ITERATIONS = 350;

// Color palette by language
const LANG_COLORS: Record<string, string> = {
  typescript: "#3178c6",
  javascript: "#f7df1e",
  python: "#3776ab",
  rust: "#dea584",
  go: "#00add8",
  sql: "#e38c00",
  html: "#e34c26",
  css: "#563d7c",
  shell: "#89e051",
  unknown: "#737373",
};

function getLangColor(lang?: string | null): string {
  if (!lang) return "#737373";
  return LANG_COLORS[lang.toLowerCase()] || "#737373";
}

function getNodeRadius(count: number): number {
  return Math.min(8 + Math.sqrt(count) * 4, 24);
}

function initializePositions(nodes: GraphNode[], w: number, h: number): GraphNode[] {
  return nodes.map((n, i) => ({
    ...n,
    x: w / 2 + Math.cos((i / nodes.length) * Math.PI * 2) * Math.min(w, h) * 0.35,
    y: h / 2 + Math.sin((i / nodes.length) * Math.PI * 2) * Math.min(w, h) * 0.35,
    vx: 0,
    vy: 0,
  }));
}

function simulate(nodes: GraphNode[], edges: GraphEdge[], w: number, h: number): GraphNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const alpha = 1 - iter / ITERATIONS; // Cooling

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (CHARGE * alpha) / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    for (const edge of edges) {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - LINK_DISTANCE) * 0.008 * edge.weight * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    for (const n of nodes) {
      n.vx += (w / 2 - n.x) * 0.0008 * alpha;
      n.vy += (h / 2 - n.y) * 0.0008 * alpha;
    }

    for (const n of nodes) {
      n.vx *= DAMPING;
      n.vy *= DAMPING;
      n.x += n.vx;
      n.y += n.vy;
      n.x = Math.max(50, Math.min(w - 50, n.x));
      n.y = Math.max(50, Math.min(h - 50, n.y));
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

  // Zoom & pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Filters
  const [minCount, setMinCount] = useState(1);
  const [langFilter, setLangFilter] = useState<string>("all");
  const [showLabels, setShowLabels] = useState(true);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<string | null>(null);
  const lastMouse = useRef({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 500 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.max(400, width), h: Math.max(300, height) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    fetch("/api/graph")
      .then((r) => r.json())
      .then((data: GraphData) => {
        setGraphData(data);
        const nodes = initializePositions(
          data.nodes.map((n) => ({ ...n, x: 0, y: 0, vx: 0, vy: 0 })),
          dims.w,
          dims.h
        );
        const result = simulate(nodes, data.edges, dims.w, dims.h);
        setSimulated(result);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [dims.w, dims.h]);

  // Filter nodes
  const filteredNodes = useMemo(() => {
    return simulated.filter((n) => {
      if (n.count < minCount) return false;
      if (langFilter !== "all" && n.language?.toLowerCase() !== langFilter) return false;
      return true;
    });
  }, [simulated, minCount, langFilter]);

  const filteredIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  const filteredEdges = useMemo(() => {
    return graphData?.edges.filter(
      (e) => filteredIds.has(e.source) && filteredIds.has(e.target)
    ) ?? [];
  }, [graphData, filteredIds]);

  const nodeMap = useMemo(
    () => new Map(filteredNodes.map((n) => [n.id, n])),
    [filteredNodes]
  );

  // Connection count for each node
  const connectionMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filteredEdges) {
      map.set(e.source, (map.get(e.source) ?? 0) + 1);
      map.set(e.target, (map.get(e.target) ?? 0) + 1);
    }
    return map;
  }, [filteredEdges]);

  const availableLanguages = useMemo(() => {
    if (!graphData) return [];
    const langs = new Set(graphData.nodes.map((n) => n.language).filter((l): l is string => !!l));
    return [...langs].sort();
  }, [graphData]);

  // Convert screen coords to SVG coords
  const screenToSvg = useCallback(
    (sx: number, sy: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (sx - rect.left - pan.x) / zoom,
        y: (sy - rect.top - pan.y) / zoom,
      };
    },
    [zoom, pan]
  );

  const getNodeAt = useCallback(
    (sx: number, sy: number) => {
      const { x, y } = screenToSvg(sx, sy);
      for (let i = filteredNodes.length - 1; i >= 0; i--) {
        const n = filteredNodes[i];
        const r = getNodeRadius(n.count);
        if ((n.x - x) ** 2 + (n.y - y) ** 2 < (r + 4) ** 2) return n;
      }
      return null;
    },
    [filteredNodes, screenToSvg]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    const node = getNodeAt(e.clientX, e.clientY);
    if (node) {
      dragging.current = node.id;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    } else {
      // Start panning
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging.current) {
      const dx = (e.clientX - lastMouse.current.x) / zoom;
      const dy = (e.clientY - lastMouse.current.y) / zoom;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      setSimulated((prev) =>
        prev.map((n) =>
          n.id === dragging.current
            ? { ...n, x: n.x + dx, y: n.y + dy, vx: 0, vy: 0 }
            : n
        )
      );
    } else if (isPanning) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
    } else {
      const node = getNodeAt(e.clientX, e.clientY);
      setHovered(node?.id ?? null);
    }
  };

  const handleMouseUp = () => {
    if (dragging.current) {
      const node = simulated.find((n) => n.id === dragging.current);
      if (node) setSelected((prev) => (prev === node.id ? null : node.id));
      dragging.current = null;
    }
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const newZoom = Math.max(0.2, Math.min(5, zoom * delta));
    const ratio = newZoom / zoom;
    setPan({
      x: mx - (mx - pan.x) * ratio,
      y: my - (my - pan.y) * ratio,
    });
    setZoom(newZoom);
  };

  const zoomIn = () => setZoom((z) => Math.min(5, z * 1.3));
  const zoomOut = () => setZoom((z) => Math.max(0.2, z / 1.3));
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
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

  const selectedConnections = selected
    ? filteredEdges
        .filter((e) => e.source === selected || e.target === selected)
        .map((e) => ({
          concept: e.source === selected ? e.target : e.source,
          weight: e.weight,
        }))
        .sort((a, b) => b.weight - a.weight)
    : [];

  return (
    <>
      <PageHeader
        title="Concept Graph"
        subtitle={`${filteredNodes.length} concepts · ${filteredEdges.length} connections`}
      />

      {/* Controls bar */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        {/* Zoom controls */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1">
          <button onClick={zoomOut} className="p-1 text-muted hover:text-foreground" title="Zoom out">
            −
          </button>
          <span className="min-w-[3rem] text-center text-xs text-muted">
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={zoomIn} className="p-1 text-muted hover:text-foreground" title="Zoom in">
            +
          </button>
          <button onClick={resetView} className="p-1 text-xs text-muted hover:text-foreground" title="Reset view">
            ⟳
          </button>
        </div>

        {/* Language filter */}
        <select
          value={langFilter}
          onChange={(e) => setLangFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-muted"
        >
          <option value="all">All languages</option>
          {availableLanguages.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>

        {/* Min count filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Min:</span>
          <input
            type="range"
            min={1}
            max={5}
            value={minCount}
            onChange={(e) => setMinCount(Number(e.target.value))}
            className="w-16"
          />
          <span className="text-xs text-muted">{minCount}+</span>
        </div>

        {/* Toggle labels */}
        <button
          onClick={() => setShowLabels(!showLabels)}
          className={`rounded-lg border px-2 py-1 text-xs transition-colors ${
            showLabels
              ? "border-accent/30 bg-accent/10 text-accent"
              : "border-border text-muted hover:text-foreground"
          }`}
        >
          Labels {showLabels ? "ON" : "OFF"}
        </button>
      </div>

      <div className="flex gap-4">
        {/* Graph */}
        <Card className="flex-1 overflow-hidden p-0">
          <div ref={containerRef} className="relative" style={{ minHeight: 500 }}>
            <svg
              ref={svgRef}
              width={dims.w}
              height={dims.h}
              className="bg-surface"
              style={{ cursor: isPanning ? "grabbing" : dragging.current ? "grabbing" : "grab" }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => {
                setHovered(null);
                dragging.current = null;
                setIsPanning(false);
              }}
              onWheel={handleWheel}
            >
              <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                {/* Edges */}
                {filteredEdges.map((edge, i) => {
                  const a = nodeMap.get(edge.source);
                  const b = nodeMap.get(edge.target);
                  if (!a || !b) return null;
                  const isHighlighted =
                    hovered === edge.source ||
                    hovered === edge.target ||
                    selected === edge.source ||
                    selected === edge.target;
                  const opacity = isHighlighted ? 0.7 : 0.15;
                  const width = Math.min(0.5 + edge.weight * 0.8, 4);
                  return (
                    <line
                      key={i}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={isHighlighted ? "#facc15" : "#525252"}
                      strokeWidth={isHighlighted ? width + 1 : width}
                      strokeOpacity={opacity}
                    />
                  );
                })}

                {/* Nodes */}
                {filteredNodes.map((node) => {
                  const r = getNodeRadius(node.count);
                  const isHovered = hovered === node.id;
                  const isSelected_ = selected === node.id;
                  const isConnected =
                    (hovered !== null || selected !== null) &&
                    filteredEdges.some(
                      (e) =>
                        (e.source === (hovered || selected) && e.target === node.id) ||
                        (e.target === (hovered || selected) && e.source === node.id)
                    );
                  const isActive = isHovered || isSelected_ || isConnected;
                  const color = getLangColor(node.language);
                  const conns = connectionMap.get(node.id) ?? 0;

                  return (
                    <g key={node.id}>
                      {/* Glow for active nodes */}
                      {isActive && (
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={r + 6}
                          fill="none"
                          stroke={isSelected_ ? "#facc15" : color}
                          strokeWidth={1.5}
                          strokeOpacity={0.3}
                        />
                      )}
                      {/* Outer ring for connected */}
                      {conns > 0 && !isActive && (
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={r + 2}
                          fill="none"
                          stroke={color}
                          strokeWidth={1}
                          strokeOpacity={0.3}
                        />
                      )}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={r}
                        fill={isSelected_ ? "#facc15" : isActive ? color : `${color}99`}
                        stroke={isSelected_ ? "#facc15" : isActive ? color : `${color}66`}
                        strokeWidth={isSelected_ || isHovered ? 2.5 : 1.5}
                        className="transition-all duration-150"
                      />
                      {/* Count badge */}
                      {node.count > 1 && (
                        <text
                          x={node.x + r * 0.7}
                          y={node.y - r * 0.7}
                          textAnchor="middle"
                          fill="#000"
                          fontSize={8}
                          fontWeight="bold"
                          className="pointer-events-none"
                        >
                          {node.count}
                        </text>
                      )}
                      {/* Label */}
                      {(showLabels || isActive) && (
                        <text
                          x={node.x}
                          y={node.y + r + 12}
                          textAnchor="middle"
                          fill={isActive ? "#f5f5f5" : "#a3a3a3"}
                          fontSize={isActive ? 11 : 9}
                          fontWeight={isActive ? 600 : 400}
                          className="pointer-events-none select-none"
                        >
                          {node.label.length > 18
                            ? node.label.slice(0, 16) + "…"
                            : node.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        </Card>

        {/* Side panel */}
        <div className="w-64 shrink-0 space-y-4">
          {/* Selected concept details */}
          {selected && (
            <Card>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Selected
              </div>
              <div className="mb-1 font-semibold">{selected}</div>
              <div className="mb-3 text-xs text-muted">
                {graphData.nodes.find((n) => n.id === selected)?.count ?? 0} learnings
                {graphData.nodes.find((n) => n.id === selected)?.language && (
                  <span
                    className="ml-2 inline-block h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: getLangColor(
                        graphData.nodes.find((n) => n.id === selected)?.language
                      ),
                    }}
                  />
                )}
              </div>
              {selectedConnections.length > 0 && (
                <>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                    Connected to
                  </div>
                  <div className="space-y-1">
                    {selectedConnections.map((c) => (
                      <button
                        key={c.concept}
                        onClick={() => setSelected(c.concept)}
                        className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-surface-2"
                      >
                        <span className="truncate">{c.concept}</span>
                        <span className="ml-2 shrink-0 text-muted">×{c.weight}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <a
                href={`/search?q=${encodeURIComponent(selected)}`}
                className="mt-3 block rounded-lg bg-accent px-3 py-1.5 text-center text-xs font-medium text-black"
              >
                Search learnings
              </a>
            </Card>
          )}

          {/* Top connected */}
          {graphData.stats.mostConnected.length > 0 && (
            <Card>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Most connected
              </div>
              <div className="space-y-1">
                {graphData.stats.mostConnected.map((c) => (
                  <button
                    key={c.concept}
                    onClick={() => setSelected(c.concept)}
                    className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-surface-2"
                  >
                    <span className="truncate">{c.concept}</span>
                    <span className="ml-2 shrink-0 text-muted">{c.connections}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* Language legend */}
          <Card>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Languages
            </div>
            <div className="space-y-1">
              {graphData.stats.topLanguages.map((l) => (
                <div key={l.language} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: getLangColor(l.language) }}
                  />
                  <span className="flex-1">{l.language}</span>
                  <span className="text-muted">{l.count}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Stats */}
          <Card>
            <div className="space-y-2 text-xs text-muted">
              <div className="flex justify-between">
                <span>Total concepts</span>
                <span className="font-medium text-foreground">{graphData.stats.totalConcepts}</span>
              </div>
              <div className="flex justify-between">
                <span>Connections</span>
                <span className="font-medium text-foreground">{graphData.stats.totalConnections}</span>
              </div>
              <div className="flex justify-between">
                <span>Visible</span>
                <span className="font-medium text-foreground">{filteredNodes.length}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
