import Link from "next/link";
import { notFound } from "next/navigation";
import { getLearning } from "@/lib/queries";
import { Badge, Card, ConceptTag } from "@/components/ui";
import { Explanation } from "@/components/Explanation";
import { CodeBlock } from "@/components/CodeBlock";
import { DeleteLearningButton } from "@/components/DeleteLearningButton";

export const dynamic = "force-dynamic";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function LearningDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const learning = await getLearning(id);
  if (!learning) notFound();

  return (
    <>
      <Link href="/learnings" className="text-sm text-muted hover:text-foreground">
        ← Back to learnings
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">{learning.title}</h1>
        <div className="flex shrink-0 items-center gap-2">
          <Badge>{learning.sourceType}</Badge>
          <span className="text-xs text-muted">
            {new Date(learning.createdAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
          <DeleteLearningButton id={learning.id} />
        </div>
      </div>

      {learning.codeSnippet && (
        <Section title="Code">
          <CodeBlock code={learning.codeSnippet} />
        </Section>
      )}

      {learning.explanation && (
        <Section title="Explanation">
          <Explanation markdown={learning.explanation} />
        </Section>
      )}

      {learning.relatedConcepts.length > 0 && (
        <Section title="Related concepts">
          <div className="flex flex-wrap gap-2">
            {learning.relatedConcepts.map((c) => (
              <ConceptTag key={c} concept={c} />
            ))}
          </div>
        </Section>
      )}

      {learning.concepts.length > 0 && (
        <Section title="Concepts">
          <div className="flex flex-wrap gap-2">
            {learning.concepts.map((c) => (
              <ConceptTag key={c} concept={c} />
            ))}
          </div>
        </Section>
      )}

      {(learning.repository || learning.filePath || learning.language) && (
        <Section title="Repository context">
          <Card>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              {learning.repository && (
                <Row label="Repository" value={learning.repository} />
              )}
              {learning.branch && <Row label="Branch" value={learning.branch} />}
              {learning.filePath && <Row label="File" value={learning.filePath} />}
              {learning.language && <Row label="Language" value={learning.language} />}
            </dl>
          </Card>
        </Section>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </>
  );
}
