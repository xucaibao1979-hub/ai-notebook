CREATE TABLE "SourceTutorNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "evidenceId" TEXT,
    "action" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourceTutorNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SourceTutorNote_userId_nodeId_createdAt_idx" ON "SourceTutorNote"("userId", "nodeId", "createdAt");
