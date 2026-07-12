import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { api, Pipeline, Resource } from '../services/apiClient';
import { bundlesApi, communityAuthApi, PublicUser, BundlePipeline } from '../services/registryClient';
import CommunityLoginModal from './CommunityLoginModal';

function stepUrlKey(pipelineId: string, pluginId: string) {
  return `${pipelineId}:${pluginId}`;
}

export default function ShareBundleModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResourceIds, setSelectedResourceIds] = useState<Set<string>>(new Set());
  const [stepRepoUrls, setStepRepoUrls] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [user, setUser] = useState<PublicUser | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.pipelines.list().then(setPipelines).catch((e) => setError(e.message));
    api.resources.list().then(setResources).catch(() => undefined);
    communityAuthApi
      .me()
      .then(({ user: u }) => setUser(u))
      .catch(() => setUser(null));
  }, []);

  const pipelineTriggerTypes = new Set(pipelines.map((p) => p.trigger_type));

  // Only URL-sourced, Completed resources whose type is covered by one of the local pipelines can
  // be shared — an UPLOAD's source is a private path into this instance's own MinIO and isn't
  // fetchable by anyone importing the bundle elsewhere, and a type with no local pipeline can't be
  // reprocessed by whoever imports this bundle.
  const eligibleResources = resources.filter(
    (r) => r.status === 'COMPLETED' && r.source_type === 'URL' && r.source_uri && pipelineTriggerTypes.has(r.type),
  );

  useEffect(() => {
    setSelectedResourceIds(new Set(eligibleResources.map((r) => r.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelines, resources]);

  function toggleResource(id: string) {
    setSelectedResourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      setShowLogin(true);
      return;
    }
    if (pipelines.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const bundlePipelines: BundlePipeline[] = pipelines.map((p) => ({
        name: p.name,
        trigger_type: p.trigger_type,
        steps: [...p.steps]
          .sort((a, b) => a.position - b.position)
          .map((s) => ({
            plugin_name: s.plugin_id,
            plugin_repo_url: stepRepoUrls[stepUrlKey(p.id, s.plugin_id)] || '',
            max_attempts: s.max_attempts,
            backoff_seconds: s.backoff_seconds,
            timeout_seconds: s.timeout_seconds,
          })),
      }));
      const chosenResources = eligibleResources.filter((r) => selectedResourceIds.has(r.id));

      await bundlesApi.create({
        name,
        description,
        pipelines: bundlePipelines,
        resources: chosenResources.map((r) => ({ name: r.name, type: r.type, source_uri: r.source_uri! })),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      setSuccess(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h4 className="font-semibold text-slate-900">{t('shareBundle.title')}</h4>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        {success ? (
          <div className="text-center py-8">
            <p className="text-emerald-600 font-medium">{t('shareBundle.success')}</p>
            <button onClick={onClose} className="mt-3 text-sm text-blue-600 hover:underline">
              {t('common.close')}
            </button>
          </div>
        ) : pipelines.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">{t('shareBundle.noPipelines')}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-red-600">{error}</p>}
            <p className="text-xs text-slate-500">{t('shareBundle.explanation')}</p>

            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">
                {t('shareBundle.pipelinesToShare', { count: pipelines.length })}
              </p>
              {pipelines.map((p) => (
                <div key={p.id} className="border border-slate-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-slate-800">
                    {p.name} <span className="text-xs text-slate-400 font-normal">({p.trigger_type})</span>
                  </p>
                  <div className="mt-2 space-y-2">
                    {[...p.steps]
                      .sort((a, b) => a.position - b.position)
                      .map((s) => (
                        <div key={s.plugin_id} className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 w-32 shrink-0 truncate" title={s.plugin_id}>
                            {s.plugin_id}
                          </span>
                          <input
                            required
                            placeholder={t('shareBundle.repoUrlPlaceholder')}
                            value={stepRepoUrls[stepUrlKey(p.id, s.plugin_id)] || ''}
                            onChange={(e) =>
                              setStepRepoUrls((prev) => ({ ...prev, [stepUrlKey(p.id, s.plugin_id)]: e.target.value }))
                            }
                            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                          />
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">
                {t('shareBundle.eligibleResources', { count: eligibleResources.length })}
              </p>
              <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-100">
                {eligibleResources.length === 0 && (
                  <p className="text-xs text-slate-400 p-3">{t('shareBundle.noEligibleResources')}</p>
                )}
                {eligibleResources.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <input type="checkbox" checked={selectedResourceIds.has(r.id)} onChange={() => toggleResource(r.id)} />
                    {r.name} <span className="text-xs text-slate-400">({r.type})</span>
                  </label>
                ))}
              </div>
            </div>

            <input
              required
              placeholder={t('shareBundle.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <textarea
              required
              placeholder={t('shareBundle.descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder={t('shareBundle.tagsPlaceholder')}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />

            <button
              type="submit"
              disabled={submitting || selectedResourceIds.size === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {submitting ? t('shareBundle.submitting') : user ? t('shareBundle.submit') : t('shareBundle.loginAndShare')}
            </button>
          </form>
        )}
      </div>

      {showLogin && (
        <CommunityLoginModal
          onClose={() => setShowLogin(false)}
          onAuthenticated={(u) => {
            setUser(u);
            setShowLogin(false);
          }}
        />
      )}
    </div>
  );
}
