-- Full-text search over Learning using SQLite FTS5.
-- The virtual table mirrors the searchable text columns and is kept in sync
-- with the Learning table via triggers. `rowid` maps to Learning.id.

CREATE VIRTUAL TABLE "learning_fts" USING fts5(
  id UNINDEXED,
  title,
  question,
  explanation,
  summary,
  concepts,
  repository
);

-- Backfill any existing rows.
INSERT INTO "learning_fts" (id, title, question, explanation, summary, concepts, repository)
SELECT id, title, question, explanation, summary, concepts, COALESCE(repository, '')
FROM "Learning";

-- Keep the FTS index in sync with the source table.
CREATE TRIGGER "learning_ai" AFTER INSERT ON "Learning" BEGIN
  INSERT INTO "learning_fts" (id, title, question, explanation, summary, concepts, repository)
  VALUES (new.id, new.title, new.question, new.explanation, new.summary, new.concepts, COALESCE(new.repository, ''));
END;

CREATE TRIGGER "learning_ad" AFTER DELETE ON "Learning" BEGIN
  DELETE FROM "learning_fts" WHERE id = old.id;
END;

CREATE TRIGGER "learning_au" AFTER UPDATE ON "Learning" BEGIN
  DELETE FROM "learning_fts" WHERE id = old.id;
  INSERT INTO "learning_fts" (id, title, question, explanation, summary, concepts, repository)
  VALUES (new.id, new.title, new.question, new.explanation, new.summary, new.concepts, COALESCE(new.repository, ''));
END;