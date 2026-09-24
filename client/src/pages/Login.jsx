import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../api';
import { homePathFor, useAuth } from '../context/AuthContext';
import Field from '../components/Field';
import OtpForm from '../components/OtpForm';

function FarmerLogin({ onLoggedIn }) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState('phone');
  const [devOtp, setDevOtp] = useState('');
  const [error, setError] = useState('');
  const [notRegistered, setNotRegistered] = useState(false);
  const [busy, setBusy] = useState(false);

  async function sendOtp() {
    setBusy(true);
    setError('');
    setNotRegistered(false);
    try {
      const { data } = await api.post('/auth/otp/request', { phone, purpose: 'login' });
      setDevOtp(data.devOtp || '');
      setStep('otp');
    } catch (err) {
      setError(errorMessage(err));
      setNotRegistered(err.response?.data?.code === 'USER_NOT_FOUND');
    } finally {
      setBusy(false);
    }
  }

  async function verify(code) {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/auth/otp/verify', { phone, code, purpose: 'login' });
      onLoggedIn(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (step === 'otp') {
    return (
      <OtpForm
        phone={phone}
        devOtp={devOtp}
        onVerify={verify}
        onResend={sendOtp}
        onBack={() => setStep('phone')}
        busy={busy}
        error={error}
      />
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        sendOtp();
      }}
    >
      <Field label={t('login.phone')} hint={t('login.phoneHint')} error={error}>
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" required />
      </Field>
      {notRegistered && (
        <p>
          <Link to="/register">{t('login.registerInstead')}</Link>
        </p>
      )}
      <button className="btn" disabled={busy}>
        {busy ? t('common.pleaseWait') : t('login.sendOtp')}
      </button>
    </form>
  );
}

function StaffLogin({ onLoggedIn }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/auth/staff/login', { email, password });
      onLoggedIn(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Field label={t('login.email')}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
      </Field>
      <Field label={t('login.password')} error={error}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </Field>
      <button className="btn" disabled={busy}>
        {busy ? t('common.pleaseWait') : t('login.submit')}
      </button>
    </form>
  );
}

export default function Login() {
  const { t } = useTranslation();
  const { user, login, config } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState('farmer');

  if (user) return <Navigate to={homePathFor(user)} replace />;

  function onLoggedIn(data) {
    login(data);
    navigate(location.state?.from || homePathFor(data.user), { replace: true });
  }

  return (
    <div className="narrow stack">
      <div className="card">
        <h1>{t('login.title')}</h1>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'farmer'} onClick={() => setTab('farmer')}>
            {t('login.farmerTab')}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'staff'} onClick={() => setTab('staff')}>
            {t('login.staffTab')}
          </button>
        </div>
        {tab === 'farmer' ? <FarmerLogin onLoggedIn={onLoggedIn} /> : <StaffLogin onLoggedIn={onLoggedIn} />}
        {tab === 'farmer' && (
          <p className="small muted" style={{ marginTop: '1rem' }}>
            {t('login.newHere')} <Link to="/register">{t('login.registerLink')}</Link>
          </p>
        )}
      </div>

      {config.demoMode && (
        <div className="alert alert-info small">
          <strong>{t('login.demoTitle')}</strong>
          <br />
          {t('login.demoFarmer')}: 9999900001
          <br />
          {t('login.demoOfficer')}: puri.officer@krishisahayata.in / Officer@12345
          <br />
          {t('login.demoAdmin')}: admin@krishisahayata.in / Admin@12345
        </div>
      )}
    </div>
  );
}
