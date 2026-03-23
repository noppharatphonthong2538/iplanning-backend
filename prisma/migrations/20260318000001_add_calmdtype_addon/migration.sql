-- AlterEnum: add 'addon' value to CalMdType
-- Note: ALTER TYPE ADD VALUE cannot run inside a transaction in PostgreSQL.
-- Prisma handles this automatically when running migrate deploy.
ALTER TYPE "CalMdType" ADD VALUE IF NOT EXISTS 'addon';
