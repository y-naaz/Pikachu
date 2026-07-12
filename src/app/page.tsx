import Link from "next/link";
import { getDashboardStats } from "@/lib/queries";
import { Card, ConceptTag, EmptyState, PageHeader } from "@/components/ui";
import { LearningCard } from "@/components/LearningCard";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <div className="text-3xl font-semibold">{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </Card>
  );
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Your engineering memory at a glance."
        action={
          <Link
            href="/explain"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
          >
            + New Learning
          </Link>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Total learnings" value={stats.total} />
        <Stat label="Concepts tracked" value={stats.topConcepts.length} />
        <Stat label="Day streak" value={`${stats.streak} 🔥`} />
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Top concepts
        </h2>
        {stats.topConcepts.length === 0 ? (
          <p className="text-sm text-muted">No concepts yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {stats.topConcepts.map((c) => (
              <ConceptTag key={c.concept} concept={`${c.concept} · ${c.count}`} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Recent learnings
        </h2>
        {stats.recent.length === 0 ? (
          <EmptyState
            title="No learnings yet."
            hint="Capture your first concept with Explain & Save, or add one manually."
            cta={
              <Link
                href="/explain"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black"
              >
                Explain & Save
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3">
            {stats.recent.map((l) => (
              <LearningCard key={l.id} learning={l} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
