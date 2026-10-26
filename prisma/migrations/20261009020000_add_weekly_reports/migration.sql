CREATE TABLE "WeeklyReport" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "userId" TEXT NOT NULL,
 "notebookId" TEXT,
 "notebookKey" TEXT NOT NULL,
 "weekKey" TEXT NOT NULL,
 "periodStart" DATETIME NOT NULL,
 "periodEnd" DATETIME NOT NULL,
 "statistics" TEXT NOT NULL,
 "summary" TEXT NOT NULL DEFAULT '',
 "status" TEXT NOT NULL DEFAULT 'pending',
 "message" TEXT NOT NULL DEFAULT '',
 "exerciseSetId" TEXT,
 "leaseUntil" DATETIME,
 "retryAfter" DATETIME,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL,
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("notebookId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("exerciseSetId") REFERENCES "LearningSet"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WeeklyReport_userId_notebookKey_weekKey_key" ON "WeeklyReport"("userId", "notebookKey", "weekKey");
CREATE INDEX "WeeklyReport_userId_periodEnd_idx" ON "WeeklyReport"("userId", "periodEnd");
