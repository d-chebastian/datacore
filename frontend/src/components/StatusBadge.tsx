import { useTranslation } from 'react-i18next';
import { CheckCircle2, AlertCircle, Clock, HelpCircle } from 'lucide-react';
import { ResourceStatus } from '../services/apiClient';

const styles: Record<ResourceStatus, string> = {
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PROCESSING: 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse',
  FAILED: 'bg-red-50 text-red-700 border-red-200',
  PENDING: 'bg-slate-50 text-slate-600 border-slate-200',
};

const icons: Record<ResourceStatus, React.ReactNode> = {
  COMPLETED: <CheckCircle2 size={14} />,
  PROCESSING: <Clock size={14} />,
  FAILED: <AlertCircle size={14} />,
  PENDING: <HelpCircle size={14} />,
};

const labelKeys: Record<ResourceStatus, string> = {
  COMPLETED: 'status.completed',
  PROCESSING: 'status.processing',
  FAILED: 'status.failed',
  PENDING: 'status.pending',
};

export default function StatusBadge({ status }: { status: ResourceStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${styles[status]}`}
    >
      {icons[status]}
      {t(labelKeys[status])}
    </span>
  );
}
