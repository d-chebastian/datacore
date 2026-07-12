import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search, Plus, ExternalLink, Github } from 'lucide-react';
import { registryApi, communityAuthApi, PluginListing, PublicUser } from '../services/registryClient';
import CommunityLoginModal from './CommunityLoginModal';

export default function CommunityPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [listings, setListings] = useState<PluginListing[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [showLogin, setShowLogin] = useState(false);

  const load = (q?: string) => {
    registryApi
      .list(q)
      .then(setListings)
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
    communityAuthApi
      .me()
      .then(({ user: u }) => setUser(u))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => load(query || undefined), 250);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200">
          <div>
            <h4 className="font-semibold text-slate-900">{t('community.panelTitle')}</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('community.panelSubtitle')}{' '}
              <a
                href="http://localhost:5273"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                {t('community.openFullSite')}
              </a>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('community.searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <button
            onClick={() => (user ? setShowForm((s) => !s) : setShowLogin(true))}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 shrink-0"
          >
            <Plus size={14} /> {t('community.postPlugin')}
          </button>
        </div>

        <div className="p-6 overflow-auto space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}

          {showForm && user && (
            <PostListingForm
              onClose={() => setShowForm(false)}
              onPosted={() => {
                setShowForm(false);
                load(query || undefined);
              }}
            />
          )}

          {listings.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">{t('community.empty')}</p>
          ) : (
            listings.map((listing) => (
              <div key={listing.id} className="border border-slate-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h5 className="font-semibold text-slate-900">{listing.name}</h5>
                    <p className="text-xs text-slate-500">
                      {t('community.versionByAuthor', { version: listing.version, author: listing.author })}
                    </p>
                  </div>
                  <a
                    href={listing.repo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-400 hover:text-blue-600 flex items-center gap-1 text-xs shrink-0"
                  >
                    <Github size={14} /> {t('community.repo')} <ExternalLink size={12} />
                  </a>
                </div>
                <p className="text-sm text-slate-600 mt-2">{listing.description}</p>
                {listing.docker_image && (
                  <p className="text-xs text-slate-400 mt-2 font-mono">{listing.docker_image}</p>
                )}
                {listing.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {listing.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] border border-slate-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
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

function PostListingForm({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [repoUrl, setRepoUrl] = useState('');
  const [dockerImage, setDockerImage] = useState('');
  const [tags, setTags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await registryApi.create({
        name,
        description,
        version,
        repo_url: repoUrl,
        docker_image: dockerImage || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      onPosted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <input
        required
        placeholder={t('community.form.namePlaceholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
      />
      <textarea
        required
        placeholder={t('community.form.descriptionPlaceholder')}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
      />
      <div className="grid grid-cols-2 gap-3">
        <input
          required
          placeholder={t('community.form.repoUrlPlaceholder')}
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          required
          placeholder={t('community.form.versionPlaceholder')}
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <input
        placeholder={t('community.form.dockerImagePlaceholder')}
        value={dockerImage}
        onChange={(e) => setDockerImage(e.target.value)}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
      />
      <input
        placeholder={t('community.form.tagsPlaceholder')}
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {submitting ? t('community.form.posting') : t('community.form.post')}
        </button>
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">
          {t('community.form.cancel')}
        </button>
      </div>
    </form>
  );
}
