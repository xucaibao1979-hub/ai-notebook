CREATE TABLE "KnowledgeCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "concept" TEXT NOT NULL DEFAULT '',
    "pitfall" TEXT NOT NULL DEFAULT '',
    "method" TEXT NOT NULL DEFAULT '',
    "grade" TEXT,
    "chapter" TEXT,
    "status" TEXT NOT NULL DEFAULT 'reviewing',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "KnowledgeCard_userId_subject_title_key" ON "KnowledgeCard"("userId", "subject", "title");
CREATE INDEX "KnowledgeCard_userId_updatedAt_idx" ON "KnowledgeCard"("userId", "updatedAt");

CREATE TABLE "KnowledgeCardError" (
    "cardId" TEXT NOT NULL,
    "errorItemId" TEXT NOT NULL,
    PRIMARY KEY ("cardId", "errorItemId"),
    CONSTRAINT "KnowledgeCardError_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "KnowledgeCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeCardError_errorItemId_fkey" FOREIGN KEY ("errorItemId") REFERENCES "ErrorItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "KnowledgeCardError_errorItemId_idx" ON "KnowledgeCardError"("errorItemId");
