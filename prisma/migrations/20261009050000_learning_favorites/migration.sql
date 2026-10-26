ALTER TABLE "LearningSet" ADD COLUMN "favorited" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LearningSet" ADD COLUMN "favoriteIndices" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "LearningSet" ADD COLUMN "deletedIndices" TEXT NOT NULL DEFAULT '[]';