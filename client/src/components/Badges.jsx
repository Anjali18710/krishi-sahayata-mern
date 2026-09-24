// Coloured labels for claim status and weather-check verdict.
// Colour is never the only signal: the text label is always shown too.
import { useTranslation } from 'react-i18next';

const STATUS_TONE = {
  submitted: 'badge-info',
  under_review: 'badge-info',
  field_verification: 'badge-warn',
  approved: 'badge-good',
  rejected: 'badge-bad',
  disbursed: 'badge-good',
};

const VERDICT_TONE = {
  consistent: 'badge-good',
  inconclusive: 'badge-warn',
  inconsistent: 'badge-bad',
  not_applicable: '',
};

export function StatusBadge({ status }) {
  const { t } = useTranslation();
  return <span className={`badge ${STATUS_TONE[status] || ''}`}>{t(`status.${status}`)}</span>;
}

export function VerdictBadge({ weatherCheck }) {
  const { t } = useTranslation();
  if (!weatherCheck || weatherCheck.status === 'pending' || !weatherCheck.verdict) {
    return <span className="badge">{t('verdict.pending')}</span>;
  }
  return <span className={`badge ${VERDICT_TONE[weatherCheck.verdict] || ''}`}>{t(`verdict.${weatherCheck.verdict}`)}</span>;
}

export function OverdueBadge() {
  const { t } = useTranslation();
  return <span className="badge badge-bad">{t('claim.overdue')}</span>;
}
