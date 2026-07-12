import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Loader2 } from 'lucide-react';
import { api, Artifact, ArtifactContent } from '../services/apiClient';

interface RepoAnalysisContent {
  username: string;
  scanned_at: string;
  repo_count: number;
  repos: {
    name: string;
    description: string | null;
    url: string;
    language: string | null;
    stars: number;
    forks: number;
    is_fork: boolean;
    updated_at: string;
  }[];
}

export default function ArtifactViewer({
  resourceId,
  artifact,
  onClose,
}: {
  resourceId: string;
  artifact: Artifact;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<ArtifactContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.resources
      .getArtifactContent(resourceId, artifact.id)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [resourceId, artifact.id]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200">
          <div>
            <h4 className="font-semibold text-slate-900">{artifact.type} artifact</h4>
            <p className="text-xs text-slate-500 mt-0.5">{artifact.external_ref}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-auto">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!data && !error && (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 size={16} className="animate-spin" /> {t('artifactViewer.loading')}
            </div>
          )}
          {data && data.content_type === 'text' && (
            <pre className="whitespace-pre-wrap text-sm text-slate-700 bg-slate-50 rounded-lg p-4 border border-slate-200">
              {data.content}
            </pre>
          )}
          {data && data.content_type === 'json' && <RepoAnalysisView content={data.content as RepoAnalysisContent} />}
          {data && data.content_type === 'vector' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                {t('artifactViewer.dimensionalVector', { count: data.content.dimensions })}
              </p>
              <pre className="text-xs text-slate-700 bg-slate-50 rounded-lg p-4 border border-slate-200 overflow-x-auto">
                [{data.content.vector?.map((v) => v.toFixed(4)).join(', ')}]
              </pre>
              {data.content.payload && (
                <pre className="text-xs text-slate-500 bg-slate-50 rounded-lg p-4 border border-slate-200">
                  {JSON.stringify(data.content.payload, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RepoAnalysisView({ content }: { content: RepoAnalysisContent }) {
  const { t } = useTranslation();
  if (!content?.repos) {
    return (
      <pre className="text-xs text-slate-700 bg-slate-50 rounded-lg p-4 border border-slate-200 overflow-x-auto">
        {JSON.stringify(content, null, 2)}
      </pre>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        {t('artifactViewer.scannedSummary', {
          count: content.repo_count,
          username: content.username,
          date: new Date(content.scanned_at).toLocaleString(),
        })}
      </p>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2 font-medium">{t('artifactViewer.repoTable.repo')}</th>
              <th className="px-4 py-2 font-medium">{t('artifactViewer.repoTable.language')}</th>
              <th className="px-4 py-2 font-medium text-right">{t('artifactViewer.repoTable.stars')}</th>
              <th className="px-4 py-2 font-medium text-right">{t('artifactViewer.repoTable.forks')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {content.repos.map((repo) => (
              <tr key={repo.name}>
                <td className="px-4 py-2">
                  <a
                    href={repo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {repo.name}
                  </a>
                  {repo.is_fork && (
                    <span className="ml-2 text-[10px] text-slate-400 border border-slate-200 rounded px-1">
                      {t('artifactViewer.fork')}
                    </span>
                  )}
                  {repo.description && <p className="text-xs text-slate-500 mt-0.5">{repo.description}</p>}
                </td>
                <td className="px-4 py-2 text-slate-600">{repo.language ?? '—'}</td>
                <td className="px-4 py-2 text-right text-slate-600">{repo.stars.toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-slate-600">{repo.forks.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
