"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ExplainResult } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent";

type Provider = "claude" | "opencode";

const PROVIDERS: { value: Provider; label: string; description: string }[] = [
  {
    value: "claude",
    label: "Claude Code",
    description: "Local Claude Code CLI",
  },
  {
    value: "opencode",
    label: "OpenCode",
    description: "Local opencode CLI",
  },
];

export default function ExplainPage() {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>("claude");
  const [content, setContent] = useState("");
  const [question, setQuestion] = useState("");
  const [language, setLanguage] = useState("");
  const [repository, setRepository] = useState("");
  const [result, setResult] = useState<ExplainResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!content.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, question, language, provider, save: false }),
    });
    setLoading(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to generate");
      return;
    }
    setResult(data.result);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        question,
        language,
        repository: repository || null,
        provider,
        save: true,
      }),
    });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to save");
      return;
    }
    router.push(`/learnings/${data.learning.id}`);
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Explain &amp; Save</h1>
      <p className="mt-1 text-sm text-muted">
        Paste code, a question, or a doc snippet. Your chosen AI generates a
        structured learning you can save.
      </p>

      {/* Provider toggle */}
      <div className="mt-5 flex gap-2">
        {PROVIDERS.map((p) => (
          <button
            key={p.value}
            onClick={() => { setProvider(p.value); setResult(null); setError(null); }}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              provider === p.value
                ? "border-accent bg-accent/10 text-accent font-medium"
                : "border-border bg-surface-2 text-muted hover:border-accent/50"
            }`}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                provider === p.value ? "bg-accent" : "bg-muted"
              }`}
            />
            <span>{p.label}</span>
            <span className="text-xs opacity-60">{p.description}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste code / documentation / a concept here…"
          rows={8}
          className={`${inputClass} font-mono`}
        />
        <div className="grid grid-cols-3 gap-3">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Question (optional)"
            className={inputClass}
          />
          <input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="Language (optional)"
            className={inputClass}
          />
          <input
            value={repository}
            onChange={(e) => setRepository(e.target.value)}
            placeholder="Repository (optional)"
            className={inputClass}
          />
        </div>
        <div>
          <button
            onClick={generate}
            disabled={loading || !content.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {loading
              ? `Generating via ${provider === "opencode" ? "OpenCode" : "Claude"}…`
              : "Generate explanation"}
          </button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {result && (
        <div className="mt-8 rounded-xl border border-border bg-surface p-6">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-xl font-semibold">{result.title}</h2>
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
              via {provider === "opencode" ? "OpenCode" : "Claude Code"}
            </span>
          </div>
          <Field label="What is it?" value={result.what} />
          <Field label="Why does it exist?" value={result.why} />
          <Field label="How does it work?" value={result.how} />
          <Field label="Summary" value={result.summary} />

          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-muted">Concepts</div>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {result.concepts.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-xs text-accent"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save learning"}
          </button>
        </div>
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <p className="prose-plain mt-1 text-sm">{value}</p>
    </div>
  );
}

