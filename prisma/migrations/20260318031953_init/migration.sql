/*
  Warnings:

  - You are about to drop the column `base_scope` on the `cal_md_items` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "cal_md_items" DROP COLUMN "base_scope",
ADD COLUMN     "baseScope" TEXT NOT NULL DEFAULT 'all';
