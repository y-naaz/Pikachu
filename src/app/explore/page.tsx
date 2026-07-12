import Link from "next/link";
import { getConceptGroups } from "@/lib/queries";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const groups = await getConceptGroups();

  return (
    <>
      <PageHeader
        title="Knowledge Explorer"
        subtitle="Your learnings grouped by concept."
      />

      {groups.length === 0 ? (
        <EmptyState
          title="No concepts yet."
          hint="Concepts appear here as you capture learnings."
        />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {groups.map((g) => (
            <Card key={g.concept}>
              <div className="mb-2 flex items-center justify-between">
                <Link
                  href={`/search?q=${encodeURIComponent(g.concept)}`}
                  className="font-medium text-accent hover:underline"
                >
                  {g.concept}
                </Link>
                <span className="text-xs text-muted">{g.learnings.length}</span>
              </div>
              <ul className="grid gap-1">
                {g.learnings.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/learnings/${l.id}`}
                      className="text-sm text-muted transition-colors hover:text-foreground"
                    >
                      {l.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
