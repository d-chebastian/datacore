import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { communityAuthApi, PublicUser } from '../services/registryClient';

export default function CommunityLoginModal({
  onClose,
  onAuthenticated,
}: {
  onClose: () => void;
  onAuthenticated: (user: PublicUser) => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const { user } = await communityAuthApi.login(email, password);
        onAuthenticated(user);
      } else {
        const { user, message: msg } = await communityAuthApi.register(email, username, password);
        setMessage(msg);
        onAuthenticated(user);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h4 className="font-semibold text-slate-900">
            {mode === 'login' ? t('communityLogin.loginTitle') : t('communityLogin.registerTitle')}
          </h4>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-3">{t('communityLogin.subtitle')}</p>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        {message && <p className="text-sm text-emerald-600 mb-3">{message}</p>}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required
            type="email"
            placeholder={t('communityLogin.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          {mode === 'register' && (
            <input
              required
              placeholder={t('communityLogin.usernamePlaceholder')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              pattern="[a-zA-Z0-9_-]{3,30}"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          )}
          <input
            required
            type="password"
            placeholder={t('communityLogin.passwordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {submitting ? t('communityLogin.pleaseWait') : mode === 'login' ? t('communityLogin.login') : t('communityLogin.createAccount')}
          </button>
        </form>

        <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="mt-3 text-xs text-slate-500 hover:underline">
          {mode === 'login' ? t('communityLogin.needAccount') : t('communityLogin.alreadyHaveAccount')}
        </button>
      </div>
    </div>
  );
}
