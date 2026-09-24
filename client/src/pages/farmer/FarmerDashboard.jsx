import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { StatusBadge } from '../../components/Badges';
import WeatherWidget from '../../components/WeatherWidget';
import { formatDate, rupees } from '../../utils/format';

export default function FarmerDashboard() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [claims, setClaims] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/claims', { params: { limit: 100 } })
      .then((res) => setClaims(res.data.claims))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1>{t('farmer.greeting', { name: user.name })}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {t('farmer.subtitle')}
          </p>
        </div>
        <Link to="/farmer/new" className="btn">
          {t('nav.newClaim')}
        </Link>
      </div>

      {user.farmLocation?.latitude != null ? (
        <WeatherWidget location={user.farmLocation} />
      ) : (
        <div className="alert alert-info">
          {t('farmer.setLocation')} <Link to="/farmer/profile">{t('nav.profile')}</Link>
        </div>
      )}

      <section className="card">
        <h2>{t('nav.myClaims')}</h2>
        {error && <div className="alert alert-error">{error}</div>}
        {!claims && !error && <p className="muted">{t('common.loading')}</p>}
        {claims?.length === 0 && (
          <div className="empty">
            <p>{t('farmer.noClaims')}</p>
            <Link to="/farmer/new" className="btn">
              {t('nav.newClaim')}
            </Link>
          </div>
        )}
        {claims?.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('claim.number')}</th>
                  <th>{t('claim.crop')}</th>
                  <th>{t('claim.cause')}</th>
                  <th className="num">{t('claim.amountClaimed')}</th>
                  <th>{t('claim.submittedOn')}</th>
                  <th>{t('claim.status')}</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c._id}>
                    <td>
                      <Link to={`/claims/${c._id}`}>{c.claimNumber}</Link>
                    </td>
                    <td>{c.crop.name}</td>
                    <td>{t(`cause.${c.causeOfLoss}`)}</td>
                    <td className="num">{rupees(c.amountClaimed)}</td>
                    <td>{formatDate(c.submittedAt, i18n.language)}</td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
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
