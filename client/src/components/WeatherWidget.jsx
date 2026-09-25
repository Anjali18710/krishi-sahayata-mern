// 7-day forecast for the farmer's farm location (Open-Meteo, through our backend;
// if the backend's Open-Meteo limit is used up, the browser asks Open-Meteo directly).
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../api';
import { fetchForecastDirect, isWeatherUnavailable } from '../openMeteo';

// WMO weather codes used by Open-Meteo, grouped into simple labels
function weatherKey(code) {
  if (code === 0) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'thunderstorm';
  return 'cloudy';
}

// Same thresholds as the server's daily alert job (server/src/jobs/weatherAlerts.js)
const isAlertDay = (d) => d.precipitation >= 64.5 || d.tempMax >= 45 || d.windGustMax >= 62;

export default function WeatherWidget({ location }) {
  const { t, i18n } = useTranslation();
  const [days, setDays] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (location?.latitude == null) return;
    setError('');
    api
      .get('/weather/forecast', { params: { latitude: location.latitude, longitude: location.longitude } })
      .then((res) => res.data.days)
      .catch((err) => {
        if (isWeatherUnavailable(err)) return fetchForecastDirect(location.latitude, location.longitude);
        throw err;
      })
      .then(setDays)
      .catch((err) => setError(errorMessage(err)));
  }, [location?.latitude, location?.longitude]);

  if (location?.latitude == null) return null;

  return (
    <section className="card">
      <div className="spread">
        <h2>{t('weather.title')}</h2>
        <span className="small muted">{location.label}</span>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {!days && !error && <p className="muted">{t('common.loading')}</p>}
      {days && (
        <div className="forecast">
          {days.map((d) => (
            <div key={d.date} className={`forecast-day${isAlertDay(d) ? ' alert-day' : ''}`}>
              <div className="small muted">
                {new Date(`${d.date}T00:00:00`).toLocaleDateString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                })}
              </div>
              <div>{t(`weather.codes.${weatherKey(d.weatherCode)}`)}</div>
              <div className="temp">
                {Math.round(d.tempMax)}° <span className="muted small">/ {Math.round(d.tempMin)}°</span>
              </div>
              <div className="small">
                {t('weather.rain')}: {d.precipitation ?? 0} mm
                {d.precipitationProbability != null && ` (${d.precipitationProbability}%)`}
              </div>
              {isAlertDay(d) && (
                <div className="small" style={{ color: 'var(--warn)', fontWeight: 600 }}>
                  {t('weather.alert')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="small muted" style={{ marginTop: '0.6rem' }}>
        {t('weather.source')}
      </p>
    </section>
  );
}
