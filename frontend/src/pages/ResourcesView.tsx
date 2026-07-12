import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Edit, Play, AlertTriangle, Share2, Download } from 'lucide-react';
import { api, Artifact, Resource, ResourceType } from '../services/apiClient';
import StatusBadge from '../components/StatusBadge';
import ArtifactViewer from '../components/ArtifactViewer';
import ShareBundleModal from '../components/ShareBundleModal';
import ImportBundleModal from '../components/ImportBundleModal';

const RESOURCE_TYPES: ResourceType[] = ['PDF', 'GITHUB_REPO', 'CSV', 'AUDIO', 'MARKDOWN'];

export default function ResourcesView() {
  const { t } = useTranslation();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [viewing, setViewing] = useState<{ resourceId: string; artifact: Artifact } | null>(null);
  const [showShareBundle, setShowShareBundle] = useState(false);
  const [showImportBundle, setShowImportBundle] = useState(false);

  const load = () => {
    setLoading(true);
    api.resources
      .list()
      .then(setResources)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  async function handleReprocess(id: string) {
    await api.resources.reprocess(id);
    load();
  }

  async function handleToggleEnabled(id: string) {
    try {
      await api.resources.toggle(id);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.resources.remove(id);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveEdit(id: string) {
    await api.resources.update(id, { name: editingName });
    setEditingId(null);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-slate-900">{t('resources.title')}</h3>
          <p className="text-sm text-slate-500">{t('resources.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportBundle(true)}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
          >
            <Download size={16} /> {t('resources.importFromCommunity')}
          </button>
          <button
            onClick={() => setShowShareBundle(true)}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
          >
            <Share2 size={16} /> {t('resources.shareAsBundle')}
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus size={16} /> {t('resources.addResource')}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      {showAddForm && (
        <AddResourceForm
          onClose={() => setShowAddForm(false)}
          onCreated={() => {
            setShowAddForm(false);
            load();
          }}
        />
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
              <th className="px-6 py-4 font-medium">{t('resources.table.name')}</th>
              <th className="px-6 py-4 font-medium">{t('resources.table.type')}</th>
              <th className="px-6 py-4 font-medium">{t('resources.table.status')}</th>
              <th className="px-6 py-4 font-medium">{t('resources.table.artifacts')}</th>
              <th className="px-6 py-4 font-medium">{t('resources.table.llmAccess')}</th>
              <th className="px-6 py-4 font-medium text-right">{t('resources.table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!loading && resources.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">
                  {t('resources.empty')}
                </td>
              </tr>
            )}
            {resources.map((res) => (
              <tr
                key={res.id}
                className={`hover:bg-slate-50 transition-colors ${res.is_enabled ? '' : 'opacity-60'}`}
              >
                <td className="px-6 py-4">
                  {editingId === res.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        className="border border-slate-300 rounded px-2 py-1 text-sm"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        autoFocus
                      />
                      <button
                        onClick={() => saveEdit(res.id)}
                        className="text-xs text-blue-600 font-medium"
                      >
                        {t('resources.save')}
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-slate-400">
                        {t('resources.cancel')}
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="font-medium text-slate-900">{res.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {t('resources.addedOn', { date: new Date(res.created_at).toLocaleDateString() })}
                      </p>
                      {res.no_matching_pipeline && (
                        <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                          <AlertTriangle size={12} /> {t('resources.noMatchingPipeline')}
                        </p>
                      )}
                      {res.status === 'FAILED' && res.failure_reason && (
                        <p className="text-xs text-red-600 mt-1">{res.failure_reason}</p>
                      )}
                    </>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md text-xs font-medium border border-slate-200">
                    {res.type}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={res.status} />
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-2">
                    {res.artifacts.length > 0 ? (
                      res.artifacts.map((art) => (
                        <button
                          key={art.id}
                          onClick={() => setViewing({ resourceId: res.id, artifact: art })}
                          className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs border border-indigo-100 font-medium hover:bg-indigo-100 hover:border-indigo-200 transition-colors"
                          title={t('resources.viewResult')}
                        >
                          {art.type}
                        </button>
                      ))
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => handleToggleEnabled(res.id)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      res.is_enabled ? 'bg-blue-600' : 'bg-slate-200'
                    }`}
                    title={t(res.is_enabled ? 'resources.llmAccessOnTitle' : 'resources.llmAccessOffTitle')}
                    aria-pressed={res.is_enabled}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                        res.is_enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2 text-slate-400">
                    <button
                      onClick={() => handleReprocess(res.id)}
                      disabled={res.status === 'PROCESSING'}
                      className="p-1.5 hover:bg-slate-100 hover:text-blue-600 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
                      title={t('resources.reprocess')}
                    >
                      <Play size={16} />
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(res.id);
                        setEditingName(res.name);
                      }}
                      className="p-1.5 hover:bg-slate-100 hover:text-slate-900 rounded transition-colors"
                      title={t('resources.editMetadata')}
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(res.id)}
                      disabled={res.status === 'PROCESSING'}
                      className="p-1.5 hover:bg-red-50 hover:text-red-600 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
                      title={res.status === 'PROCESSING' ? t('resources.cannotDeleteProcessing') : t('resources.delete')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewing && (
        <ArtifactViewer
          resourceId={viewing.resourceId}
          artifact={viewing.artifact}
          onClose={() => setViewing(null)}
        />
      )}

      {showShareBundle && <ShareBundleModal onClose={() => setShowShareBundle(false)} />}
      {showImportBundle && (
        <ImportBundleModal
          onClose={() => setShowImportBundle(false)}
          onImported={() => {
            load();
          }}
        />
      )}
    </div>
  );
}

function AddResourceForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [type, setType] = useState<ResourceType>('MARKDOWN');
  const [sourceKind, setSourceKind] = useState<'UPLOAD' | 'URL'>('URL');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const source =
        sourceKind === 'URL' ? { kind: 'URL' as const, url } : { kind: 'UPLOAD' as const, file: file as File };
      await api.resources.create({ name, type, source });
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4"
    >
      <div className="flex justify-between items-center">
        <h4 className="font-semibold text-slate-900">{t('resources.form.title')}</h4>
        <button type="button" onClick={onClose} className="text-slate-400 text-sm">
          {t('resources.cancel')}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-4">
        <label className="text-sm text-slate-600">
          {t('resources.form.name')}
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-slate-600">
          {t('resources.form.type')}
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ResourceType)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            {RESOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={sourceKind === 'URL'} onChange={() => setSourceKind('URL')} /> {t('resources.form.sourceUrl')}
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={sourceKind === 'UPLOAD'} onChange={() => setSourceKind('UPLOAD')} />{' '}
          {t('resources.form.sourceFile')}
        </label>
      </div>
      {sourceKind === 'URL' ? (
        <input
          required
          placeholder={t('resources.form.urlPlaceholder')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      ) : (
        <input
          required
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full text-sm"
        />
      )}
      <button
        type="submit"
        disabled={submitting}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
      >
        {submitting ? t('resources.form.registering') : t('resources.form.register')}
      </button>
    </form>
  );
}
