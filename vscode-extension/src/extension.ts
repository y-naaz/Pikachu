import * as vscode from "vscode";
import * as crypto from "crypto";
import { PikachuClient } from "./api";
import type { ExplainResult } from "./api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CachedExplanation {
  uri: string;
  range: vscode.Range;
  result: Partial<ExplainResult>;
  complete: boolean;
  savedId?: string;
  pendingSave?: {
    content: string;
    language: string;
    repository?: string;
    filePath: string;
    provider: "claude" | "opencode";
  };
}

interface StoredResult { result: ExplainResult; ts: number; }

// ── State ─────────────────────────────────────────────────────────────────────

let cachedExplanation: CachedExplanation | undefined;
let extensionContext: vscode.ExtensionContext;
let prefetchTimer: ReturnType<typeof setTimeout> | undefined;
let prefetchAbort: AbortController | undefined;

// ── Config ────────────────────────────────────────────────────────────────────

function getServerUrl() { return vscode.workspace.getConfiguration("pikachu").get<string>("serverUrl", "http://localhost:3200"); }
function getClient() { return new PikachuClient(getServerUrl()); }
function getProvider() { return vscode.workspace.getConfiguration("pikachu").get<"claude" | "opencode">("provider", "claude"); }
function getAutoSave() { return vscode.workspace.getConfiguration("pikachu").get<boolean>("autoSave", false); }

// ── GlobalState cache ─────────────────────────────────────────────────────────

const GLOBAL_CACHE_KEY = "pikachu.explainCache";

function cacheKey(content: string, language: string, provider: string) {
  return crypto.createHash("sha256")
    .update([provider, language, content.replace(/\s+/g, " ").trim()].join("\x1f"))
    .digest("hex").slice(0, 16);
}

function getCachedResult(key: string): ExplainResult | undefined {
  const store = extensionContext.globalState.get<Record<string, StoredResult>>(GLOBAL_CACHE_KEY, {});
  const e = store[key];
  if (!e || Date.now() - e.ts > 7 * 24 * 3600_000) return undefined;
  return e.result;
}

async function setCachedResult(key: string, result: ExplainResult) {
  const store = extensionContext.globalState.get<Record<string, StoredResult>>(GLOBAL_CACHE_KEY, {});
  store[key] = { result, ts: Date.now() };
  const trimmed = Object.fromEntries(Object.entries(store).sort((a, b) => b[1].ts - a[1].ts).slice(0, 100));
  await extensionContext.globalState.update(GLOBAL_CACHE_KEY, trimmed);
}

// ── Hover markdown builder ────────────────────────────────────────────────────

function buildHoverMarkdown(cached: CachedExplanation): vscode.MarkdownString {
  const r = cached.result;
  const md = new vscode.MarkdownString("", true);
  md.isTrusted = true;
  md.supportThemeIcons = true;

  md.appendMarkdown(`### ⚡ ${r.title ?? "Pikachu"}\n\n`);
  if (r.summary) md.appendMarkdown(`*${r.summary}*\n\n`);
  if (r.what)    md.appendMarkdown(`**What** — ${r.what}\n\n`);
  if (r.why)     md.appendMarkdown(`**Why** — ${r.why}\n\n`);
  if (r.how)     md.appendMarkdown(`**How** — ${r.how}\n\n`);
  if (r.concepts?.length)        md.appendMarkdown(`**Concepts:** ${r.concepts.map(c => `\`${c}\``).join(" · ")}\n\n`);
  if (r.relatedConcepts?.length) md.appendMarkdown(`**Related:** ${r.relatedConcepts.map(c => `\`${c}\``).join(" · ")}\n\n`);

  md.appendMarkdown(`---\n\n`);
  if (cached.complete) {
    if (cached.savedId) {
      md.appendMarkdown(`$(check) *Saved* · `);
    } else {
      md.appendMarkdown(`[$(database) Save](command:pikachu.saveLastExplanation) · `);
    }
    md.appendMarkdown(`[$(copy) Copy](command:pikachu.copyLastSummary) · [$(link-external) Dashboard](command:pikachu.openDashboard)`);
  } else {
    md.appendMarkdown(`$(loading~spin) *generating…*`);
  }
  return md;
}

// ── Show hover helper ─────────────────────────────────────────────────────────

/** Bring the correct editor into focus, position cursor, show hover. */
async function showHoverForResult(
  document: vscode.TextDocument,
  range: vscode.Range,
  viewColumn?: vscode.ViewColumn
) {
  const editor = await vscode.window.showTextDocument(document, {
    viewColumn,
    preserveFocus: false,
    preview: false,
  });
  editor.selection = new vscode.Selection(range.start, range.start);
  // Small delay so VS Code finishes the layout before opening hover
  await new Promise(r => setTimeout(r, 80));
  await vscode.commands.executeCommand("editor.action.showHover");
}

// ── Content resolver ──────────────────────────────────────────────────────────

function resolveContent(editor: vscode.TextEditor) {
  const doc = editor.document;
  const sel = editor.selection;
  const range = sel.isEmpty
    ? new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length))
    : new vscode.Range(sel.start, sel.end);
  return { content: doc.getText(range), range, language: doc.languageId, filePath: doc.fileName, repository: vscode.workspace.workspaceFolders?.[0]?.name };
}

// ── SSE streaming ─────────────────────────────────────────────────────────────

async function* fetchExplainStream(serverUrl: string, payload: object, signal?: AbortSignal): AsyncGenerator<Partial<ExplainResult> & { done?: boolean; error?: string }> {
  const res = await fetch(`${serverUrl.replace(/\/$/, "")}/api/explain`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, stream: true }), signal,
  });
  if (!res.ok || !res.body) {
    const d = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(d.error ?? `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n"); buf = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        try { yield JSON.parse(line.slice(5).trim()); } catch { /* skip */ }
      }
    }
  } finally { reader.releaseLock(); }
}

// ── Core explain ──────────────────────────────────────────────────────────────

async function explainContent(editor: vscode.TextEditor): Promise<void> {
  const { content, range, language, filePath, repository } = resolveContent(editor);
  if (!content.trim()) { vscode.window.showWarningMessage("Pikachu: Nothing to explain."); return; }

  const provider = getProvider();
  const client = getClient();
  const key = cacheKey(content, language, provider);
  const doc = editor.document;
  const viewColumn = editor.viewColumn;

  // ── Instant cache hit ─────────────────────────────────────────────────────
  const localHit = getCachedResult(key);
  if (localHit) {
    cachedExplanation = { uri: doc.uri.toString(), range, result: localHit, complete: true,
      pendingSave: { content, language, repository, filePath, provider } };
    await showHoverForResult(doc, range, viewColumn);
    return;
  }

  // ── Show hover immediately with loading state ─────────────────────────────
  cachedExplanation = { uri: doc.uri.toString(), range, result: {}, complete: false,
    pendingSave: { content, language, repository, filePath, provider } };
  await showHoverForResult(doc, range, viewColumn);

  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
  statusItem.text = "$(loading~spin) Pikachu: generating…";
  statusItem.show();

  try {
    let result: Partial<ExplainResult> = {};

    // SSE streaming (fast with ANTHROPIC_API_KEY)
    if (provider === "claude") {
      for await (const chunk of fetchExplainStream(getServerUrl(), { content, language, repository, filePath, provider })) {
        if (chunk.error) throw new Error(chunk.error);
        if (chunk.done) break;
        const { done: _d, error: _e, ...fields } = chunk;
        if (Object.keys(fields).length) {
          Object.assign(result, fields);
          Object.assign(cachedExplanation!.result, fields);
          statusItem.text = `$(loading~spin) Pikachu: ${result.title ?? "generating…"}`;
        }
      }
    }

    // Fallback if streaming returned no content
    if (!result.what) {
      const { result: full } = await client.explain({ content, language, repository, filePath, provider, save: false });
      result = full;
      Object.assign(cachedExplanation!.result, full);
    }

    cachedExplanation!.complete = true;
    statusItem.dispose();

    if ((result as ExplainResult).title && (result as ExplainResult).what) {
      void setCachedResult(key, result as ExplainResult);
    }

    if (getAutoSave() && cachedExplanation?.pendingSave) {
      const learning = await client.save(cachedExplanation.pendingSave);
      cachedExplanation.savedId = learning.id;
      cachedExplanation.pendingSave = undefined;
    }

    // Re-focus the original editor and show the hover with full content
    await showHoverForResult(doc, range, viewColumn);

  } catch (err) {
    statusItem.dispose();
    cachedExplanation = undefined;
    vscode.window.showErrorMessage(`⚡ Pikachu: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Prefetch ──────────────────────────────────────────────────────────────────

async function maybePrefetch(editor: vscode.TextEditor) {
  const { content, language } = resolveContent(editor);
  const lines = content.split("\n").filter(l => l.trim()).length;
  if (lines < 3 || lines > 60) return;
  const provider = getProvider();
  const key = cacheKey(content, language, provider);
  if (getCachedResult(key)) return;
  prefetchAbort?.abort();
  prefetchAbort = new AbortController();
  try {
    const result: Partial<ExplainResult> = {};
    for await (const chunk of fetchExplainStream(getServerUrl(), { content, language, provider }, prefetchAbort.signal)) {
      if (prefetchAbort.signal.aborted) return;
      if (chunk.done) break; if (chunk.error) return;
      const { done: _d, error: _e, ...fields } = chunk;
      Object.assign(result, fields);
    }
    const full = result as ExplainResult;
    if (full.title && full.what) void setCachedResult(key, full);
  } catch { /* silent */ }
}

// ── Activation ────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  extensionContext = context;

  // Hover provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider("*", {
      provideHover(document, position) {
        if (!cachedExplanation) return;
        if (cachedExplanation.uri !== document.uri.toString()) return;
        if (!cachedExplanation.range.contains(position)) return;
        return new vscode.Hover(buildHoverMarkdown(cachedExplanation), cachedExplanation.range);
      },
    })
  );

  // Debounced prefetch
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(e => {
      clearTimeout(prefetchTimer);
      if (e.selections[0].isEmpty) return;
      prefetchTimer = setTimeout(() => maybePrefetch(e.textEditor), 600);
    })
  );

  context.subscriptions.push(vscode.commands.registerCommand("pikachu.explainSelection", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { vscode.window.showWarningMessage("Pikachu: Open a file first."); return; }
    prefetchAbort?.abort();
    await explainContent(editor);
  }));

  context.subscriptions.push(vscode.commands.registerCommand("pikachu.explainFile", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { vscode.window.showWarningMessage("Pikachu: Open a file first."); return; }
    editor.selection = new vscode.Selection(editor.document.positionAt(0), editor.document.positionAt(0));
    await explainContent(editor);
  }));

  context.subscriptions.push(vscode.commands.registerCommand("pikachu.saveLastExplanation", async () => {
    if (!cachedExplanation?.pendingSave) { vscode.window.showInformationMessage("Pikachu: Nothing to save yet."); return; }
    try {
      const learning = await getClient().save(cachedExplanation.pendingSave);
      cachedExplanation.savedId = learning.id;
      cachedExplanation.pendingSave = undefined;
      vscode.window.showInformationMessage(`⚡ Pikachu: "${cachedExplanation.result.title}" saved!`);
      // Refresh hover to show saved state
      if (cachedExplanation) {
        const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === cachedExplanation!.uri);
        if (doc) await showHoverForResult(doc, cachedExplanation.range);
      }
    } catch (err) { vscode.window.showErrorMessage(`Pikachu: ${(err as Error).message}`); }
  }));

  context.subscriptions.push(vscode.commands.registerCommand("pikachu.copyLastSummary", async () => {
    if (!cachedExplanation?.result.summary) return;
    await vscode.env.clipboard.writeText(cachedExplanation.result.summary);
    vscode.window.showInformationMessage("Pikachu: Summary copied.");
  }));

  context.subscriptions.push(vscode.commands.registerCommand("pikachu.openDashboard", () => {
    vscode.env.openExternal(vscode.Uri.parse(getServerUrl()));
  }));

  context.subscriptions.push(vscode.commands.registerCommand("pikachu.search", async () => {
    const query = await vscode.window.showInputBox({ prompt: "Search Pikachu learnings", placeHolder: "e.g. react hooks" });
    if (!query) return;
    try {
      const learnings = await getClient().search(query);
      if (!learnings.length) { vscode.window.showInformationMessage(`Pikachu: No results for "${query}".`); return; }
      const pick = await vscode.window.showQuickPick(
        learnings.map(l => ({ label: l.title, description: l.summary, detail: l.concepts.join(", "), id: l.id })),
        { placeHolder: `${learnings.length} result(s)` }
      );
      if (pick) vscode.env.openExternal(vscode.Uri.parse(`${getServerUrl()}/learnings/${pick.id}`));
    } catch (err) { vscode.window.showErrorMessage(`Pikachu: ${(err as Error).message}`); }
  }));

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = "$(zap) Pikachu";
  statusBar.tooltip = "Pikachu — click to explain selection";
  statusBar.command = "pikachu.explainSelection";
  statusBar.show();
  context.subscriptions.push(statusBar);

  getClient().ping().then(ok => {
    statusBar.text = ok ? "$(zap) Pikachu" : "$(zap) Pikachu (offline)";
  }).catch(() => { statusBar.text = "$(zap) Pikachu (offline)"; });
}

export function deactivate() { prefetchAbort?.abort(); cachedExplanation = undefined; }
