CREATE TABLE "TextbookEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "page" TEXT NOT NULL DEFAULT '',
    "excerpt" TEXT NOT NULL DEFAULT '',
    "image" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TextbookEvidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TextbookEvidence_userId_nodeId_idx" ON "TextbookEvidence"("userId", "nodeId");
CREATE TABLE "LearningPath" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "diagnosisSessionId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LearningPath_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LearningPath_userId_diagnosisSessionId_key" ON "LearningPath"("userId", "diagnosisSessionId");
CREATE INDEX "LearningPath_userId_updatedAt_idx" ON "LearningPath"("userId", "updatedAt");
ALTER TABLE "StudyTask" ADD COLUMN "phase" TEXT NOT NULL DEFAULT '等待开始';
ALTER TABLE "StudyTask" ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0;
