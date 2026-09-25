// One claim. Farmers see details and progress; officers/admins also get the weather check,
// AI summary, SMS log and the actions to move the claim forward.
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { OverdueBadge, StatusBadge, VerdictBadge } from '../components/Badges';
import Timeline from '../components/Timeline';
import SecureImage from '../components/SecureImage';
import Field from '../components/Field';
import { NEXT_STATUSES } from '../constants';
import { formatDate, formatDateTime, rupees } from '../utils/format';

const SCORE_COLOR = { consistent: 'var(--good)', inconclusive: 'var(--warn)', inconsistent: 'var(--bad)' };

function WeatherCheckCard({ claim, canRerun, onUpdated }) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const wc = claim.weatherCheck || {};

  async function rerun() {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/claims/${claim._id}/weather-check`);
      onUpdated({ weatherCheck: data.weatherCheck });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="spread">
        <h2>{t('weatherCheck.title')}</h2>
        <VerdictBadge weatherCheck={wc} />
      </div>
      <p className="small muted">{t('weatherCheck.explain')}</p>
      {wc.score != null && (
        <div style={{ margin: '0.6rem 0' }}>
          <div className="spread small">
            <span>{t('weatherCheck.score')}</span>
            <strong>{wc.score} / 100</strong>
          </div>
          <div className="scorebar" role="img" aria-label={`${t('weatherCheck.score')} ${wc.score} / 100`}>
            <span style={{ width: `${wc.score}%`, background: SCORE_COLOR[wc.verdict] || 'var(--ink-3)' }} />
          </div>
        </div>
      )}
      {wc.reasons?.length > 0 && (
        <ul className="small" style={{ paddingLeft: '1.1rem' }}>
          {wc.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {wc.checkedAt && (
        <p className="small muted">
          {t('weatherCheck.checkedAt', { date: formatDateTime(wc.checkedAt, i18n.language) })}
          {wc.metrics?.from && ` · ${wc.metrics.from} → ${wc.metrics.to}`}
          {wc.source && ` · Open-Meteo ${wc.source}`}
        </p>
      )}
      {wc.status === 'pending' && <p className="small muted">{t('weatherCheck.pending')}</p>}
      {error && <div className="alert alert-error">{error}</div>}
      {canRerun && (
        <button type="button" className="btn btn-secondary btn-small" onClick={rerun} disabled={busy}>
          {busy ? t('common.pleaseWait') : t('weatherCheck.rerun')}
        </button>
      )}
    </section>
  );
}

function AiSummaryCard({ claim, enabled, onUpdated }) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/claims/${claim._id}/ai-summary`);
      onUpdated({ aiSummary: data.aiSummary });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>{t('ai.title')}</h2>
      {claim.aiSummary?.text ? (
        <>
          <div className="ai-text">{claim.aiSummary.text}</div>
          <p className="small muted">
            {claim.aiSummary.provider} · {claim.aiSummary.model} · {formatDateTime(claim.aiSummary.generatedAt, i18n.language)}
          </p>
        </>
      ) : (
        <p className="small muted">{enabled ? t('ai.none') : t('ai.disabled')}</p>
      )}
      <p className="small muted">{t('ai.disclaimer')}</p>
      {error && <div className="alert alert-error">{error}</div>}
      {enabled && (
        <button type="button" className="btn btn-secondary btn-small" onClick={generate} disabled={busy}>
          {busy ? t('common.pleaseWait') : claim.aiSummary?.text ? t('ai.regenerate') : t('ai.generate')}
        </button>
      )}
    </section>
  );
}

function ActionsCard({ claim, user, onUpdated }) {
  const { t } = useTranslation();
  const [to, setTo] = useState('');
  const [remark, setRemark] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  let options = NEXT_STATUSES[claim.status] || [];
  if (user.role !== 'admin') options = options.filter((s) => s !== 'disbursed');
  const assignedToMe = claim.assignedOfficer?._id === user._id;
  if (user.role === 'officer' && !assignedToMe) {
    return (
      <section className="card">
        <p className="small muted">{t('actions.notAssigned')}</p>
      </section>
    );
  }
  if (options.length === 0) return null;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { to, remark: remark || undefined };
      if (to === 'approved') body.amountApproved = Number(amount);
      const { data } = await api.patch(`/claims/${claim._id}/status`, body);
      onUpdated(data.claim, true);
      setTo('');
      setRemark('');
      setAmount('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>{t('actions.title')}</h2>
      <form onSubmit={submit}>
        <Field label={t('actions.moveTo')}>
          <select value={to} onChange={(e) => setTo(e.target.value)} required>
            <option value="">{t('common.select')}</option>
            {options.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        </Field>
        {to === 'approved' && (
          <Field label={t('actions.amountApproved')} hint={t('actions.maxAmount', { amount: rupees(claim.amountClaimed) })}>
            <input
              type="number"
              min="1"
              max={claim.amountClaimed}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Field>
        )}
        <Field label={to === 'rejected' ? t('actions.reasonRequired') : t('actions.remark')}>
          <textarea value={remark} onChange={(e) => setRemark(e.target.value)} maxLength={500} required={to === 'rejected'} />
        </Field>
        <p className="small muted">{t('actions.smsNote')}</p>
        {error && (
          <div className="alert alert-error" style={{ marginBottom: '0.8rem' }}>
            {error}
          </div>
        )}
        <button className={`btn${to === 'rejected' ? ' btn-danger' : ''}`} disabled={busy || !to}>
          {busy ? t('common.pleaseWait') : t('actions.update')}
        </button>
      </form>
    </section>
  );
}

function AssignCard({ claim, onUpdated }) {
  const { t } = useTranslation();
  const [officers, setOfficers] = useState([]);
  const [officerId, setOfficerId] = useState(claim.assignedOfficer?._id || '');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/users', { params: { role: 'officer' } })
      .then((res) => setOfficers(res.data.users.filter((u) => u.isActive)))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  async function assign() {
    setError('');
    try {
      const { data } = await api.patch(`/claims/${claim._id}/assign`, { officerId });
      onUpdated(data.claim, true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="card">
      <h2>{t('assign.title')}</h2>
      <div className="row">
        <select
          value={officerId}
          onChange={(e) => setOfficerId(e.target.value)}
          style={{ flex: 1 }}
          aria-label={t('assign.title')}
        >
          <option value="">{t('common.select')}</option>
          {officers.map((o) => (
            <option key={o._id} value={o._id}>
              {o.name} ({o.district})
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-small"
          onClick={assign}
          disabled={!officerId || officerId === claim.assignedOfficer?._id}
        >
          {t('assign.submit')}
        </button>
      </div>
      {error && (
        <div className="alert alert-error" style={{ marginTop: '0.6rem' }}>
          {error}
        </div>
      )}
    </section>
  );
}

// Under "Amount claimed": the per-acre amount and, if the admin set one, the crop's limit.
// Only a hint for the officer - it never decides the claim.
function AmountHint({ check }) {
  const { t } = useTranslation();
  if (check.limit == null) {
    return <div className="small muted">{t('amountCheck.noLimit', { perAcre: rupees(check.perAcre), crop: check.crop })}</div>;
  }
  return (
    <div
      className="small"
      style={{ color: check.overLimit ? 'var(--bad)' : 'var(--good)', fontWeight: check.overLimit ? 600 : 400 }}
    >
      {check.overLimit
        ? `⚠ ${t('amountCheck.over', { ratio: check.ratio, perAcre: rupees(check.perAcre), limit: rupees(check.limit), max: rupees(check.maxAllowed) })}`
        : `✓ ${t('amountCheck.within', { perAcre: rupees(check.perAcre), limit: rupees(check.limit) })}`}
    </div>
  );
}

export default function ClaimDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { user, config } = useAuth();
  const location = useLocation();
  const [claim, setClaim] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [amountCheck, setAmountCheck] = useState(null); // staff only: claimed amount vs the crop's per-acre limit
  const [error, setError] = useState('');
  const isStaff = user.role !== 'farmer';

  const load = useCallback(() => {
    api
      .get(`/claims/${id}`)
      .then((res) => {
        setClaim(res.data.claim);
        setNotifications(res.data.notifications || []);
        setAmountCheck(res.data.amountCheck || null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  useEffect(load, [load]);

  // Partial update (weather check / AI summary) or a full claim from the API
  function handleUpdated(update, reload = false) {
    setClaim((c) => ({ ...c, ...update }));
    if (reload) load();
  }

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!claim) return <p className="muted">{t('common.loading')}</p>;

  const lang = i18n.language;

  return (
    <div className="stack">
      <p className="small">
        <Link to={isStaff ? '/staff' : '/farmer'}>← {t('common.backToList')}</Link>
      </p>
      {location.state?.justFiled && (
        <div className="alert alert-success">{t('claim.filedSuccess', { number: claim.claimNumber })}</div>
      )}

      <div className="spread">
        <h1 style={{ margin: 0 }}>{claim.claimNumber}</h1>
        <div className="row">
          {claim.isOverdue && isStaff && <OverdueBadge />}
          <StatusBadge status={claim.status} />
        </div>
      </div>

      <div className="grid-2">
        <div className="stack">
          <section className="card">
            <h2>{t('claim.details')}</h2>
            <dl className="kv">
              {isStaff && (
                <>
                  <dt>{t('claim.farmer')}</dt>
                  <dd>
                    {claim.farmerName} · {claim.farmerPhone}
                  </dd>
                </>
              )}
              <dt>{t('claim.crop')}</dt>
              <dd>
                {claim.crop.name} · {t(`season.${claim.crop.season}`)} · {claim.crop.areaAcres} {t('claim.acres')}
              </dd>
              <dt>{t('claim.cause')}</dt>
              <dd>{t(`cause.${claim.causeOfLoss}`)}</dd>
              <dt>{t('claim.lossDate')}</dt>
              <dd>{formatDate(claim.lossDate, lang)}</dd>
              <dt>{t('claim.submittedOn')}</dt>
              <dd>{formatDate(claim.submittedAt, lang)}</dd>
              <dt>{t('claim.amountClaimed')}</dt>
              <dd>
                {rupees(claim.amountClaimed)}
                {isStaff && amountCheck && <AmountHint check={amountCheck} />}
              </dd>
              {claim.amountApproved != null && (
                <>
                  <dt>{t('claim.amountApproved')}</dt>
                  <dd>{rupees(claim.amountApproved)}</dd>
                </>
              )}
              <dt>{t('claim.location')}</dt>
              <dd>
                {[claim.location.village, claim.location.district, claim.location.state].filter(Boolean).join(', ')}
                <div className="small muted">
                  {claim.location.latitude.toFixed(4)}, {claim.location.longitude.toFixed(4)}
                </div>
              </dd>
              <dt>{t('claim.bank')}</dt>
              <dd>
                {claim.bank.bankName} · {claim.bank.ifsc} · ****{claim.bank.accountLast4}
                {isStaff && claim.bank.ifscVerified != null && (
                  <div className="small" style={{ color: claim.bank.ifscVerified ? 'var(--good)' : 'var(--warn)' }}>
                    {claim.bank.ifscVerified
                      ? `✓ ${t('claim.ifscVerified')}${claim.bank.branch ? ` · ${claim.bank.branch}` : ''}`
                      : t('claim.ifscNotVerified')}
                  </div>
                )}
              </dd>
              <dt>{t('claim.officer')}</dt>
              <dd>
                {claim.assignedOfficer
                  ? `${claim.assignedOfficer.name} (${claim.assignedOfficer.district})`
                  : t('claim.unassigned')}
              </dd>
            </dl>
            {claim.description && (
              <p style={{ marginBottom: 0 }}>
                <strong>{t('claim.description')}:</strong> {claim.description}
              </p>
            )}
          </section>

          <section className="card">
            <h2>{t('claim.photos')}</h2>
            {claim.photos.length === 0 ? (
              <p className="small muted">{t('claim.noPhotos')}</p>
            ) : (
              <div className="photos">
                {claim.photos.map((p) => (
                  <SecureImage key={p.fileId} fileId={p.fileId} alt={p.filename} />
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h2>{t('claim.progress')}</h2>
            <Timeline items={claim.statusHistory} showActor={isStaff} />
          </section>
        </div>

        <div className="stack">
          {isStaff && <ActionsCard claim={claim} user={user} onUpdated={handleUpdated} />}
          {user.role === 'admin' && <AssignCard claim={claim} onUpdated={handleUpdated} />}
          {isStaff && <WeatherCheckCard claim={claim} canRerun onUpdated={handleUpdated} />}
          {isStaff && <AiSummaryCard claim={claim} enabled={config.aiEnabled} onUpdated={handleUpdated} />}
          {isStaff && (
            <section className="card">
              <h2>{t('sms.title')}</h2>
              {notifications.length === 0 ? (
                <p className="small muted">{t('sms.none')}</p>
              ) : (
                <ul className="small" style={{ paddingLeft: '1.1rem', margin: 0 }}>
                  {notifications.map((n) => (
                    <li key={n._id} style={{ marginBottom: '0.5rem' }}>
                      <strong>{t(`sms.status.${n.status}`)}</strong> · {formatDateTime(n.createdAt, lang)}
                      <div>{n.body}</div>
                      {n.error && <div style={{ color: 'var(--bad)' }}>{n.error}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
