-- Add DEFAULT gen_random_uuid() to plans.id so raw SQL INSERTs work
ALTER TABLE "plans" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
