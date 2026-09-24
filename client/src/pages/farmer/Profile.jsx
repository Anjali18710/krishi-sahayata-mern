import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../../api';
import { useAuth } from '../../context/AuthContext';
import Field from '../../components/Field';
import PlacePicker from '../../components/PlacePicker';

export default function Profile() {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [village, setVillage] = useState(user.village || '');
  const [language, setLanguage] = useState(user.language || 'en');
  const [location, setLocation] = useState(user.farmLocation?.latitude != null ? user.farmLocation : null);
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const body = { name, village, language };
      if (location) body.farmLocation = { latitude: location.latitude, longitude: location.longitude, label: location.label };
      const { data } = await api.patch('/auth/me', body);
      updateUser(data.user);
      setMessage({ type: 'success', text: t('profile.saved') });
    } catch (err) {
      setMessage({ type: 'error', text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="narrow">
      <form className="card" onSubmit={save}>
        <h1>{t('nav.profile')}</h1>
        <p className="small muted">
          {t('login.phone')}: {user.phone}
        </p>
        <Field label={t('register.name')}>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
        </Field>
        <Field label={t('register.village')}>
          <input value={village} onChange={(e) => setVillage(e.target.value)} />
        </Field>
        <div className="field">
          <label>{t('register.language')}</label>
          <div className="radio-row">
            <label>
              <input
                type="radio"
                name="lang"
                value="en"
                checked={language === 'en'}
                onChange={(e) => setLanguage(e.target.value)}
              />{' '}
              English
            </label>
            <label>
              <input
                type="radio"
                name="lang"
                value="hi"
                checked={language === 'hi'}
                onChange={(e) => setLanguage(e.target.value)}
              />{' '}
              हिन्दी
            </label>
          </div>
          <span className="hint">{t('register.languageHint')}</span>
        </div>
        <div className="field">
          <label>{t('newClaim.farmLocation')}</label>
          <PlacePicker value={location} onChange={setLocation} />
        </div>
        {message && (
          <div className={`alert alert-${message.type}`} style={{ marginBottom: '0.8rem' }}>
            {message.text}
          </div>
        )}
        <button className="btn" disabled={saving}>
          {saving ? t('common.pleaseWait') : t('common.save')}
        </button>
      </form>
    </div>
  );
}
