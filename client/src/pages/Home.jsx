import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { homePathFor, useAuth } from '../context/AuthContext';

export default function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (user) return <Navigate to={homePathFor(user)} replace />;

  const features = ['file', 'track', 'weather'];

  return (
    <div className="stack">
      <section className="hero">
        <h1>{t('home.title')}</h1>
        <p>{t('home.subtitle')}</p>
        <div className="row" style={{ marginTop: '1.2rem' }}>
          <Link to="/register" className="btn btn-secondary">
            {t('home.register')}
          </Link>
          <Link to="/login" className="btn btn-ghost">
            {t('home.login')}
          </Link>
          <Link to="/track" className="btn btn-ghost">
            {t('home.track')}
          </Link>
        </div>
      </section>

      <section className="grid-3">
        {features.map((key) => (
          <div key={key} className="card">
            <h2>{t(`home.features.${key}.title`)}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {t(`home.features.${key}.text`)}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
