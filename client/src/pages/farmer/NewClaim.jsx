// Multi-step form for filing a new claim: 1 crop & loss -> 2 farm location -> 3 bank -> 4 photos & review.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, errorMessage, fieldErrors } from '../../api';
import { useAuth } from '../../context/AuthContext';
import Field from '../../components/Field';
import PlacePicker from '../../components/PlacePicker';
import { CAUSES, SEASONS, STATES } from '../../constants';
import { rupees, todayISO } from '../../utils/format';

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

// Which step each field is on, so a server error can send the user back to the right step
const STEP_FIELDS = [
  ['cropName', 'season', 'areaAcres', 'causeOfLoss', 'lossDate', 'description', 'amountClaimed'],
  ['state', 'district', 'village', 'latitude', 'longitude'],
  ['accountHolderName', 'bankName', 'ifsc', 'accountNumber', 'confirmAccountNumber'],
  ['photos'],
];

export default function NewClaim() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    cropName: '',
    season: 'kharif',
    areaAcres: '',
    causeOfLoss: '',
    lossDate: '',
    description: '',
    amountClaimed: '',
    state: user.state || '',
    district: user.district || '',
    village: user.village || '',
    location: user.farmLocation?.latitude != null ? user.farmLocation : null,
    accountHolderName: user.name,
    bankName: '',
    ifsc: '',
    accountNumber: '',
    confirmAccountNumber: '',
  });
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const steps = [t('newClaim.steps.loss'), t('newClaim.steps.location'), t('newClaim.steps.bank'), t('newClaim.steps.review')];

  // Quick checks in the browser; the server checks everything again
  function validateStep(s) {
    const e = {};
    const required = (key) => {
      if (!String(form[key] ?? '').trim()) e[key] = t('validation.required');
    };
    if (s === 0) {
      ['cropName', 'areaAcres', 'causeOfLoss', 'lossDate', 'amountClaimed'].forEach(required);
      if (form.areaAcres && !(Number(form.areaAcres) > 0)) e.areaAcres = t('validation.positive');
      if (form.amountClaimed && !(Number(form.amountClaimed) >= 1)) e.amountClaimed = t('validation.positive');
    }
    if (s === 1) {
      ['state', 'district'].forEach(required);
      if (!form.location) e.latitude = t('newClaim.locationRequired');
    }
    if (s === 2) {
      ['accountHolderName', 'bankName', 'ifsc', 'accountNumber'].forEach(required);
      if (form.ifsc && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(form.ifsc.trim())) e.ifsc = t('validation.ifsc');
      if (form.accountNumber && !/^\d{9,18}$/.test(form.accountNumber)) e.accountNumber = t('validation.accountNumber');
      if (form.accountNumber !== form.confirmAccountNumber) e.confirmAccountNumber = t('validation.accountMismatch');
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (validateStep(step)) setStep(step + 1);
  }

  function addPhotos(e) {
    const chosen = Array.from(e.target.files || []);
    e.target.value = '';
    const tooBig = chosen.find((f) => f.size > MAX_PHOTO_BYTES);
    if (tooBig) {
      setErrors({ photos: t('newClaim.photoTooBig', { name: tooBig.name }) });
      return;
    }
    const combined = [...photos, ...chosen].slice(0, MAX_PHOTOS);
    setPhotos(combined.map((f) => (f.preview ? f : Object.assign(f, { preview: URL.createObjectURL(f) }))));
    setErrors({});
  }

  function removePhoto(index) {
    URL.revokeObjectURL(photos[index].preview);
    setPhotos(photos.filter((_, i) => i !== index));
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError('');
    // Photos are files, so the claim is sent as multipart/form-data instead of JSON
    const data = new FormData();
    const { location, confirmAccountNumber, ...fields } = form;
    Object.entries(fields).forEach(([k, v]) => data.append(k, typeof v === 'string' ? v.trim() : v));
    data.append('latitude', location.latitude);
    data.append('longitude', location.longitude);
    photos.forEach((p) => data.append('photos', p));

    try {
      const res = await api.post('/claims', data);
      navigate(`/claims/${res.data.claim._id}`, { replace: true, state: { justFiled: true } });
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      setSubmitError(errorMessage(err));
      const badStep = STEP_FIELDS.findIndex((fields) => fields.some((f) => fe[f]));
      if (badStep >= 0) setStep(badStep);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 760, margin: '0 auto' }}>
      <h1>{t('newClaim.title')}</h1>
      <ol className="steps">
        {steps.map((label, i) => (
          <li
            key={label}
            className={i === step ? 'current' : i < step ? 'done' : ''}
            aria-current={i === step ? 'step' : undefined}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {submitError && <div className="alert alert-error">{submitError}</div>}

      <div className="card">
        {step === 0 && (
          <>
            <div className="form-row">
              <Field label={t('newClaim.cropName')} hint={t('newClaim.cropHint')} error={errors.cropName}>
                <input value={form.cropName} onChange={set('cropName')} maxLength={60} />
              </Field>
              <Field label={t('newClaim.season')} error={errors.season}>
                <select value={form.season} onChange={set('season')}>
                  {SEASONS.map((s) => (
                    <option key={s} value={s}>
                      {t(`season.${s}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('newClaim.area')} error={errors.areaAcres}>
                <input type="number" step="0.01" min="0.01" value={form.areaAcres} onChange={set('areaAcres')} />
              </Field>
            </div>
            <div className="form-row">
              <Field label={t('newClaim.cause')} error={errors.causeOfLoss}>
                <select value={form.causeOfLoss} onChange={set('causeOfLoss')}>
                  <option value="">{t('common.select')}</option>
                  {CAUSES.map((c) => (
                    <option key={c} value={c}>
                      {t(`cause.${c}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('newClaim.lossDate')} hint={t('newClaim.lossDateHint')} error={errors.lossDate}>
                <input type="date" value={form.lossDate} onChange={set('lossDate')} max={todayISO()} />
              </Field>
              <Field label={t('newClaim.amount')} error={errors.amountClaimed}>
                <input type="number" min="1" value={form.amountClaimed} onChange={set('amountClaimed')} />
              </Field>
            </div>
            <Field label={t('newClaim.description')} hint={t('newClaim.descriptionHint')} error={errors.description}>
              <textarea value={form.description} onChange={set('description')} maxLength={1000} />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <div className="form-row">
              <Field label={t('register.state')} error={errors.state}>
                <select value={form.state} onChange={set('state')}>
                  <option value="">{t('common.select')}</option>
                  {STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('register.district')} error={errors.district}>
                <input value={form.district} onChange={set('district')} />
              </Field>
              <Field label={t('register.village')} error={errors.village}>
                <input value={form.village} onChange={set('village')} />
              </Field>
            </div>
            <div className={`field${errors.latitude ? ' has-error' : ''}`}>
              <label>{t('newClaim.farmLocation')}</label>
              <PlacePicker value={form.location} onChange={(place) => setForm({ ...form, location: place })} />
              {errors.latitude && <span className="error">{errors.latitude}</span>}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="small muted">{t('newClaim.bankNote')}</p>
            <div className="form-row">
              <Field label={t('newClaim.accountHolder')} error={errors.accountHolderName}>
                <input value={form.accountHolderName} onChange={set('accountHolderName')} />
              </Field>
              <Field label={t('newClaim.bankName')} error={errors.bankName}>
                <input value={form.bankName} onChange={set('bankName')} />
              </Field>
            </div>
            <Field label={t('newClaim.ifsc')} hint={t('newClaim.ifscHint')} error={errors.ifsc}>
              <input
                value={form.ifsc}
                onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })}
                maxLength={11}
              />
            </Field>
            <div className="form-row">
              <Field label={t('newClaim.accountNumber')} error={errors.accountNumber}>
                <input
                  value={form.accountNumber}
                  onChange={(e) => setForm({ ...form, accountNumber: e.target.value.replace(/\D/g, '') })}
                  inputMode="numeric"
                  autoComplete="off"
                />
              </Field>
              <Field label={t('newClaim.confirmAccountNumber')} error={errors.confirmAccountNumber}>
                <input
                  value={form.confirmAccountNumber}
                  onChange={(e) => setForm({ ...form, confirmAccountNumber: e.target.value.replace(/\D/g, '') })}
                  inputMode="numeric"
                  autoComplete="off"
                  onPaste={(e) => e.preventDefault()}
                />
              </Field>
            </div>
          </>
        )}

        {step === 3 && (
          <div className="stack">
            <div className={`field${errors.photos ? ' has-error' : ''}`}>
              <label htmlFor="photos">{t('newClaim.photos')}</label>
              <span className="hint">{t('newClaim.photosHint')}</span>
              {photos.length < MAX_PHOTOS && (
                <input id="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPhotos} />
              )}
              {errors.photos && <span className="error">{errors.photos}</span>}
            </div>
            {photos.length > 0 && (
              <div className="photos">
                {photos.map((p, i) => (
                  <div key={p.preview} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                    <img src={p.preview} alt={p.name} />
                    <button type="button" className="btn-link small" onClick={() => removePhoto(i)}>
                      {t('common.remove')}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div>
              <h2>{t('newClaim.review')}</h2>
              <dl className="kv">
                <dt>{t('claim.crop')}</dt>
                <dd>
                  {form.cropName} · {t(`season.${form.season}`)} · {form.areaAcres} {t('claim.acres')}
                </dd>
                <dt>{t('claim.cause')}</dt>
                <dd>{form.causeOfLoss && t(`cause.${form.causeOfLoss}`)}</dd>
                <dt>{t('claim.lossDate')}</dt>
                <dd>{form.lossDate}</dd>
                <dt>{t('claim.amountClaimed')}</dt>
                <dd>{rupees(form.amountClaimed)}</dd>
                <dt>{t('claim.location')}</dt>
                <dd>{[form.village, form.district, form.state].filter(Boolean).join(', ')}</dd>
                <dt>{t('claim.bank')}</dt>
                <dd>
                  {form.bankName} · {form.ifsc} · ****{form.accountNumber.slice(-4)}
                </dd>
              </dl>
            </div>
          </div>
        )}

        <div className="spread" style={{ marginTop: '1.2rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setStep(step - 1)}
            disabled={step === 0 || submitting}
          >
            {t('common.back')}
          </button>
          {step < 3 ? (
            <button type="button" className="btn" onClick={next}>
              {t('common.next')}
            </button>
          ) : (
            <button type="button" className="btn" onClick={submit} disabled={submitting}>
              {submitting ? t('common.pleaseWait') : t('newClaim.submit')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
