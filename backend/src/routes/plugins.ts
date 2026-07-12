import { Router } from 'express';
import { AppError, asyncHandler, notFound } from '../middleware/errorHandler';
import {
  countPipelineStepsUsingPlugin,
  deletePlugin,
  findPluginById,
  listPlugins,
  toPluginDto,
  togglePlugin,
} from '../models/plugin';

export const pluginsRouter = Router();

pluginsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const plugins = await listPlugins();
    res.status(200).json(plugins.map(toPluginDto));
  }),
);

pluginsRouter.put(
  '/:id/toggle',
  asyncHandler(async (req, res) => {
    const existing = await findPluginById(req.params.id);
    if (!existing) throw notFound('plugin');
    const updated = await togglePlugin(req.params.id);
    res.status(200).json(toPluginDto(updated));
  }),
);

pluginsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await findPluginById(req.params.id);
    if (!existing) throw notFound('plugin');
    const usageCount = await countPipelineStepsUsingPlugin(req.params.id);
    if (usageCount > 0) {
      throw new AppError(409, 'PLUGIN_IN_USE', 'Cannot delete a plugin referenced by a pipeline step');
    }
    await deletePlugin(req.params.id);
    res.status(204).send();
  }),
);
