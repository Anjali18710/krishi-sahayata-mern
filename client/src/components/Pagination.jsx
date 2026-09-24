import { useTranslation } from 'react-i18next';

export default function Pagination({ page, pages, onChange }) {
  const { t } = useTranslation();
  if (!pages || pages <= 1) return null;
  return (
    <nav className="pagination" aria-label={t('common.pagination')}>
      <button type="button" className="btn btn-secondary btn-small" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        {t('common.previous')}
      </button>
      <span className="small">{t('common.pageOf', { page, pages })}</span>
      <button type="button" className="btn btn-secondary btn-small" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        {t('common.next')}
      </button>
    </nav>
  );
}
