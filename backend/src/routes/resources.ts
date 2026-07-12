import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { AppError, asyncHandler, notFound } from '../middleware/errorHandler';
import {
  createResource,
  deleteResource,
  findResourceById,
  listResources,
  toResourceDto,
  toggleResourceEnabled,
  updateResource,
} from '../models/resource';
import { findArtifactById, listArtifactsForResource } from '../models/artifact';
import { assignPipelineAndDispatch, dispatchStep } from '../services/pipelineRouter';
import { uploadObject, deleteObject, getObject, keyFromRef } from '../storage/minio';
import { deletePoint, getPoint, pointIdFromRef } from '../storage/qdrant';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const RESOURCE_TYPES = ['PDF', 'GITHUB_REPO', 'CSV', 'AUDIO', 'MARKDOWN'];

export const resourcesRouter = Router();

resourcesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const resources = await listResources(q);
    res.status(200).json(resources.map(toResourceDto));
  }),
);

resourcesRouter.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      name?: string;
      type?: string;
      sourceKind?: string;
      source?: string | { kind?: string; url?: string };
      url?: string;
    };
    const name = body.name;
    const type = body.type;

    if (!name || !type || !RESOURCE_TYPES.includes(type)) {
      throw new AppError(400, 'INVALID_RESOURCE', 'name and a valid type are required');
    }

    let sourceType: 'UPLOAD' | 'URL';
    let sourceUri: string;

    if (req.file) {
      sourceType = 'UPLOAD';
      const key = `${uuidv4()}-${req.file.originalname}`;
      sourceUri = await uploadObject(key, req.file.buffer, req.file.mimetype);
    } else {
      const parsedSource =
        typeof body.source === 'string' ? (JSON.parse(body.source) as { kind?: string; url?: string }) : body.source;
      const url = body.url ?? parsedSource?.url;
      if (!url) {
        throw new AppError(400, 'INVALID_RESOURCE', 'a source (file upload or URL) is required');
      }
      sourceType = 'URL';
      sourceUri = url;
    }

    const resource = await createResource({ name, type: type as never, sourceType, sourceUri });
    await assignPipelineAndDispatch(resource.id, resource.type);
    const withArtifacts = await findResourceById(resource.id);
    res.status(201).json(toResourceDto(withArtifacts!));
  }),
);

resourcesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const resource = await findResourceById(req.params.id);
    if (!resource) throw notFound('resource');
    res.status(200).json(toResourceDto(resource));
  }),
);

resourcesRouter.get(
  '/:id/artifacts/:artifactId',
  asyncHandler(async (req, res) => {
    const resource = await findResourceById(req.params.id);
    if (!resource) throw notFound('resource');
    const artifact = await findArtifactById(req.params.id, req.params.artifactId);
    if (!artifact) throw notFound('artifact');

    const base = {
      id: artifact.id,
      type: artifact.type,
      producing_plugin_id: artifact.producingPluginId,
      external_ref: artifact.externalRef,
    };

    if (artifact.externalRef.startsWith('s3://')) {
      const raw = (await getObject(keyFromRef(artifact.externalRef))).toString('utf-8');
      if (artifact.type === 'REPO_ANALYSIS') {
        res.status(200).json({ ...base, content_type: 'json', content: JSON.parse(raw) });
      } else {
        res.status(200).json({ ...base, content_type: 'text', content: raw });
      }
      return;
    }

    if (artifact.externalRef.startsWith('qdrant://')) {
      const point = await getPoint(pointIdFromRef(artifact.externalRef));
      if (!point) throw notFound('artifact content');
      res.status(200).json({
        ...base,
        content_type: 'vector',
        content: { dimensions: point.vector?.length ?? 0, vector: point.vector, payload: point.payload },
      });
      return;
    }

    throw new AppError(500, 'UNKNOWN_ARTIFACT_STORE', `Cannot render artifact with external_ref: ${artifact.externalRef}`);
  }),
);

resourcesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const resource = await findResourceById(req.params.id);
    if (!resource) throw notFound('resource');
    const { name } = req.body as { name?: string };
    const updated = await updateResource(req.params.id, { name });
    res.status(200).json(toResourceDto(updated));
  }),
);

resourcesRouter.put(
  '/:id/toggle',
  asyncHandler(async (req, res) => {
    const existing = await findResourceById(req.params.id);
    if (!existing) throw notFound('resource');
    const updated = await toggleResourceEnabled(req.params.id);
    res.status(200).json(toResourceDto(updated));
  }),
);

resourcesRouter.post(
  '/:id/reprocess',
  asyncHandler(async (req, res) => {
    const resource = await findResourceById(req.params.id);
    if (!resource) throw notFound('resource');
    if (!resource.pipelineId) {
      throw new AppError(409, 'NO_MATCHING_PIPELINE', 'This resource has no matching pipeline configured');
    }

    const updated = await updateResource(req.params.id, {
      status: 'PROCESSING',
      currentStepIndex: 0,
      attemptCount: 0,
      failureReason: null,
    });
    await dispatchStep(req.params.id, 0);
    res.status(202).json(toResourceDto(updated));
  }),
);

resourcesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const resource = await findResourceById(req.params.id);
    if (!resource) throw notFound('resource');
    if (resource.status === 'PROCESSING') {
      throw new AppError(409, 'RESOURCE_PROCESSING', 'Cannot delete a resource that is currently Processing');
    }

    const artifacts = await listArtifactsForResource(req.params.id);
    for (const artifact of artifacts) {
      if (artifact.externalRef.startsWith('s3://')) {
        await deleteObject(keyFromRef(artifact.externalRef));
      } else if (artifact.externalRef.startsWith('qdrant://')) {
        await deletePoint(pointIdFromRef(artifact.externalRef));
      }
    }

    await deleteResource(req.params.id);
    res.status(204).send();
  }),
);
