"use client";

import { useMemo, useState } from "react";

/** Minimal markdown → HTML with syntax-highlighted code blocks. */

// Syntax highlighting keywords (common languages)
const KEYWORDS: Record<string, RegExp> = {
  typescript: /\b(const|let|var|function|return|if|else|for|while|class|interface|type|import|export|from|default|async|await|new|this|throw|try|catch|typeof|instanceof|void|null|undefined|true|false)\b/g,
  javascript: /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|default|async|await|new|this|throw|try|catch|typeof|instanceof|void|null|undefined|true|false)\b/g,
  python: /\b(def|class|import|from|return|if|elif|else|for|while|try|except|raise|with|as|in|not|and|or|is|None|True|False|self|lambda|yield|async|await|pass|break|continue)\b/g,
  rust: /\b(fn|let|mut|const|struct|enum|impl|trait|pub|use|mod|crate|self|super|return|if|else|for|while|loop|match|async|await|move|ref|where|type|as|in|true|false|Some|None|Ok|Err)\b/g,
  go: /\b(func|package|import|return|if|else|for|range|switch|case|default|var|const|type|struct|interface|map|chan|go|defer|select|true|false|nil)\b/g,
  sql: /\b(SELECT|FROM|WHERE|INSERT|INTO|UPDATE|SET|DELETE|CREATE|TABLE|ALTER|DROP|INDEX|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|NOT|NULL|PRIMARY|KEY|FOREIGN|REFERENCES|CONSTRAINT|DEFAULT|CHECK|UNIQUE|IN|EXISTS|BETWEEN|LIKE|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|AS|COUNT|SUM|AVG|MIN|MAX|CASE|WHEN|THEN|ELSE|END)\b/gi,
  shell: /\b(echo|cd|ls|mkdir|rm|cp|mv|cat|grep|sed|awk|find|chmod|chown|sudo|apt|npm|npx|yarn|git|docker|curl|wget|export|source|alias|if|then|else|fi|for|do|done|while|case|esac|function)\b/g,
};

function highlightSyntax(code: string, lang: string): string {
  let highlighted = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Strings
  highlighted = highlighted.replace(
    /(["'`])(?:(?!\1|\\).|\\.)*\1/g,
    '<span class="text-green-400">$&</span>'
  );

  // Comments
  if (lang === "python" || lang === "shell") {
    highlighted = highlighted.replace(
      /(#.*)$/gm,
      '<span class="text-gray-500">$1</span>'
    );
  } else if (lang === "rust" || lang === "go" || lang === "typescript" || lang === "javascript") {
    highlighted = highlighted.replace(
      /(\/\/.*)$/gm,
      '<span class="text-gray-500">$1</span>'
    );
  }

  // Numbers
  highlighted = highlighted.replace(
    /\b(\d+\.?\d*)\b/g,
    '<span class="text-amber-400">$1</span>'
  );

  // Keywords
  const kw = KEYWORDS[lang] || KEYWORDS.typescript;
  highlighted = highlighted.replace(
    kw,
    '<span class="text-purple-400 font-medium">$&</span>'
  );

  return highlighted;
}

function mdToHtml(md: string): string {
  let html = md;

  // Code blocks: ```lang\n...\n```
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, lang, code) => {
      const highlighted = highlightSyntax(code.trimEnd(), lang || "typescript");
      return `<div class="relative my-4 rounded-lg overflow-hidden border border-neutral-700"><div class="flex items-center justify-between bg-neutral-800 px-3 py-1 text-xs text-neutral-400"><span>${lang || "code"}</span></div><pre class="overflow-x-auto bg-neutral-900 p-4 text-sm leading-relaxed"><code>${highlighted}</code></pre></div>`;
    }
  );

  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-neutral-800 px-1.5 py-0.5 text-sm text-amber-300">$1</code>'
  );

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 class="mt-6 mb-2 text-lg font-semibold">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="mt-8 mb-3 text-xl font-bold">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="mt-8 mb-3 text-2xl font-bold">$1</h1>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="text-blue-400 underline hover:text-blue-300" target="_blank" rel="noopener">$1</a>'
  );

  // Unordered lists
  html = html.replace(
    /^[-*] (.+)$/gm,
    '<li class="ml-4 list-disc">$1</li>'
  );
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => `<ul class="my-2 space-y-1">${match}</ul>`);

  // Ordered lists
  html = html.replace(
    /^\d+\. (.+)$/gm,
    '<li class="ml-4 list-decimal">$1</li>'
  );

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="my-6 border-neutral-700">');

  // Line breaks into paragraphs
  html = html
    .split("\n\n")
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (
        trimmed.startsWith("<h") ||
        trimmed.startsWith("<pre") ||
        trimmed.startsWith("<div") ||
        trimmed.startsWith("<ul") ||
        trimmed.startsWith("<ol") ||
        trimmed.startsWith("<hr") ||
        trimmed.startsWith("<table")
      ) {
        return trimmed;
      }
      return `<p class="mb-3 leading-relaxed">${trimmed.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");

  return html;
}

export function Markdown({ content }: { content: string }) {
  const html = useMemo(() => mdToHtml(content), [content]);
  return (
    <div
      className="prose-custom text-sm text-neutral-200"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Expandable code block with copy button. */
export function CodeBlock({
  code,
  language,
}: {
  code: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);
  const highlighted = useMemo(
    () => highlightSyntax(code, language || "typescript"),
    [code, language]
  );

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-4 overflow-hidden rounded-lg border border-neutral-700">
      <div className="flex items-center justify-between bg-neutral-800 px-3 py-1 text-xs text-neutral-400">
        <span>{language || "code"}</span>
        <button onClick={copy} className="hover:text-neutral-200">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto bg-neutral-900 p-4 text-sm leading-relaxed">
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  );
}
