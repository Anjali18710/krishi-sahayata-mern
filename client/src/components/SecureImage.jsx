// Shows a claim photo. Photos need the login token, which a plain <img src> can't send,
// so the image is downloaded with axios and shown from a temporary blob URL.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';

export default function SecureImage({ fileId, alt }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    let url;
    let cancelled = false;
    api
      .get(`/files/${fileId}`, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        url = URL.createObjectURL(res.data);
        setSrc(url);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fileId]);

  if (failed) return <div className="photo-placeholder">{t('claim.photoFailed')}</div>;
  if (!src) return <div className="photo-placeholder">{t('common.loading')}</div>;
  return (
    <a href={src} target="_blank" rel="noreferrer">
      <img src={src} alt={alt} />
    </a>
  );
}
