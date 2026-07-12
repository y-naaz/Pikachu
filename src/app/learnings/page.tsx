import { listLearnings } from "@/lib/queries";
import { EmptyState, PageHeader } from "@/components/ui";
import { LearningCard } from "@/components/LearningCard";
import { CreateLearningForm } from "@/components/CreateLearningForm";

export const dynamic = "force-dynamic";

export default async function LearningsPage() {
  const learnings = await listLearnings();

  return (
    <>
      <PageHeader
        title="Learnings"
        subtitle={`${learnings.length} captured`}
        action={<CreateLearningForm />}
      />

      {learnings.length === 0 ? (
        <EmptyState
          title="No learnings yet."
          hint="Add one manually, or use Explain & Save to generate one from code or docs."
        />
      ) : (
        <div className="grid gap-3">
          {learnings.map((l) => (
            <LearningCard key={l.id} learning={l} />
          ))}
        </div>
      )}
    </>
  );
}
