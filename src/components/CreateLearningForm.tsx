"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputClass =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent";

export function CreateLearningForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const tags = String(form.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const res = await fetch("/api/learnings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        question: form.get("question"),
        explanation: form.get("explanation"),
        tags,
        concepts: tags, // seed concepts from tags for manual entries
        sourceType: "manual",
        repository: form.get("repository") || null,
      }),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
      >
        + Add manually
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-surface p-5"
    >
      <div className="grid gap-3">
        <input name="title" required placeholder="Title" className={inputClass} />
        <input name="question" required placeholder="Question" className={inputClass} />
        <textarea
          name="explanation"
          required
          placeholder="Explanation"
          rows={5}
          className={inputClass}
        />
        <div className="grid grid-cols-2 gap-3">
          <input name="tags" placeholder="Tags (comma separated)" className={inputClass} />
          <input name="repository" placeholder="Repository (optional)" className={inputClass} />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save learning"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
