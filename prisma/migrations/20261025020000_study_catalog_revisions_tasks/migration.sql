CREATE TABLE "StudyCatalogRevision" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "userId" TEXT NOT NULL,
 "action" TEXT NOT NULL,
 "snapshot" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "StudyCatalogRevision_userId_createdAt_idx" ON "StudyCatalogRevision"("userId", "createdAt");
CREATE TABLE "StudyTask" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "userId" TEXT NOT NULL,
 "kind" TEXT NOT NULL,
 "requestHash" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'pending',
 "input" TEXT NOT NULL,
 "result" TEXT,
 "error" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "StudyTask_userId_createdAt_idx" ON "StudyTask"("userId", "createdAt");
CREATE INDEX "StudyTask_userId_kind_requestHash_idx" ON "StudyTask"("userId", "kind", "requestHash");
