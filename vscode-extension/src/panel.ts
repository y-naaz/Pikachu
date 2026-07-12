import * as vscode from "vscode";
import { PikachuClient } from "./api";
import type { ExplainResult } from "./api";

interface PanelInput {
  content: string;
  question?: string;
  language: string;
  filePath: string;
  repository?: string;
  provider: "claude" | "opencode";
  isSelection: boolean;
}

type WebviewMessage =
  | { type: "save" }
  | { type: "openDashboard" }
  | { type: "copy"; text: string };

export class ResultPanel {
  private static instance: ResultPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private input: PanelInput;
  private context: vscode.ExtensionContext;
  private lastResult: Partial<ExplainResult> | undefined;

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    input: PanelInput
  ) {
    this.panel = panel;
    this.context = context;
    this.input = input;

    this.panel.onDidDispose(() => { ResultPanel.instance = undefined; });

    this.panel.webview.onDidReceiveMessage(
      async (msg: WebviewMessage) => {
        const cfg = vscode.workspace.getConfiguration("pikachu");
        const serverUrl = cfg.get<string>("serverUrl", "http://localhost:3200");
        const client = new PikachuClient(serverUrl);

        if (msg.type === "save" && this.lastResult?.title) {
          try {
            const learning = await client.save({
              content: this.input.content,
              language: this.input.language,
              repository: this.input.repository,
              filePath: this.input.filePath,
              provider: this.input.provider,
            });
            this.markSaved(learning.id);
            vscode.window.showInformationMessage(`⚡ Pikachu: "${this.lastResult.title}" saved!`);
          } catch (err) {
            vscode.window.showErrorMessage(`Pikachu: ${(err as Error).message}`);
          }
        }
        if (msg.type === "openDashboard") {
          await vscode.commands.executeCommand("pikachu.openDashboard");
        }
        if (msg.type === "copy") {
          await vscode.env.clipboard.writeText(msg.text);
          vscode.window.showInformationMessage("Pikachu: Copied to clipboard.");
        }
      },
      undefined,
      context.subscriptions
    );

    this.panel.webview.html = this.loadingHtml();
  }

  static createOrShow(context: vscode.ExtensionContext, input: PanelInput): ResultPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    if (ResultPanel.instance) {
      ResultPanel.instance.panel.reveal(column);
      ResultPanel.instance.input = input;
      ResultPanel.instance.lastResult = undefined;
      ResultPanel.instance.panel.webview.html = ResultPanel.instance.loadingHtml();
      return ResultPanel.instance;
    }

    const panel = vscode.window.createWebviewPanel("pikachuResult", "⚡ Pikachu", column, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });

    ResultPanel.instance = new ResultPanel(panel, context, input);
    return ResultPanel.instance;
  }

  showResult(result: Partial<ExplainResult>): void {
    this.lastResult = result;
    this.panel.webview.html = this.resultHtml(result);
  }

  markSaved(learningId: string): void {
    this.panel.webview.postMessage({ type: "saved", id: learningId });
  }

  showError(message: string): void {
    this.panel.webview.html = this.errorHtml(message);
  }

  private escape(str: string): string {
    return str
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  private baseHtml(body: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pikachu</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 24px 28px 48px;
      line-height: 1.6;
    }
    .header { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
    .header h1 { font-size: 1.1rem; font-weight: 600; }
    .badge {
      font-size: 0.7rem; padding: 2px 8px; border-radius: 999px;
      background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
    }
    .title { font-size: 1.3rem; font-weight: 700; margin-bottom: 20px; color: var(--vscode-textLink-foreground); }
    .field { margin-bottom: 18px; }
    .field-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
    .field-value { font-size: 0.9rem; white-space: pre-wrap; }
    .field-value.placeholder { color: var(--vscode-descriptionForeground); font-style: italic; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .chip { font-size: 0.7rem; padding: 2px 10px; border-radius: 999px; background: color-mix(in srgb, var(--vscode-textLink-foreground) 15%, transparent); color: var(--vscode-textLink-foreground); border: 1px solid color-mix(in srgb, var(--vscode-textLink-foreground) 30%, transparent); }
    .divider { border: none; border-top: 1px solid var(--vscode-editorGroup-border); margin: 20px 0; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 24px; }
    button { font-family: var(--vscode-font-family); font-size: 0.85rem; padding: 6px 14px; border-radius: 4px; border: none; cursor: pointer; transition: opacity 0.15s; }
    button:hover { opacity: 0.85; }
    button:disabled { opacity: 0.5; cursor: default; }
    .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .saved-banner { display: none; padding: 8px 14px; background: color-mix(in srgb, var(--vscode-testing-iconPassed) 20%, transparent); border: 1px solid var(--vscode-testing-iconPassed); border-radius: 6px; font-size: 0.85rem; color: var(--vscode-testing-iconPassed); margin-top: 16px; }
    .error-box { padding: 16px; border: 1px solid var(--vscode-inputValidation-errorBorder); background: var(--vscode-inputValidation-errorBackground); border-radius: 6px; font-size: 0.9rem; }
    .loading { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 200px; gap: 16px; color: var(--vscode-descriptionForeground); }
    .spinner { width: 32px; height: 32px; border: 3px solid var(--vscode-editorGroup-border); border-top-color: var(--vscode-textLink-foreground); border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
${body}
<script>
  const vscode = acquireVsCodeApi();
  function send(msg) { vscode.postMessage(msg); }
  window.addEventListener('message', e => {
    if (e.data.type === 'saved') {
      const banner = document.getElementById('saved-banner');
      if (banner) banner.style.display = 'block';
      const btn = document.getElementById('save-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Saved ✓'; }
    }
  });
</script>
</body>
</html>`;
  }

  loadingHtml(): string {
    const provider = this.input.provider === "opencode" ? "OpenCode" : "Claude";
    return this.baseHtml(`
      <div class="header">
        <h1>⚡ Pikachu</h1>
        <span class="badge">via ${provider}</span>
      </div>
      <div class="loading">
        <div class="spinner"></div>
        <p>Generating explanation…</p>
      </div>
    `);
  }

  private resultHtml(result: Partial<ExplainResult>): string {
    const provider = this.input.provider === "opencode" ? "OpenCode" : "Claude";
    const ph = (text: string | undefined, label: string) =>
      text
        ? `<div class="field-value">${this.escape(text)}</div>`
        : `<div class="field-value placeholder">${label}</div>`;
    const chips = (arr: string[] | undefined) =>
      arr?.length ? arr.map((c) => `<span class="chip">${this.escape(c)}</span>`).join("") : "";

    const isComplete = !!(result.title && result.what && result.how);

    return this.baseHtml(`
      <div class="header">
        <h1>⚡ Pikachu</h1>
        <span class="badge">via ${provider}</span>
        ${this.input.isSelection ? '<span class="badge">selection</span>' : '<span class="badge">file</span>'}
        ${!isComplete ? '<span class="badge">generating…</span>' : ''}
      </div>
      <div class="title">${result.title ? this.escape(result.title) : '<span style="color:var(--vscode-descriptionForeground);font-style:italic">Generating title…</span>'}</div>
      ${result.summary ? `<div class="field"><div class="field-value" style="font-style:italic;color:var(--vscode-descriptionForeground)">${this.escape(result.summary)}</div></div>` : ""}
      <div class="field">
        <div class="field-label">What is it?</div>
        ${ph(result.what, "Analyzing…")}
      </div>
      <div class="field">
        <div class="field-label">Why does it exist?</div>
        ${ph(result.why, "Analyzing…")}
      </div>
      <div class="field">
        <div class="field-label">How does it work?</div>
        ${ph(result.how, "Analyzing…")}
      </div>
      ${result.concepts?.length ? `<div class="field"><div class="field-label">Concepts</div><div class="chips">${chips(result.concepts)}</div></div>` : ""}
      ${result.relatedConcepts?.length ? `<div class="field"><div class="field-label">Related</div><div class="chips">${chips(result.relatedConcepts)}</div></div>` : ""}
      <hr class="divider">
      <div class="actions">
        <button class="btn-primary" id="save-btn" onclick="send({type:'save'})" ${!isComplete ? "disabled" : ""}>Save to Pikachu</button>
        ${result.summary ? `<button class="btn-secondary" onclick="send({type:'copy',text:${JSON.stringify(result.summary)}})">Copy summary</button>` : ""}
        <button class="btn-secondary" onclick="send({type:'openDashboard'})">Dashboard</button>
      </div>
      <div class="saved-banner" id="saved-banner">✓ Saved to your Pikachu knowledge base</div>
    `);
  }

  errorHtml(message: string): string {
    return this.baseHtml(`
      <div class="header"><h1>⚡ Pikachu</h1></div>
      <div class="error-box"><strong>Error:</strong> ${this.escape(message)}</div>
      <div class="actions" style="margin-top:16px">
        <button class="btn-secondary" onclick="send({type:'openDashboard'})">Open dashboard</button>
      </div>
    `);
  }
}

