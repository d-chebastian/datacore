import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, Workflow, Blocks } from 'lucide-react';
import GlobalSearch from './components/GlobalSearch';
import LanguageSwitcher from './components/LanguageSwitcher';
import ResourcesView from './pages/ResourcesView';
import PipelinesView from './pages/PipelinesView';
import PluginsView from './pages/PluginsView';

type Tab = 'resources' | 'pipelines' | 'plugins';

export default function DataCoreApp() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('resources');

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar Navigation */}
      <div className="w-64 bg-slate-900 text-white flex flex-col shadow-xl z-10">
        <div className="p-6">
          <h1 className="text-xl font-bold flex items-center gap-2 text-blue-400">
            <Database size={24} />
            {t('app.title')}
          </h1>
          <p className="text-xs text-slate-400 mt-1">{t('app.subtitle')}</p>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <NavItem
            icon={<Database size={18} />}
            label={t('app.nav.resources')}
            isActive={activeTab === 'resources'}
            onClick={() => setActiveTab('resources')}
          />
          <NavItem
            icon={<Workflow size={18} />}
            label={t('app.nav.pipelines')}
            isActive={activeTab === 'pipelines'}
            onClick={() => setActiveTab('pipelines')}
          />
          <NavItem
            icon={<Blocks size={18} />}
            label={t('app.nav.plugins')}
            isActive={activeTab === 'plugins'}
            onClick={() => setActiveTab('plugins')}
          />
        </nav>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto">
        <header className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center sticky top-0 z-0 shadow-sm">
          <h2 className="text-2xl font-semibold">{t('app.management', { tab: t(`app.nav.${activeTab}`) })}</h2>
          <div className="flex items-center gap-4">
            <GlobalSearch onNavigateToResources={() => setActiveTab('resources')} />
            <LanguageSwitcher />
          </div>
        </header>

        <main className="p-8 max-w-7xl mx-auto">
          {activeTab === 'resources' && <ResourcesView />}
          {activeTab === 'pipelines' && <PipelinesView />}
          {activeTab === 'plugins' && <PluginsView />}
        </main>
      </div>
    </div>
  );
}

function NavItem({
  icon,
  label,
  isActive,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm font-medium ${
        isActive ? 'bg-blue-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
