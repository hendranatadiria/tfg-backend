/*
  Warnings:

  - Added the required column `level` to the `LevelLog` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "LevelLog" ADD COLUMN     "level" DOUBLE PRECISION NOT NULL;
