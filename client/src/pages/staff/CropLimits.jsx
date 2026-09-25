// Admin page: maximum payout per acre for each crop.
// Officers then see a warning on claims that ask for more than this. The limits are
// entered by the admin (e.g. from the scheme's official rates) - the app has no built-in rates.
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage, fieldErrors } from '../../api';
import Field from '../../components/Field';
import { rupees } from '../../utils/format';

const EMPTY = { crop: '', maxPerAcre: '' };

export default function CropLimits() {
  const { t } = useTranslation();
  const [limits, setLimits] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get('/crop-limits')
      .then((res) => setLimits(res.data.limits))
      .catch((err) => setMessage({ type: 'error', text: errorMessage(err) }));
  }, []);

  useEffect(load, [load]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      await api.put('/crop-limits', { crop: form.crop, maxPerAcre: Number(form.maxPerAcre) });
      setMessage({ type: 'success', text: t('cropLimits.saved', { crop: form.crop.trim() }) });
      setForm(EMPTY);
      load();
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(limit) {
    try {
      await api.delete(`/crop-limits/${limit._id}`);
      load();
    } catch (err) {
      setMessage({ type: 'error', text: errorMessage(err) });
    }
  }

  return (
    <div className="stack">
      <h1>{t('cropLimits.title')}</h1>
      <p className="muted">{t('cropLimits.intro')}</p>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      {limits.length === 0 ? (
        <p className="muted">{t('cropLimits.none')}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('cropLimits.crop')}</th>
                <th>{t('cropLimits.maxPerAcre')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {limits.map((l) => (
                <tr key={l._id}>
                  <td style={{ textTransform: 'capitalize' }}>{l.crop}</td>
                  <td>{rupees(l.maxPerAcre)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => setForm({ crop: l.crop, maxPerAcre: String(l.maxPerAcre) })}
                    >
                      {t('cropLimits.edit')}
                    </button>{' '}
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => remove(l)}>
                      {t('cropLimits.remove')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="card" onSubmit={save} style={{ maxWidth: 560 }}>
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
          {busy ? t('common.pleaseWait') : t('cropLimits.save')}
        </button>
      </form>
    </div>
  );
}
