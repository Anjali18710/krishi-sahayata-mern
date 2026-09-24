import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, errorMessage, fieldErrors } from '../api';
import { homePathFor, useAuth } from '../context/AuthContext';
import Field from '../components/Field';
import OtpForm from '../components/OtpForm';
import { STATES } from '../constants';

export default function Register() {
  const { t, i18n } = useTranslation();
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', phone: '', state: '', district: '', village: '', language: i18n.language });
  const [step, setStep] = useState('details');
  const [devOtp, setDevOtp] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homePathFor(user)} replace />;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function sendOtp() {
    setBusy(true);
    setError('');
    setErrors({});
    try {
      const { data } = await api.post('/auth/otp/request', { phone: form.phone, purpose: 'register', language: form.language });
      setDevOtp(data.devOtp || '');
      setStep('otp');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(code) {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/auth/otp/verify', { ...form, code, purpose: 'register' });
      login(data);
      navigate('/farmer', { replace: true });
    } catch (err) {
      const fields = fieldErrors(err);
      if (Object.keys(fields).some((f) => f !== 'code')) {
        setErrors(fields);
        setStep('details');
      }
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow">
      <div className="card">
        <h1>{t('register.title')}</h1>
        {step === 'otp' ? (
          <OtpForm
            phone={form.phone}
            devOtp={devOtp}
            onVerify={verify}
            onResend={sendOtp}
            onBack={() => setStep('details')}
            busy={busy}
            error={error}
          />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendOtp();
            }}
          >
            <Field label={t('register.name')} error={errors.name}>
              <input value={form.name} onChange={set('name')} autoComplete="name" required maxLength={80} />
            </Field>
            <Field label={t('login.phone')} hint={t('login.phoneHint')} error={errors.phone}>
              <input type="tel" value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" required />
            </Field>
            <Field label={t('register.state')} error={errors.state}>
              <select value={form.state} onChange={set('state')} required>
                <option value="">{t('common.select')}</option>
                {STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-row">
              <Field label={t('register.district')} error={errors.district}>
                <input value={form.district} onChange={set('district')} required />
              </Field>
              <Field label={t('register.village')} error={errors.village}>
                <input value={form.village} onChange={set('village')} />
              </Field>
            </div>
            <div className="field">
              <label>{t('register.language')}</label>
              <div className="radio-row">
                <label>
                  <input type="radio" name="language" value="en" checked={form.language === 'en'} onChange={set('language')} />{' '}
                  English
                </label>
                <label>
                  <input type="radio" name="language" value="hi" checked={form.language === 'hi'} onChange={set('language')} />{' '}
                  हिन्दी
                </label>
              </div>
              <span className="hint">{t('register.languageHint')}</span>
            </div>
            {error && (
              <div className="alert alert-error" style={{ marginBottom: '0.8rem' }}>
                {error}
              </div>
            )}
            <button className="btn" disabled={busy}>
              {busy ? t('common.pleaseWait') : t('login.sendOtp')}
            </button>
            <p className="small muted" style={{ marginTop: '1rem' }}>
              {t('register.haveAccount')} <Link to="/login">{t('nav.login')}</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
