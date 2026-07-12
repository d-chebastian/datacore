import { Router } from 'express';
import { ArtifactType } from '@prisma/client';
import { asyncHandler, notFound } from '../middleware/errorHandler';
import { findResourceById } from '../models/resource';
import { handleStepFailure, handleStepSuccess } from '../services/pipelineRouter';

export const internalArtifactsRouter = Router();

interface CallbackBody {
  plugin_id: string;
  step_position: number;
  outcome: 'SUCCESS' | 'FAILURE';
  artifact?: { type: ArtifactType; external_ref: string };
  error?: string;
}

internalArtifactsRouter.post(
  '/:resource_id',
  asyncHandler(async (req, res) => {
    const resource = await findResourceById(req.params.resource_id);
    if (!resource) throw notFound('resource');

    const body = req.body as CallbackBody;

    if (body.outcome === 'SUCCESS' && body.artifact) {
      await handleStepSuccess(resource.id, body.step_position, body.plugin_id, body.artifact);
    } else {
      await handleStepFailure(resource.id, body.step_position, body.error || 'unspecified failure');
    }

    const updated = await findResourceById(resource.id);
    res.status(202).json({ resource_id: resource.id, status: updated?.status });
  }),
);
