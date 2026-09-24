// Public page: check a claim's status without logging in (claim number + last 4 digits of phone).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../api';
import Field from '../components/Field';
import Timeline from '../components/Timeline';
import { StatusBadge } from '../components/Badges';
import { formatDate, rupees } from '../utils/format';

export default function TrackClaim() {
  const { t, i18n } = useTranslation();
  const [claimNumber, setClaimNumber] = useState('');
  const [phoneLast4, setPhoneLast4] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const { data } = await api.get('/public/track', { params: { claimNumber: claimNumber.trim(), phoneLast4 } });
      setResult(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="narrow stack">
      <div className="card">
        <h1>{t('track.title')}</h1>
        <p className="muted">{t('track.subtitle')}</p>
        <form onSubmit={handleSubmit}>
          <Field label={t('track.claimNumber')} hint={t('track.claimNumberHint')}>
            <input value={claimNumber} onChange={(e) => setClaimNumber(e.target.value)} placeholder="KS-2026-000001" required />
          </Field>
          <Field label={t('track.phoneLast4')}>
            <input
              value={phoneLast4}
              onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              pattern="\d{4}"
              required
            />
          </Field>
          <button className="btn" disabled={loading}>
            {loading ? t('common.searching') : t('track.submit')}
          </button>
        </form>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {result && (
        <div className="card">
          <div className="spread">
            <h2>{result.claimNumber}</h2>
            <StatusBadge status={result.status} />
          </div>
          <dl className="kv" style={{ marginBottom: '1rem' }}>
            <dt>{t('claim.crop')}</dt>
            <dd>{result.cropName}</dd>
            <dt>{t('claim.cause')}</dt>
            <dd>{t(`cause.${result.causeOfLoss}`)}</dd>
            <dt>{t('claim.submittedOn')}</dt>
            <dd>{formatDate(result.submittedAt, i18n.language)}</dd>
            {result.amountApproved != null && (
              <>
                <dt>{t('claim.amountApproved')}</dt>
                <dd>{rupees(result.amountApproved)}</dd>
              </>
            )}
          </dl>
          <Timeline items={result.timeline} />
        </div>
      )}
    </div>
  );
}
