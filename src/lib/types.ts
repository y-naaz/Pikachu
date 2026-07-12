// Core domain types for Pikachu.

export type SourceType = "claude" | "opencode" | "manual" | "vscode" | "github";

/**
 * The Learning entity as the app uses it (list fields are real arrays).
 * The DB stores concepts/relatedConcepts/tags as JSON strings; conversion
 * happens in src/lib/learning.ts.
 */
export interface Learning {
  id: string;

  title: string;
  question: string;
  explanation: string;
  summary: string;

  sourceType: SourceType;
  sourceReference?: string | null;

  language?: string | null;
  repository?: string | null;
  filePath?: string | null;
  branch?: string | null;
  codeSnippet?: string | null;

  concepts: string[];
  relatedConcepts: string[];
  tags: string[];

  createdAt: Date;
  updatedAt: Date;
}

/** Shape Claude returns from the Explain-and-Save prompt. */
export interface ExplainResult {
  title: string;
  what: string;
  why: string;
  how: string;
  summary: string;
  concepts: string[];
  relatedConcepts: string[];
}
