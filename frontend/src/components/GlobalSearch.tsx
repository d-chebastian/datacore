import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { api, Resource } from '../services/apiClient';

export default function GlobalSearch({ onNavigateToResources }: { onNavigateToResources: () => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Resource[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    const handle = setTimeout(() => {
      api.resources
        .list(query.trim())
        .then((res) => {
          setResults(res);
          setOpen(true);
        })
        .catch(() => setResults([]));
    }, 150);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('search.placeholder')}
        className="pl-10 pr-4 py-2 bg-slate-100 border-transparent rounded-lg text-sm focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-200 transition-all outline-none w-64"
      />
      {open && (
        <div className="absolute top-full mt-2 right-0 w-80 bg-white rounded-lg shadow-lg border border-slate-200 z-20 max-h-80 overflow-auto">
          {results.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">{t('search.noMatch', { query })}</p>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  onNavigateToResources();
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0"
              >
                <p className="font-medium text-slate-900 text-sm">{r.name}</p>
                <p className="text-xs text-slate-500">
                  {r.type} · {r.status}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
