-- CreateTable
CREATE TABLE "Learning" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "sourceReference" TEXT,
    "language" TEXT,
    "repository" TEXT,
    "filePath" TEXT,
    "branch" TEXT,
    "codeSnippet" TEXT,
    "concepts" TEXT NOT NULL DEFAULT '[]',
    "relatedConcepts" TEXT NOT NULL DEFAULT '[]',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Learning_repository_idx" ON "Learning"("repository");

-- CreateIndex
CREATE INDEX "Learning_sourceType_idx" ON "Learning"("sourceType");
