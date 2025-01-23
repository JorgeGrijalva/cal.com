-- AlterTable
ALTER TABLE "WorkflowStep" ADD COLUMN     "safe" BOOLEAN NOT NULL DEFAULT false;

-- Update existing records to set safe to true
UPDATE "WorkflowStep" SET "safe" = true;