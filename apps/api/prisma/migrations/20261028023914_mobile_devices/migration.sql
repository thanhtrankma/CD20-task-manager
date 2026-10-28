-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'IOS');

-- CreateEnum
CREATE TYPE "PushProvider" AS ENUM ('FCM', 'APNS');

-- CreateTable
CREATE TABLE "devices" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "session_id" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "provider" "PushProvider" NOT NULL,
    "token" VARCHAR(512) NOT NULL,
    "app_version" VARCHAR(32),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_token_key" ON "devices"("token");

-- CreateIndex
CREATE INDEX "devices_user_id_idx" ON "devices"("user_id");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
