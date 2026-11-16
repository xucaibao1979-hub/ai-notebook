CREATE TABLE "KnowledgePrerequisite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "prerequisiteId" TEXT NOT NULL,
    "strength" TEXT NOT NULL DEFAULT 'hard',
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgePrerequisite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "KnowledgePrerequisite_userId_topicId_prerequisiteId_key" ON "KnowledgePrerequisite"("userId", "topicId", "prerequisiteId");
CREATE INDEX "KnowledgePrerequisite_userId_subject_idx" ON "KnowledgePrerequisite"("userId", "subject");

CREATE TABLE "DiagnosisSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'target',
    "targetIds" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DiagnosisSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DiagnosisSession_userId_createdAt_idx" ON "DiagnosisSession"("userId", "createdAt");
