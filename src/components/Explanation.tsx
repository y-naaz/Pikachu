import type { ReactNode } from "react";

// Explanations are stored as composed markdown:
//   ## What is it?\n...\n\n## Why does it exist?\n...\n\n## How does it work?\n...
// We parse that into sections and render each with clear visual hierarchy,
// instead of dumping the raw "## ..." text. Falls back gracefully for entries
// that don't use the heading format.

interface Sec {
  heading: string;
  body: string;
}

const META: Record<string, { label: string; icon: string; accent: string }> = {
  "what is it?": { label: "What is it?", icon: "💡", accent: "var(--accent)" },
  "why does it exist?": {
    label: "Why does it exist?",
    icon: "🤔",
    accent: "var(--accent-2)",
  },
  "how does it work?": { label: "How does it work?", icon: "⚙️", accent: "#7ee787" },
};

function parseSections(md: string): Sec[] {
  const lines = md.split("\n");
  const secs: Sec[] = [];
  let cur: Sec | null = null;
  for (const line of lines) {
    const m = line.match(/^#{1,6}\s+(.*)$/);
    if (m) {
      if (cur) secs.push(cur);
      cur = { heading: m[1].trim(), body: "" };
    } else if (cur) {
      cur.body += (cur.body ? "\n" : "") + line;
    }
  }
  if (cur) secs.push(cur);
  return secs.map((s) => ({ ...s, body: s.body.trim() }));
}

/** Render inline `code` spans inside a line of text. */
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] text-accent"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/** Split a section body into paragraphs (blank-line separated). */
function paragraphs(body: string): ReactNode {
  return body.split(/\n{2,}/).map((para, i) => (
    <p key={i} className="text-[15px] leading-7 text-foreground/90">
      {para.split("\n").map((ln, j) => (
        <span key={j}>
          {j > 0 && <br />}
          {inline(ln)}
        </span>
      ))}
    </p>
  ));
}

export function Explanation({ markdown }: { markdown: string }) {
  const sections = parseSections(markdown);

  // Fallback: no headings found — render as a single readable block.
  if (sections.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="space-y-3">{paragraphs(markdown)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((s, i) => {
        const meta = META[s.heading.toLowerCase()];
        const accent = meta?.accent ?? "var(--border)";
        return (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-border bg-surface"
            style={{ borderLeft: `3px solid ${accent}` }}
          >
            <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-5 py-3">
              <span className="text-base">{meta?.icon ?? "▸"}</span>
              <h3 className="text-sm font-semibold tracking-wide">
                {meta?.label ?? s.heading}
              </h3>
            </div>
            <div className="space-y-3 px-5 py-4">{paragraphs(s.body)}</div>
          </div>
        );
      })}
    </div>
  );
}
