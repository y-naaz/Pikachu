"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteLearningButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    await fetch(`/api/learnings/${id}`, { method: "DELETE" });
    router.push("/learnings");
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">Delete this learning?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="rounded px-3 py-1 text-sm font-medium bg-red-500/90 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
        >
          {loading ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded px-3 py-1 text-sm text-muted hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="rounded px-3 py-1 text-sm text-muted hover:text-red-500 transition-colors"
    >
      Delete
    </button>
  );
}
