import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Edit, Trash2, ArrowUp, ArrowDown, X } from 'lucide-react';
import { api, Pipeline, PipelineStep, Plugin, ResourceType } from '../services/apiClient';

const RESOURCE_TYPES: ResourceType[] = ['PDF', 'GITHUB_REPO', 'CSV', 'AUDIO', 'MARKDOWN'];

export default function PipelinesView() {
  const { t } = useTranslation();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [editing, setEditing] = useState<Pipeline | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.pipelines.list().then(setPipelines).catch((e) => setError(e.message));
    api.plugins.list().then(setPlugins).catch(() => undefined);
  };

  useEffect(load, []);

  async function handleDelete(id: string) {
    await api.pipelines.remove(id);
    load();
  }

  const pluginName = (id: string) => plugins.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-slate-900">{t('pipelines.title')}</h3>
          <p className="text-sm text-slate-500">{t('pipelines.subtitle')}</p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
        >
          <Plus size={16} /> {t('pipelines.create')}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      {editing && (
        <PipelineEditor
          pipeline={editing === 'new' ? null : editing}
          plugins={plugins}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
          onError={setError}
        />
      )}

      <div className="grid grid-cols-1 gap-6">
        {pipelines.map((pipeline) => (
          <div
            key={pipeline.id}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <h4 className="font-semibold text-slate-900 text-lg">{pipeline.name}</h4>
                <p className="text-sm text-slate-500 mt-1">
                  {t('pipelines.triggersOn')}{' '}
                  <span className="font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                    {pipeline.trigger_type}
                  </span>
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(pipeline)}
                  className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900 rounded-md transition-colors"
                >
                  <Edit size={16} />
                </button>
                <button
                  onClick={() => handleDelete(pipeline.id)}
                  className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-md transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {pipeline.steps
                .sort((a, b) => a.position - b.position)
                .map((step, index, arr) => (
                  <div key={step.id ?? index} className="flex items-center gap-2">
                    <div className="flex-shrink-0 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm font-medium text-blue-800 shadow-sm">
                      {pluginName(step.plugin_id)}
                      <span className="block text-[10px] font-normal text-blue-500">
                        {t('pipelines.attemptsTimeout', {
                          attempts: step.max_attempts ?? 1,
                          timeout: step.timeout_seconds ?? 300,
                        })}
                      </span>
                    </div>
                    {index < arr.length - 1 && <div className="flex-shrink-0 h-[2px] w-8 bg-slate-200" />}
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineEditor({
  pipeline,
  plugins,
  onClose,
  onSaved,
  onError,
}: {
  pipeline: Pipeline | null;
  plugins: Plugin[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(pipeline?.name ?? '');
  const [triggerType, setTriggerType] = useState<ResourceType>(pipeline?.trigger_type ?? 'MARKDOWN');
  const [steps, setSteps] = useState<PipelineStep[]>(
    pipeline?.steps.slice().sort((a, b) => a.position - b.position) ?? [],
  );

  function addStep() {
    if (plugins.length === 0) return;
    setSteps((s) => [
      ...s,
      { position: s.length, plugin_id: plugins[0].id, max_attempts: 1, backoff_seconds: 0, timeout_seconds: 300 },
    ]);
  }

  function updateStep(i: number, patch: Partial<PipelineStep>) {
    setSteps((s) => s.map((step, idx) => (idx === i ? { ...step, ...patch } : step)));
  }

  function removeStep(i: number) {
    setSteps((s) => s.filter((_, idx) => idx !== i).map((step, idx) => ({ ...step, position: idx })));
  }

  function moveStep(i: number, dir: -1 | 1) {
    setSteps((s) => {
      const arr = [...s];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr.map((step, idx) => ({ ...step, position: idx }));
    });
  }

  async function handleSave() {
    try {
      const body = { name, trigger_type: triggerType, steps: steps.map((s, i) => ({ ...s, position: i })) };
      if (pipeline) {
        await api.pipelines.update(pipeline.id, body);
      } else {
        await api.pipelines.create(body);
      }
      onSaved();
    } catch (e) {
      onError((e as Error).message);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-semibold text-slate-900">{pipeline ? t('pipelines.editTitle') : t('pipelines.createTitle')}</h4>
        <button onClick={onClose} className="text-slate-400">
          <X size={18} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <label className="text-sm text-slate-600">
          {t('pipelines.name')}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-slate-600">
          {t('pipelines.triggerType')}
          <select
            value={triggerType}
            disabled={!!pipeline}
            onChange={(e) => setTriggerType(e.target.value as ResourceType)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100"
          >
            {RESOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <p className="text-sm font-medium text-slate-700">{t('pipelines.steps')}</p>
          <button onClick={addStep} type="button" className="text-xs text-blue-600 font-medium flex items-center gap-1">
            <Plus size={14} /> {t('pipelines.addStep')}
          </button>
        </div>
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2 border border-slate-200 rounded-lg p-3">
            <select
              value={step.plugin_id}
              onChange={(e) => updateStep(i, { plugin_id: e.target.value })}
              className="border border-slate-300 rounded px-2 py-1 text-sm flex-1"
            >
              {plugins.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={step.max_attempts ?? 1}
              onChange={(e) => updateStep(i, { max_attempts: Number(e.target.value) })}
              className="w-20 border border-slate-300 rounded px-2 py-1 text-sm"
              title={t('pipelines.maxAttemptsTitle')}
            />
            <input
              type="number"
              min={0}
              value={step.backoff_seconds ?? 0}
              onChange={(e) => updateStep(i, { backoff_seconds: Number(e.target.value) })}
              className="w-24 border border-slate-300 rounded px-2 py-1 text-sm"
              title={t('pipelines.backoffSecondsTitle')}
            />
            <input
              type="number"
              min={1}
              value={step.timeout_seconds ?? 300}
              onChange={(e) => updateStep(i, { timeout_seconds: Number(e.target.value) })}
              className="w-24 border border-slate-300 rounded px-2 py-1 text-sm"
              title={t('pipelines.timeoutSecondsTitle')}
            />
            <button onClick={() => moveStep(i, -1)} type="button" className="text-slate-400">
              <ArrowUp size={14} />
            </button>
            <button onClick={() => moveStep(i, 1)} type="button" className="text-slate-400">
              <ArrowDown size={14} />
            </button>
            <button onClick={() => removeStep(i)} type="button" className="text-red-400">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <p className="text-xs text-slate-400">{t('pipelines.columnsCaption')}</p>
      </div>

      <button
        onClick={handleSave}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
      >
        {t('pipelines.save')}
      </button>
    </div>
  );
}
