import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Blocks } from 'lucide-react';
import { api, Plugin } from '../services/apiClient';
import CommunityPanel from '../components/CommunityPanel';

export default function PluginsView() {
  const { t } = useTranslation();
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCommunity, setShowCommunity] = useState(false);

  const load = () => api.plugins.list().then(setPlugins).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  async function togglePlugin(id: string) {
    setError(null);
    try {
      await api.plugins.toggle(id);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-slate-900">{t('plugins.title')}</h3>
          <p className="text-sm text-slate-500">{t('plugins.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowCommunity(true)}
          className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
        >
          <Blocks size={16} /> {t('plugins.browseCommunity')}
        </button>
      </div>

      {showCommunity && <CommunityPanel onClose={() => setShowCommunity(false)} />}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        {plugins.map((plugin) => (
          <div
            key={plugin.id}
            className={`bg-white rounded-xl shadow-sm border p-6 flex flex-col transition-all duration-300 ${
              plugin.is_active ? 'border-blue-200 ring-1 ring-blue-50/50' : 'border-slate-200 opacity-75 grayscale-[20%]'
            }`}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shadow-inner ${
                    plugin.is_active ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <Blocks size={20} />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900">{plugin.name}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t('plugins.versionByAuthor', { version: plugin.version, author: plugin.author })}
                  </p>
                </div>
              </div>

              <button
                onClick={() => togglePlugin(plugin.id)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  plugin.is_active ? 'bg-blue-600' : 'bg-slate-200'
                }`}
                aria-pressed={plugin.is_active}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                    plugin.is_active ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <p className="text-sm text-slate-600 flex-1 mb-6 leading-relaxed">{plugin.description}</p>

            <div className="flex justify-between items-center border-t border-slate-100 pt-4 mt-auto">
              <span
                className={`text-xs font-medium px-2.5 py-1 rounded-md border ${
                  plugin.is_active
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}
              >
                {plugin.is_active ? t('plugins.listening') : t('plugins.offline')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
