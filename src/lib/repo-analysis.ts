import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { prisma } from "./prisma";

const CLI_BIN = process.env.CLAUDE_CLI_BIN || "claude";
const CLI_MODEL = process.env.CLAUDE_CLI_MODEL || "sonnet";

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".cache",
  "coverage",
  "__pycache__",
  ".vscode",
  ".idea",
]);

const IGNORE_EXTENSIONS = new Set([
  ".lock",
  ".sum",
  ".map",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".db",
  ".sqlite",
]);

/** Recursively collect files from a directory, respecting ignore rules. */
function collectFiles(dir: string, maxFiles = 200): string[] {
  const results: string[] = [];

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      const fullPath = path.join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          if (!IGNORE_DIRS.has(entry)) {
            results.push(...collectFiles(fullPath, maxFiles - results.length));
          }
        } else {
          const ext = path.extname(entry).toLowerCase();
          if (!IGNORE_EXTENSIONS.has(ext) && stat.size < 100_000) {
            results.push(fullPath);
          }
        }
      } catch {
        // Skip inaccessible files
      }
    }
  } catch {
    // Skip inaccessible directories
  }

  return results;
}

/** Read a file safely, returning null on error. */
function readFileSafe(filePath: string): string | null {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

/** Extract language from file extension. */
function getLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".py": "Python",
    ".rs": "Rust",
    ".go": "Go",
    ".java": "Java",
    ".rb": "Ruby",
    ".php": "PHP",
    ".c": "C",
    ".cpp": "C++",
    ".cs": "C#",
    ".swift": "Swift",
    ".kt": "Kotlin",
    ".sql": "SQL",
    ".sh": "Shell",
    ".bash": "Shell",
    ".css": "CSS",
    ".scss": "SCSS",
    ".html": "HTML",
    ".json": "JSON",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".toml": "TOML",
    ".md": "Markdown",
    ".prisma": "Prisma",
    ".graphql": "GraphQL",
  };
  return map[ext] || ext.slice(1).toUpperCase() || "Unknown";
}

const ANALYSIS_PROMPT = `You are Pikachu's repository analysis engine. You are given file contents
from a code repository. Analyze the codebase and extract reusable technical
learnings about its patterns, architecture, and conventions.

Focus on:
- Architectural patterns (e.g., how modules are organized, dependency injection)
- Code patterns and idioms specific to the language/framework
- Configuration patterns and best practices
- Error handling approaches
- Testing patterns
- Performance optimizations
- Security practices
- API design patterns
- Database patterns
- Build/deployment patterns

For EACH insight, produce:
- "title": specific technical title naming the pattern/concept
- "language": primary language/tech
- "code": the most representative code snippet showing the pattern
- "note": clear explanation of the pattern and why it's used, 4-7 sentences
- "summary": ONE short sentence (max ~15 words) for list views
- "concepts": specific pattern/concept names
- "relatedConcepts": adjacent things to explore next

Respond with ONLY a JSON object (no markdown fences) of this shape:
{
  "learnings": [
    {
      "title": "...",
      "language": "...",
      "code": "...",
      "note": "...",
      "summary": "...",
      "concepts": ["..."],
      "relatedConcepts": ["..."]
    }
  ]
}

If no significant patterns were found, return {"learnings": []}.`;

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(CLI_BIN, ["-p", "--output-format", "json", "--model", CLI_MODEL], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PIKACHU_CAPTURE: "1" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d));
    child.stderr.on("data", (d: Buffer) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${stderr || stdout}`));
      try {
        const env = JSON.parse(stdout) as { is_error?: boolean; result?: string; error?: string };
        if (env.is_error || typeof env.result !== "string")
          return reject(new Error(env.error || "claude returned an error"));
        resolve(env.result);
      } catch {
        reject(new Error(`could not parse claude output: ${stdout.slice(0, 300)}`));
      }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function parseLearnings(text: string) {
  let s = text.trim();
  if (s.startsWith("```")) s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a !== -1 && b !== -1) s = s.slice(a, b + 1);
  const parsed = JSON.parse(s);
  return Array.isArray(parsed.learnings) ? parsed.learnings : [];
}

export interface RepoAnalysisResult {
  repository: string;
  filesScanned: number;
  learningsCount: number;
  learnings: Array<{ id: string; title: string }>;
}

/** Analyze a repository and save learnings. */
export async function analyzeRepository(
  repoPath: string,
  options: { maxFiles?: number; languages?: string[] } = {}
): Promise<RepoAnalysisResult> {
  const repoName = path.basename(repoPath);
  const maxFiles = options.maxFiles || 50;

  // Collect files
  let files = collectFiles(repoPath, maxFiles * 2); // over-collect then filter

  // Filter by language if specified
  if (options.languages && options.languages.length > 0) {
    const langSet = new Set(options.languages.map((l) => l.toLowerCase()));
    files = files.filter((f) => {
      const lang = getLanguage(f).toLowerCase();
      return langSet.has(lang);
    });
  }

  // Limit to maxFiles
  files = files.slice(0, maxFiles);

  // Read file contents
  const fileContents: string[] = [];
  for (const file of files) {
    const content = readFileSafe(file);
    if (content && content.trim().length > 10) {
      const relPath = path.relative(repoPath, file);
      const lang = getLanguage(file);
      fileContents.push(`### ${relPath} (${lang})\n\`\`\`\n${content.slice(0, 5000)}\n\`\`\``);
    }
  }

  if (fileContents.length === 0) {
    return { repository: repoName, filesScanned: 0, learningsCount: 0, learnings: [] };
  }

  // Build prompt with file contents
  const fileBlock = fileContents.join("\n\n");
  const truncated = fileBlock.length > 60000 ? fileBlock.slice(0, 60000) : fileBlock;
  const prompt = `${ANALYSIS_PROMPT}\n\n---\nREPOSITORY: ${repoName}\nFILES (${fileContents.length}):\n\n${truncated}`;

  // Run analysis
  const result = await runClaude(prompt);
  const learnings = parseLearnings(result);

  // Save to DB
  const saved: Array<{ id: string; title: string }> = [];
  for (const l of learnings) {
    if (!l || !l.title) continue;
    const note = String(l.note || l.summary || "").trim();
    const summary = String(l.summary || l.note || "").trim();
    const code = l.code ? String(l.code) : null;
    const row = await prisma.learning.create({
      data: {
        title: String(l.title),
        question: "",
        explanation: note,
        summary,
        codeSnippet: code,
        sourceType: "github",
        sourceReference: `repo:${repoName}`,
        language: l.language ? String(l.language) : null,
        repository: repoName,
        concepts: JSON.stringify(Array.isArray(l.concepts) ? l.concepts.map(String) : []),
        relatedConcepts: JSON.stringify(
          Array.isArray(l.relatedConcepts) ? l.relatedConcepts.map(String) : []
        ),
        tags: JSON.stringify(["repo-analysis"]),
      },
    });
    saved.push({ id: row.id, title: row.title });
  }

  return {
    repository: repoName,
    filesScanned: fileContents.length,
    learningsCount: saved.length,
    learnings: saved,
  };
}
