'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { authFetch, getToken } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';
import { useTheme } from '@/components/ThemeProvider';

// react-force-graph-2d ships a canvas+d3-force implementation. SSR off — it
// touches `window` on import. Dynamic import keeps the bundle off the server.
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

// ── Backend types — mirror cloud/src/intelligence/MindMap.ts ────────────────
interface MindMapNode {
  id: string;
  name: string;
  weight: number;
  cluster: number;
  lastSeen: number;
  platforms: string[];
}
interface MindMapEdge {
  source: string;
  target: string;
  weight: number;
}
interface MindMapCluster {
  id: number;
  members: string[];
  topicName: string;
  size: number;
}
interface MindMapResponse {
  windowMs: number;
  generatedAt: number;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  clusters: MindMapCluster[];
}

// ── Cluster palette — stable, accessible-ish on dark bg. ───────────────────
const CLUSTER_PALETTE = [
  '#5eead4', // brand teal
  '#a78bfa', // violet
  '#fbbf24', // amber
  '#34d399', // emerald
  '#60a5fa', // blue
  '#fb7185', // rose
  '#f59e0b', // orange
  '#22d3ee', // cyan
  '#c084fc', // purple
  '#facc15', // yellow
  '#4ade80', // green
  '#fb923c', // tangerine
];
function colorForCluster(id: number): string {
  return CLUSTER_PALETTE[id % CLUSTER_PALETTE.length] ?? '#94a3b8';
}

const WINDOW_OPTIONS = [
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
  { label: '1y', value: '1y' },
];

// ── Tiny size for SSR (canvas needs real dims; we measure post-mount). ─────
const FALLBACK_SIZE = { w: 800, h: 560 };

interface ForceLink {
  source: string;
  target: string;
  weight: number;
}
interface ForceNode {
  id: string;
  name: string;
  cluster: number;
  weight: number;
  lastSeen: number;
  platforms: string[];
  // react-force-graph injects x/y/vx/vy at runtime — typed loosely so we don't fight the lib.
  x?: number;
  y?: number;
}

export default function MindPage() {
  const [data, setData] = useState<MindMapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [windowSel, setWindowSel] = useState('90d');
  const [focused, setFocused] = useState<string | null>(null);
  const [size, setSize] = useState(FALLBACK_SIZE);
  // Canvas labels + link tint are theme-dependent — pick at render-time
  // so a theme switch repaints with correct contrast.
  const { theme } = useTheme();
  const labelColor = theme === 'dark' ? 'rgba(255,255,255,0.78)' : 'rgba(10,10,10,0.78)';
  const labelFocusedColor = theme === 'dark' ? '#ffffff' : '#0a0a0a';
  const linkColor = theme === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(10,10,10,0.10)';

  const containerRef = useRef<HTMLDivElement | null>(null);
  // The force-graph ref — typed `any` because the lib's types don't export the imperative shape cleanly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);

  // ── Auth gate + initial load
  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login?next=/mind';
      return;
    }
    fetchMindMap(windowSel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Refetch on window change
  useEffect(() => {
    if (!getToken()) return;
    fetchMindMap(windowSel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowSel]);

  const fetchMindMap = useCallback(async (win: string) => {
    try {
      setError(null);
      const res = await authFetch(`/intelligence/mindmap?window=${win}`);
      if (res.status === 404 || res.status === 501) {
        setError('Mind Map is not enabled on this account.');
        setData(null);
        return;
      }
      if (!res.ok) throw new Error(`mindmap fetch failed: ${res.status}`);
      const json: MindMapResponse = await res.json();
      setData(json);
      setFocused(null);
    } catch (err: unknown) {
      console.error('mindmap error:', err);
      setError(err instanceof Error ? err.message : 'Could not load mind map.');
      setData(null);
    }
  }, []);

  // ── Resize observer for the canvas container
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () =>
      setSize({ w: Math.max(320, el.clientWidth), h: Math.max(360, el.clientHeight) });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  // ── Shape data for react-force-graph
  const graphData = useMemo(() => {
    if (!data) return { nodes: [] as ForceNode[], links: [] as ForceLink[] };
    return {
      nodes: data.nodes.map((n) => ({
        id: n.id,
        name: n.name,
        cluster: n.cluster,
        weight: n.weight,
        lastSeen: n.lastSeen,
        platforms: n.platforms,
      })),
      links: data.edges.map((e) => ({ source: e.source, target: e.target, weight: e.weight })),
    };
  }, [data]);

  const focusedNode = useMemo(
    () => (data && focused ? (data.nodes.find((n) => n.id === focused) ?? null) : null),
    [data, focused],
  );
  const focusedCluster = useMemo(
    () =>
      data && focusedNode
        ? (data.clusters.find((c) => c.id === focusedNode.cluster) ?? null)
        : null,
    [data, focusedNode],
  );

  const handleNodeClick = useCallback((node: ForceNode) => {
    setFocused(node.id);
    if (fgRef.current && typeof node.x === 'number' && typeof node.y === 'number') {
      // Soft zoom-to on click.
      fgRef.current.centerAt(node.x, node.y, 600);
      fgRef.current.zoom(2.4, 600);
    }
  }, []);

  return (
    <AppShell
      title="Mind Map"
      subtitle="Topics sized by signal count, edges by co-occurrence, clusters by semantic community."
      actions={
        <div className="hidden md:flex items-center gap-1">
          {WINDOW_OPTIONS.map((opt) => {
            const on = windowSel === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setWindowSel(opt.value)}
                className="text-[11.5px] font-semibold px-2.5 py-1.5 rounded-md transition-colors cursor-pointer"
                style={{
                  background: on ? 'var(--accent)' : 'var(--surface)',
                  color: on ? 'var(--on-accent)' : 'var(--ink-2)',
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      }
    >
      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat k="Topics" v={data ? data.nodes.length : null} />
        <Stat k="Edges" v={data ? data.edges.length : null} />
        <Stat k="Clusters" v={data ? data.clusters.length : null} />
        <Stat
          k="Generated"
          v={data ? relativeTime(new Date(data.generatedAt).toISOString()) : null}
        />
      </div>

      {error && (
        <div
          className="rounded-lg p-4 text-xs mb-6"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
          }}
        >
          {error}
        </div>
      )}

      {/* Graph + side panel */}
      <div className="grid lg:grid-cols-[1fr_300px] gap-4">
        <div
          ref={containerRef}
          className="rounded-2xl overflow-hidden relative"
          style={{
            height: '560px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          {data === null && !error && (
            <div
              className="absolute inset-0 grid place-items-center text-sm"
              style={{ color: 'var(--muted-2)' }}
            >
              Loading your graph…
            </div>
          )}
          {data && data.nodes.length === 0 && (
            <div
              className="absolute inset-0 grid place-items-center text-center px-8 text-sm leading-relaxed"
              style={{ color: 'var(--ink-2)' }}
            >
              No topics in your graph yet for this window.
              <br />
              <Link href="/paste" className="hover:underline" style={{ color: 'var(--accent)' }}>
                Capture a link →
              </Link>
            </div>
          )}
          {data && data.nodes.length > 0 && (
            <ForceGraph2D
              ref={fgRef}
              graphData={graphData}
              width={size.w}
              height={size.h}
              backgroundColor="rgba(0,0,0,0)"
              cooldownTicks={120}
              nodeLabel={(n) => `${(n as ForceNode).name} (${(n as ForceNode).weight} signals)`}
              nodeVal={(n) => Math.max(2, Math.sqrt((n as ForceNode).weight) * 1.6)}
              nodeColor={(n) => colorForCluster((n as ForceNode).cluster)}
              linkColor={() => linkColor}
              linkWidth={(l) => Math.max(0.4, Math.log1p((l as ForceLink).weight) * 0.8)}
              onNodeClick={(n) => handleNodeClick(n as ForceNode)}
              onBackgroundClick={() => setFocused(null)}
              nodeCanvasObjectMode={() => 'after'}
              nodeCanvasObject={(node, ctx, scale) => {
                const n = node as ForceNode;
                if (!n.x || !n.y) return;
                if (n.weight < 3 && scale < 1.8) return;
                const fontSize =
                  Math.max(10, Math.min(14, 8 + Math.log2(n.weight + 1) * 2)) / scale;
                ctx.font = `500 ${fontSize}px -apple-system, system-ui, sans-serif`;
                ctx.fillStyle = focused === n.id ? labelFocusedColor : labelColor;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const radius = Math.max(2, Math.sqrt(n.weight) * 1.6);
                ctx.fillText(n.name, n.x, n.y + radius + fontSize);
              }}
            />
          )}
        </div>

        {/* Side panel */}
        <aside className="flex flex-col gap-3">
          {/* Clusters card */}
          <div
            className="rounded-2xl p-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div
              className="text-[11px] uppercase tracking-widest font-semibold mb-3"
              style={{ color: 'var(--muted-2)' }}
            >
              Clusters
            </div>
            {data && data.clusters.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                No clusters yet.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              {data?.clusters.slice(0, 10).map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-3 h-3 rounded shrink-0"
                    style={{ background: colorForCluster(c.id) }}
                  />
                  <span
                    className="truncate flex-1"
                    title={c.topicName}
                    style={{ color: 'var(--ink-2)' }}
                  >
                    {c.topicName}
                  </span>
                  <span className="tabular-nums" style={{ color: 'var(--muted-2)' }}>
                    {c.size}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Focused topic detail */}
          <div
            className="rounded-2xl p-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            {focusedNode ? (
              <FocusedPanel node={focusedNode} cluster={focusedCluster} />
            ) : (
              <div className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                Click a node to inspect it — recent platforms, dormancy, cluster context, and a
                jump-to-trail link.
              </div>
            )}
          </div>

          {/* Help / spec note */}
          <div className="text-[11px] leading-relaxed px-2" style={{ color: 'var(--muted-2)' }}>
            Layout is force-directed in your browser; the cluster assignment was computed on the
            server (Louvain over your co-occurrence graph). Per{' '}
            <code style={{ color: 'var(--muted)' }}>ADR-0014 §2</code>.
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function Stat({ k, v }: { k: string; v: number | string | null }) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div
        className="text-[10px] uppercase tracking-widest font-semibold mb-1"
        style={{ color: 'var(--muted-2)' }}
      >
        {k}
      </div>
      <div
        className="text-xl font-black tracking-tight tabular-nums"
        style={{ color: 'var(--ink)' }}
      >
        {v === null ? '—' : v}
      </div>
    </div>
  );
}

function FocusedPanel({ node, cluster }: { node: MindMapNode; cluster: MindMapCluster | null }) {
  // Clock read captured once per mount — render stays idempotent, and
  // day-granularity dormancy doesn't need a live-ticking clock.
  const [now] = useState(() => Date.now());
  const dormancyDays = Math.floor((now - node.lastSeen) / 86_400_000);
  return (
    <div>
      <div className="flex items-start gap-2 mb-3">
        <span
          className="w-3 h-3 rounded mt-1 shrink-0"
          style={{ background: colorForCluster(node.cluster) }}
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold leading-snug" style={{ color: 'var(--ink)' }}>
            {node.name}
          </h3>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted-2)' }}>
            Cluster: <span style={{ color: 'var(--ink-2)' }}>{cluster?.topicName ?? '—'}</span>
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <Metric label="Signals" value={`${node.weight}`} />
        <Metric label="Platforms" value={`${node.platforms.length}`} />
        <Metric label="Last seen" value={node.lastSeen > 0 ? `${dormancyDays}d ago` : 'never'} />
        <Metric label="Cluster size" value={cluster ? `${cluster.size}` : '—'} />
      </div>
      {node.platforms.length > 0 && (
        <div className="mb-3">
          <div
            className="text-[10px] uppercase tracking-widest font-semibold mb-1.5"
            style={{ color: 'var(--muted-2)' }}
          >
            Platforms
          </div>
          <div className="flex flex-wrap gap-1.5">
            {node.platforms.map((p) => (
              <span
                key={p}
                className="text-[10px] rounded px-1.5 py-0.5"
                style={{
                  background: 'var(--surface-3)',
                  border: '1px solid var(--border)',
                  color: 'var(--ink-2)',
                }}
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      )}
      <Link
        href={`/dashboard?topic=${encodeURIComponent(node.name)}`}
        className="block text-center text-xs font-semibold py-2 rounded-md hover:opacity-90 transition-opacity"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        Open trail →
      </Link>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-md p-2"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
    >
      <div
        className="text-[9px] uppercase tracking-widest font-semibold mb-0.5"
        style={{ color: 'var(--muted-2)' }}
      >
        {label}
      </div>
      <div className="text-xs font-bold truncate" style={{ color: 'var(--ink)' }}>
        {value}
      </div>
    </div>
  );
}

function relativeTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Math.max(0, Math.round((now - t) / 1000));
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
