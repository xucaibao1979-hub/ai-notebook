ALTER TABLE "User" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

CREATE TABLE "LearningSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT,
    "selectionKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "questions" TEXT NOT NULL,
    "parameters" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningSet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LearningSet_userId_dateKey_selectionKey_key" ON "LearningSet"("userId", "dateKey", "selectionKey");
CREATE INDEX "LearningSet_userId_createdAt_idx" ON "LearningSet"("userId", "createdAt");

ALTER TABLE "PracticeRecord" ADD COLUMN "learningSetId" TEXT REFERENCES "LearningSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeRecord" ADD COLUMN "exerciseIndex" INTEGER;
ALTER TABLE "PracticeRecord" ADD COLUMN "userAnswer" TEXT;
CREATE UNIQUE INDEX "PracticeRecord_userId_learningSetId_exerciseIndex_key" ON "PracticeRecord"("userId", "learningSetId", "exerciseIndex");
