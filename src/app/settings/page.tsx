import { PageHeader, Card } from "@/components/ui";
import { isClaudeCliAvailable } from "@/lib/claude";
import { isOpenCodeCliAvailable } from "@/lib/opencode";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [hasClaude, hasOpenCode] = await Promise.all([
    isClaudeCliAvailable(),
    isOpenCodeCliAvailable(),
  ]);

  return (
    <>
      <PageHeader title="Settings" subtitle="Configuration for Pikachu." />

      <Card>
        <h2 className="font-medium">Claude Code</h2>
        <p className="mt-1 text-sm text-muted">
          Explain &amp; Save can use the local{" "}
          <code className="font-mono text-accent">claude</code> CLI in headless
          mode — it reuses your existing Claude Code login, so no API key is needed.
        </p>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              hasClaude ? "bg-green-400" : "bg-red-400"
            }`}
          />
          {hasClaude
            ? "Claude Code CLI detected"
            : "Claude Code CLI not found on PATH"}
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="font-medium">OpenCode</h2>
        <p className="mt-1 text-sm text-muted">
          Explain &amp; Save can also use the local{" "}
          <code className="font-mono text-accent">opencode</code> CLI in
          headless mode (<code className="font-mono text-accent">opencode run --format json</code>
          ). It reuses whatever AI providers you have configured in opencode —
          no additional setup required if opencode is already working.
        </p>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              hasOpenCode ? "bg-green-400" : "bg-red-400"
            }`}
          />
          {hasOpenCode
            ? "opencode CLI detected"
            : "opencode CLI not found on PATH — install with: npm i -g opencode-ai"}
        </div>
        {hasOpenCode && (
          <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted space-y-1">
            <p>
              <span className="font-mono text-accent">OPENCODE_CLI_MODEL</span>
              {" "}— model in{" "}
              <span className="font-mono">provider/model</span> format.
              Default:{" "}
              <span className="font-mono">opencode/deepseek-v4-flash-free</span>
            </p>
            <p>
              Examples:{" "}
              <span className="font-mono">anthropic/claude-sonnet-4-5</span>
              {" · "}
              <span className="font-mono">openai/gpt-4o</span>
            </p>
            <p>
              <span className="font-mono text-accent">OPENCODE_CLI_BIN</span>
              {" "}— path to the opencode binary if not on PATH.
            </p>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="font-medium">Database</h2>
        <p className="mt-1 text-sm text-muted">
          Local SQLite via Prisma. Search is powered by SQLite FTS5.
        </p>
        <p className="mt-2 text-sm text-muted">
          Run <code className="font-mono text-accent">npm run db:studio</code> to
          browse your data.
        </p>
      </Card>

      <Card className="mt-4">
        <h2 className="font-medium">Roadmap</h2>
        <ul className="mt-2 grid gap-1 text-sm text-muted">
          <li>Phase 2 — VS Code extension (explain / save selection)</li>
          <li>Phase 3 — Claude conversation import</li>
          <li>Phase 4 — Repository analysis</li>
          <li>Phase 5 — Spaced-repetition memory retention</li>
        </ul>
      </Card>
    </>
  );
}

