import Link from "next/link";
import type { Learning } from "@/lib/types";
import { ConceptTag } from "./ui";

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function LearningCard({ learning }: { learning: Learning }) {
  return (
    <Link
      href={`/learnings/${learning.id}`}
      className="block rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent/40"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium">{learning.title}</h3>
        <span className="shrink-0 text-xs text-muted">
          {formatDate(learning.createdAt)}
        </span>
      </div>
      {learning.summary && (
        <p className="mt-1.5 line-clamp-2 text-sm text-muted">{learning.summary}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {learning.repository && (
          <span className="text-xs text-accent-2">⌥ {learning.repository}</span>
        )}
        {learning.concepts.slice(0, 4).map((c) => (
          <ConceptTag key={c} concept={c} />
        ))}
      </div>
    </Link>
  );
}
