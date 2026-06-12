-- CreateTable
CREATE TABLE "platform_configs" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_configs_pkey" PRIMARY KEY ("key")
);
