import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { setLanguage } from '../i18n';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  return (
    <div className="relative flex items-center gap-1.5 text-slate-400">
      <Languages size={16} />
      <select
        value={i18n.language}
        onChange={(e) => setLanguage(e.target.value as 'en' | 'ja')}
        className="bg-transparent text-sm text-slate-600 outline-none cursor-pointer"
        aria-label="Language"
      >
        <option value="en">English</option>
        <option value="ja">日本語</option>
      </select>
    </div>
  );
}
