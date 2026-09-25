// Lets a farmer set their farm location, either with the phone's GPS or by searching a village/town name.
// Calls onChange({ latitude, longitude, label, state?, district? }).
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../api';
import { isWeatherUnavailable, searchPlacesDirect } from '../openMeteo';

export default function PlacePicker({ value, onChange }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);

  // Search 400 ms after the user stops typing (debounce), so we don't call the API on every key press
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      setError('');
      try {
        let places;
        try {
          places = (await api.get('/weather/places', { params: { q } })).data.places;
        } catch (err) {
          if (!isWeatherUnavailable(err)) throw err;
          places = await searchPlacesDirect(q); // backup: ask Open-Meteo from the browser
        }
        setResults(places);
        if (places.length === 0) setError(t('place.noResults'));
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query, t]);

  function useGps() {
    if (!navigator.geolocation) {
      setError(t('place.gpsUnsupported'));
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({
          latitude: Number(pos.coords.latitude.toFixed(5)),
          longitude: Number(pos.coords.longitude.toFixed(5)),
          label: t('place.gpsLabel'),
        });
      },
      () => {
        setLocating(false);
        setError(t('place.gpsDenied'));
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  function choose(place) {
    onChange(place);
    setQuery('');
    setResults([]);
  }

  return (
    <div>
      {value?.latitude != null ? (
        <div className="alert alert-success small" style={{ marginBottom: '0.6rem' }}>
          {t('place.selected')}: <strong>{value.label || t('place.gpsLabel')}</strong> ({value.latitude.toFixed(3)},{' '}
          {value.longitude.toFixed(3)})
        </div>
      ) : (
        <p className="small muted">{t('place.why')}</p>
      )}
      <div className="row" style={{ marginBottom: '0.5rem' }}>
        <button type="button" className="btn btn-secondary btn-small" onClick={useGps} disabled={locating}>
          {locating ? t('place.locating') : t('place.useGps')}
        </button>
        <span className="small muted">{t('common.or')}</span>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('place.searchPlaceholder')}
        aria-label={t('place.searchPlaceholder')}
      />
      {searching && <p className="small muted">{t('common.searching')}</p>}
      {error && (
        <p className="small" style={{ color: 'var(--bad)' }}>
          {error}
        </p>
      )}
      {results.length > 0 && (
        <ul className="place-results">
          {results.map((p) => (
            <li key={`${p.latitude},${p.longitude}`}>
              <button type="button" onClick={() => choose(p)}>
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
