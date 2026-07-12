import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search, Download, ExternalLink } from 'lucide-react';
import { api, Pipeline } from '../services/apiClient';
import { bundlesApi, Bundle } from '../services/registryClient';

export default function ImportBundleModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selected, setSelected] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; failed: number } | null>(null);

  useEffect(() => {
    api.pipelines.list().then(setPipelines).catch(() => undefined);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      bundlesApi
        .list(query || undefined)
        .then(setBundles)
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const localTriggerTypes = new Set(pipelines.map((p) => p.trigger_type));
  const coveredPipelines = selected ? selected.pipelines.filter((p) => localTriggerTypes.has(p.trigger_type)) : [];
  const missingPipelines = selected ? selected.pipelines.filter((p) => !localTriggerTypes.has(p.trigger_type)) : [];

  async function handleImport() {
    if (!selected) return;
    setImporting(true);
    setError(null);
    let imported = 0;
    let failed = 0;
    for (const resource of selected.resources) {
      try {
        await api.resources.create({ name: resource.name, type: resource.type, source: { kind: 'URL', url: resource.source_uri } });
        imported += 1;
      } catch {
        failed += 1;
      }
    }
    setImportResult({ imported, failed });
    setImporting(false);
    onImported();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200">
          <h4 className="font-semibold text-slate-900">{t('importBundle.title')}</h4>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}

          {!selected ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('importBundle.searchPlaceholder')}
                  className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-lg text-sm outline-none"
                />
              </div>
              {bundles.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-8">{t('importBundle.noBundlesFound')}</p>
              )}
              {bundles.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelected(b)}
                  className="w-full text-left border border-slate-200 rounded-lg p-4 hover:bg-slate-50"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-slate-900">{b.name}</p>
                      <p className="text-xs text-slate-500">
                        {b.pipelines.map((p) => p.trigger_type).join(', ')} · by {b.author}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Download size={12} /> {b.resources.length}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-2">{b.description}</p>
                </button>
              ))}
            </>
          ) : importResult ? (
            <div className="text-center py-8">
              <p className="text-emerald-600 font-medium">
                {t('importBundle.importedSummary', {
                  count: importResult.imported,
                  failedSuffix: importResult.failed > 0 ? t('importBundle.failedSuffix', { count: importResult.failed }) : '',
                })}
              </p>
              <p className="text-sm text-slate-500 mt-2">{t('importBundle.checkResourcesView')}</p>
              <button onClick={onClose} className="mt-4 text-sm text-blue-600 hover:underline">
                {t('common.close')}
              </button>
            </div>
          ) : (
            <>
              <button onClick={() => setSelected(null)} className="text-xs text-slate-500 hover:underline">
                {t('importBundle.backToSearch')}
              </button>
              <h5 className="font-semibold text-slate-900">{selected.name}</h5>
              <p className="text-sm text-slate-600">{selected.description}</p>

              {coveredPipelines.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-4 py-3">
                  {t('importBundle.alreadyHavePipeline', { types: coveredPipelines.map((p) => p.trigger_type).join(', ') })}
                </div>
              )}

              {missingPipelines.map((p, i) => (
                <div key={i} className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 space-y-2">
                  <p>{t('importBundle.missingPipeline', { type: p.trigger_type, name: p.name })}</p>
                  <ul className="list-disc list-inside">
                    {p.steps.map((s, si) => (
                      <li key={si}>
                        {s.plugin_name} —{' '}
                        <a href={s.plugin_repo_url} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5">
                          {t('importBundle.repoLink')} <ExternalLink size={10} />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">
                  {t('importBundle.resourcesToImport', { count: selected.resources.length })}
                </p>
                <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-40 overflow-y-auto">
                  {selected.resources.map((r, i) => (
                    <li key={i} className="px-3 py-2 text-sm text-slate-600 flex justify-between">
                      <span>{r.name}</span>
                      <span className="text-xs text-slate-400">{r.type}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={handleImport}
                disabled={importing}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {importing ? t('importBundle.importing') : t('importBundle.import', { count: selected.resources.length })}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
