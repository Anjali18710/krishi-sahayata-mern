// Step 2 of farmer login/registration: type the 6-digit code received by SMS.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Field from './Field';

export default function OtpForm({ phone, devOtp, onVerify, onResend, onBack, busy, error }) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(30);

  // Countdown before "Resend OTP" is allowed (the server enforces 30 seconds too)
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function resend() {
    await onResend();
    setCooldown(30);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onVerify(code);
      }}
    >
      <p>{t('otp.sentTo', { phone })}</p>
      {devOtp && (
        <div className="alert alert-info" style={{ marginBottom: '0.8rem' }}>
          {t('otp.demoNotice')} <strong>{devOtp}</strong>
        </div>
      )}
      <Field label={t('otp.label')} error={error}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          required
          autoFocus
        />
      </Field>
      <div className="row">
        <button className="btn" disabled={busy || code.length !== 6}>
          {busy ? t('common.pleaseWait') : t('otp.verify')}
        </button>
        <button type="button" className="btn-link" onClick={resend} disabled={cooldown > 0 || busy}>
          {cooldown > 0 ? t('otp.resendIn', { seconds: cooldown }) : t('otp.resend')}
        </button>
        <button type="button" className="btn-link" onClick={onBack}>
          {t('otp.changeNumber')}
        </button>
      </div>
    </form>
  );
}
