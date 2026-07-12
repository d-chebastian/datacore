-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('PDF', 'GITHUB_REPO', 'CSV', 'AUDIO', 'MARKDOWN');

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('UPLOAD', 'URL');

-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('VECTOR', 'GRAPH', 'SUMMARY');

-- CreateTable
CREATE TABLE "resources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "source_uri" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "status" "ResourceStatus" NOT NULL DEFAULT 'PENDING',
    "failure_reason" TEXT,
    "pipeline_id" TEXT,
    "current_step_index" INTEGER,
    "step_snapshot" JSONB,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "current_step_dispatched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipelines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger_type" "ResourceType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_steps" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "plugin_id" TEXT NOT NULL,
    "max_attempts" INTEGER NOT NULL DEFAULT 1,
    "backoff_seconds" INTEGER NOT NULL DEFAULT 0,
    "timeout_seconds" INTEGER NOT NULL DEFAULT 300,

    CONSTRAINT "pipeline_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugins" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plugins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "type" "ArtifactType" NOT NULL,
    "producing_plugin_id" TEXT NOT NULL,
    "external_ref" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pipelines_trigger_type_key" ON "pipelines"("trigger_type");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_steps_pipeline_id_position_key" ON "pipeline_steps"("pipeline_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "artifacts_resource_id_type_key" ON "artifacts"("resource_id", "type");

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_steps" ADD CONSTRAINT "pipeline_steps_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_steps" ADD CONSTRAINT "pipeline_steps_plugin_id_fkey" FOREIGN KEY ("plugin_id") REFERENCES "plugins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_producing_plugin_id_fkey" FOREIGN KEY ("producing_plugin_id") REFERENCES "plugins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
