# ⚡ Pikachu

A personal engineering memory system. Capture, organize, connect, and search
everything you learn — so you can reconstruct your understanding of a concept or
repository months later in minutes.

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind v4**
- **SQLite** via **Prisma** (search powered by **SQLite FTS5**)
- **Claude API** (`@anthropic-ai/sdk`) for Explain & Save

## VS Code Extension (Phase 2)

```bash
cd vscode-extension
npm install && npm run compile
# Press F5 in VS Code to open Extension Development Host
```

Commands: **Pikachu: Explain Selection** · **Pikachu: Explain File** · **Pikachu: Search Learnings**

## Getting started

```bash
# 1. Apply database migrations (creates dev.db + FTS index)
npm run db:migrate

# 2. Run it
npm run dev      # http://localhost:3000
```

## AI Backends

Explain & Save supports two local AI CLIs — no cloud API key needed:

| Backend | CLI | How to authenticate |
| ------- | --- | ------------------- |
| **Claude Code** (default) | `claude` | `claude login` |
| **OpenCode** | `opencode` | `opencode providers` (add Anthropic, OpenAI, etc.) |

Switch between them on the **Explain & Save** page using the provider toggle.

## Features (MVP)

| Page                | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| Dashboard           | Totals, top concepts, learning streak, recent learnings             |
| Learnings           | List all learnings + add one manually                               |
| Explain & Save      | Paste code/docs/a question → Claude generates a structured learning |
| Search              | Fast full-text search (FTS5) across title/question/explanation/etc. |
| Knowledge Explorer  | Learnings grouped by concept                                        |
| Learning Details    | Question, explanation, summary, code, related concepts, repo context|

## Project layout

```
prisma/
  schema.prisma           # Learning model (SQLite)
  migrations/             # init + learning_fts (FTS5 virtual table + triggers)
src/
  lib/
    prisma.ts             # PrismaClient singleton
    types.ts              # Learning + ExplainResult types
    learning.ts           # row <-> app conversion, list (de)serialization
    queries.ts            # all data access (list/get/create/search/stats/groups)
    claude.ts             # Claude API client for Explain & Save
  app/
    api/learnings/        # GET list, POST create, GET/PATCH/DELETE [id]
    api/search/           # GET ?q=  (FTS5)
    api/explain/          # POST  (Claude → optional save)
    page.tsx              # Dashboard
    learnings/            # list + [id] details
    explain/ search/ explore/ settings/
  components/             # ui.tsx, LearningCard, CreateLearningForm
```

## Notes & gotchas

- **List fields** (`concepts`, `relatedConcepts`, `tags`) are stored as JSON
  strings because SQLite has no array type; conversion lives in `src/lib/learning.ts`.
- **FTS5 + Prisma:** the `learning_fts` virtual table and its sync triggers are
  created by the `learning_fts` migration. FTS5's auxiliary tables confuse
  `prisma migrate dev`'s drift detection, so apply migrations with
  **`npm run db:migrate`** (`prisma migrate deploy`), which never resets data.
  Only use `prisma migrate dev` when authoring a brand-new schema migration.

## Roadmap (not in MVP)

~~Phase 2~~ ✅ VS Code extension (`vscode-extension/`) · Phase 3 Claude conversation import ·
Phase 4 repository analysis · Phase 5 spaced-repetition retention.
