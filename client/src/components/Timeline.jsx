// The claim's history, like a parcel-delivery tracker.
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '../utils/format';

export default function Timeline({ items, showActor = false }) {
  const { t, i18n } = useTranslation();
  if (!items?.length) return null;
  return (
    <ol className="timeline">
      {items.map((item, i) => (
        <li key={i}>
          {/* Entries where the status didn't change (e.g. "assigned to officer") are notes */}
          <strong>{item.to && item.from === item.to ? t('timeline.note') : t(`status.${item.to || item.status}`)}</strong>
          <div className="small muted">
            {formatDateTime(item.at, i18n.language)}
            {showActor && item.byName ? ` · ${item.byName} (${t(`roles.${item.byRole}`)})` : ''}
          </div>
          {item.remark && <div className="small">{item.remark}</div>}
        </li>
      ))}
    </ol>
  );
}
