import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { AppError, asyncHandler, notFound } from '../middleware/errorHandler';
import {
  createPipeline,
  deletePipeline,
  findPipelineById,
  listPipelines,
  StepInput,
  toPipelineDto,
  updatePipelineSteps,
} from '../models/pipeline';
import { pickUpPendingResourcesForPipeline } from '../services/pipelineRouter';

export const pipelinesRouter = Router();

const RESOURCE_TYPES = ['PDF', 'GITHUB_REPO', 'CSV', 'AUDIO', 'MARKDOWN'];

pipelinesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const pipelines = await listPipelines();
    res.status(200).json(pipelines.map(toPipelineDto));
  }),
);

pipelinesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body as { name: string; trigger_type: string; steps: StepInput[] };
    if (!body.name || !RESOURCE_TYPES.includes(body.trigger_type) || !Array.isArray(body.steps)) {
      throw new AppError(400, 'INVALID_PIPELINE', 'name, a valid trigger_type, and steps are required');
    }

    try {
      const pipeline = await createPipeline(body.name, body.trigger_type as never, body.steps);
      await pickUpPendingResourcesForPipeline(body.trigger_type);
      res.status(201).json(toPipelineDto(pipeline));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(
          409,
          'PIPELINE_TRIGGER_TYPE_TAKEN',
          `A pipeline already exists for trigger type ${body.trigger_type}`,
        );
      }
      throw err;
    }
  }),
);

pipelinesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await findPipelineById(req.params.id);
    if (!existing) throw notFound('pipeline');
    const body = req.body as { name?: string; steps: StepInput[] };
    const updated = await updatePipelineSteps(req.params.id, body.name, body.steps ?? []);
    res.status(200).json(toPipelineDto(updated));
  }),
);

pipelinesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await findPipelineById(req.params.id);
    if (!existing) throw notFound('pipeline');
    // Resource.pipelineId uses ON DELETE SET NULL; a Processing resource runs entirely from its own
    // step_snapshot and never re-reads this row, so deletion has no effect on it (FR-014a).
    await deletePipeline(req.params.id);
    res.status(204).send();
  }),
);
