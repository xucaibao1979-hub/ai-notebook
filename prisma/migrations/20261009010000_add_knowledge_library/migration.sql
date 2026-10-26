CREATE TABLE "KnowledgePaper" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceUrl" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "examType" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "examGrade" INTEGER NOT NULL,
  "knowledgeGrades" TEXT NOT NULL DEFAULT '[]',
  "questions" TEXT NOT NULL,
  "questionCount" INTEGER NOT NULL,
  "answerCount" INTEGER NOT NULL,
  "qualityNote" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'unverified',
  "attachments" TEXT NOT NULL DEFAULT '[]',
  "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "KnowledgePaper_sourceUrl_key" ON "KnowledgePaper"("sourceUrl");
CREATE INDEX "KnowledgePaper_year_examType_subject_idx" ON "KnowledgePaper"("year", "examType", "subject");
CREATE INDEX "KnowledgePaper_examGrade_region_idx" ON "KnowledgePaper"("examGrade", "region");
