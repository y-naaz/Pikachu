import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface p-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs text-muted">
      {children}
    </span>
  );
}

export function ConceptTag({ concept }: { concept: string }) {
  return (
    <Link
      href={`/search?q=${encodeURIComponent(concept)}`}
      className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-xs text-accent transition-colors hover:bg-accent/20"
    >
      {concept}
    </Link>
  );
}

export function EmptyState({
  title,
  hint,
  cta,
}: {
  title: string;
  hint?: string;
  cta?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border p-12 text-center">
      <p className="text-foreground">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      {cta && <div className="mt-4 flex justify-center">{cta}</div>}
    </div>
  );
}
