// Admin page: maximum payout per acre for each crop.
// Officers see a warning on claims above the limit. Limits are entered by admins (e.g. from the
// scheme's official rates) - the app has no built-in rates.
//
// Two-person rule: an admin only PROPOSES a change; a DIFFERENT admin must approve it.
// Every proposal, approval and rejection is kept in a permanent history shown at the bottom.
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage, fieldErrors } from '../../api';
import { useAuth } from '../../context/AuthContext';
import Field from '../../components/Field';
import { formatDateTime, rupees } from '../../utils/format';

const EMPTY = { crop: '', maxPerAcre: '' };
const money = (v) => (v == null ? '—' : rupees(v));

export default function CropLimits() {
  const { t, i18n } = useTranslation();
  const { user: me } = useAuth();
  const [limits, setLimits] = useState([]);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    Promise.all([api.get('/crop-limits'), api.get('/crop-limits/history')])
      .then(([l, h]) => {
        setLimits(l.data.limits);
        setHistory(h.data.history);
      })
      .catch((err) => setMessage({ type: 'error', text: errorMessage(err) }));
  }, []);

  useEffect(load, [load]);

  async function run(request, successText) {
    setMessage(null);
    try {
      await request();
      if (successText) setMessage({ type: 'success', text: successText });
      load();
      return true;
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage({ type: 'error', text: errorMessage(err) });
      return false;
    }
  }

  async function propose(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const ok = await run(
      () => api.post('/crop-limits/proposals', { crop: form.crop, maxPerAcre: Number(form.maxPerAcre) }),
      t('cropLimits.proposed', { crop: form.crop.trim() })
    );
    if (ok) setForm(EMPTY);
    setBusy(false);
  }

  return (
    <div className="stack">
      <h1>{t('cropLimits.title')}</h1>
      <p className="muted">{t('cropLimits.intro')}</p>
      <div className="alert alert-info small">🔒 {t('cropLimits.twoAdminRule')}</div>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      {limits.length === 0 ? (
        <p className="muted">{t('cropLimits.none')}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('cropLimits.crop')}</th>
                <th>{t('cropLimits.current')}</th>
                <th>{t('cropLimits.pending')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {limits.map((l) => {
                const p = l.pending?.proposedBy ? l.pending : null;
                const mine = p && p.proposedBy === me._id;
                return (
                  <tr key={l._id}>
                    <td style={{ textTransform: 'capitalize' }}>{l.crop}</td>
                    <td>
                      {l.maxPerAcre == null ? <span className="muted">{t('cropLimits.notActive')}</span> : rupees(l.maxPerAcre)}
                    </td>
                    <td>
                      {p ? (
                        <span className="small">
                          <strong>{p.remove ? t('cropLimits.removeLimit') : rupees(p.maxPerAcre)}</strong>
                          <br />
                          {t('cropLimits.proposedBy', {
                            name: p.proposedByName,
                            when: formatDateTime(p.proposedAt, i18n.language),
                          })}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {p && !mine && (
                        <>
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => run(() => api.post(`/crop-limits/${l._id}/approve`), t('cropLimits.approvedMsg'))}
                          >
                            {t('cropLimits.approve')}
                          </button>{' '}
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => run(() => api.post(`/crop-limits/${l._id}/reject`), t('cropLimits.rejectedMsg'))}
                          >
                            {t('cropLimits.reject')}
                          </button>
                        </>
                      )}
                      {p && mine && (
                        <>
                          <span className="small muted">{t('cropLimits.waiting')} </span>
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => run(() => api.post(`/crop-limits/${l._id}/reject`), t('cropLimits.cancelledMsg'))}
                          >
                            {t('cropLimits.cancel')}
                          </button>
                        </>
                      )}
                      {!p && (
                        <>
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => setForm({ crop: l.crop, maxPerAcre: String(l.maxPerAcre ?? '') })}
                          >
                            {t('cropLimits.edit')}
                          </button>{' '}
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() =>
                              run(
                                () => api.post('/crop-limits/proposals', { crop: l.crop, remove: true }),
                                t('cropLimits.proposed', { crop: l.crop })
                              )
                            }
                          >
                            {t('cropLimits.remove')}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <form className="card" onSubmit={propose} style={{ maxWidth: 560 }}>
        <h2>{t('cropLimits.addTitle')}</h2>
        <div className="form-row">
          <Field label={t('cropLimits.crop')} hint={t('cropLimits.cropHint')} error={errors.crop}>
            <input value={form.crop} onChange={(e) => setForm({ ...form, crop: e.target.value })} required maxLength={60} />
          </Field>
          <Field label={t('cropLimits.maxPerAcre')} error={errors.maxPerAcre}>
            <input
              type="number"
              min="1"
              step="1"
              value={form.maxPerAcre}
              onChange={(e) => setForm({ ...form, maxPerAcre: e.target.value })}
              required
            />
          </Field>
        </div>
        <button className="btn" disabled={busy}>
          {busy ? t('common.pleaseWait') : t('cropLimits.propose')}
        </button>
      </form>

      <section className="card">
        <h2>{t('cropLimits.historyTitle')}</h2>
        <p className="small muted">{t('cropLimits.historyNote')}</p>
        {history.length === 0 ? (
          <p className="small muted">{t('cropLimits.noHistory')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('cropLimits.when')}</th>
                  <th>{t('cropLimits.crop')}</th>
                  <th>{t('cropLimits.action')}</th>
                  <th>{t('cropLimits.change')}</th>
                  <th>{t('cropLimits.byWhom')}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h._id}>
                    <td className="small">{formatDateTime(h.at, i18n.language)}</td>
                    <td style={{ textTransform: 'capitalize' }}>{h.crop}</td>
                    <td>{t(`cropLimits.actions.${h.action}`)}</td>
                    <td>
                      {money(h.oldValue)} → {money(h.newValue)}
                    </td>
                    <td>{h.byName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
