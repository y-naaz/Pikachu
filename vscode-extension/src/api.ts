// Typed HTTP client for the Pikachu Next.js server.

export interface ExplainResult {
  title: string;
  what: string;
  why: string;
  how: string;
  summary: string;
  concepts: string[];
  relatedConcepts: string[];
}

export interface Learning {
  id: string;
  title: string;
  question: string;
  explanation: string;
  summary: string;
  sourceType: string;
  language?: string | null;
  repository?: string | null;
  filePath?: string | null;
  concepts: string[];
  relatedConcepts: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ExplainOptions {
  content: string;
  question?: string;
  language?: string;
  repository?: string;
  filePath?: string;
  provider?: "claude" | "opencode";
  save?: boolean;
}

export interface ExplainResponse {
  result: ExplainResult;
  learning?: Learning;
}

export class PikachuClient {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(
    path: string,
    init?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl.replace(/\/$/, "")}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...init,
      });
    } catch (err) {
      throw new Error(
        `Cannot reach Pikachu server at ${this.baseUrl}. ` +
          `Make sure it is running (npm run dev). Error: ${(err as Error).message}`
      );
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(
        (data as { error?: string }).error ??
          `HTTP ${res.status} from ${path}`
      );
    }

    return data as T;
  }

  /** Generate (and optionally save) an explanation. */
  async explain(opts: ExplainOptions): Promise<ExplainResponse> {
    return this.request<ExplainResponse>("/api/explain", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }

  /** Save a generated explanation as a learning. */
  async save(opts: Omit<ExplainOptions, "save">): Promise<Learning> {
    const data = await this.request<ExplainResponse>("/api/explain", {
      method: "POST",
      body: JSON.stringify({ ...opts, save: true }),
    });
    if (!data.learning) {
      throw new Error("Server did not return a saved learning.");
    }
    return data.learning;
  }

  /** Full-text search. */
  async search(query: string): Promise<Learning[]> {
    const data = await this.request<{ learnings: Learning[] }>(
      `/api/search?q=${encodeURIComponent(query)}`
    );
    return data.learnings ?? [];
  }

  /** List recent learnings. */
  async listLearnings(): Promise<Learning[]> {
    const data = await this.request<{ learnings: Learning[] }>("/api/learnings");
    return data.learnings ?? [];
  }

  /** Check if the server is reachable. */
  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/learnings?take=1`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
