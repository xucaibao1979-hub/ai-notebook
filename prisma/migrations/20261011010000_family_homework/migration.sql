ALTER TABLE "User" ADD COLUMN "parentUserId" TEXT;
CREATE INDEX "User_parentUserId_idx" ON "User"("parentUserId");
ALTER TABLE "ErrorItem" ADD COLUMN "favorited" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ErrorItem" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "ErrorItem" ADD COLUMN "solutionReviewedAt" DATETIME;
CREATE TABLE "HomeworkReview" ("id" TEXT NOT NULL PRIMARY KEY,"userId" TEXT NOT NULL,"image" TEXT NOT NULL,"questions" TEXT NOT NULL,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "HomeworkReview_userId_createdAt_idx" ON "HomeworkReview"("userId","createdAt");