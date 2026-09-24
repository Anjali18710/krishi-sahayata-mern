// Claims table for officers and admins: search, filters, pagination and bulk status updates.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { StatusBadge, VerdictBadge } from '../../components/Badges';
import Pagination from '../../components/Pagination';
import { CAUSES, STATUSES, VERDICTS } from '../../constants';
import { formatDate, rupees } from '../../utils/format';

// Bulk actions can't approve (each approval needs its own amount)
const BULK_STATUSES = ['under_review', 'field_verification', 'rejected', 'disbursed'];

const EMPTY_FILTERS = { q: '', status: '', causeOfLoss: '', verdict: '', overdue: false, unassigned: false, sort: 'newest' };

export default function StaffDashboard() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [bulk, setBulk] = useState({ to: '', remark: '' });
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Wait until the user stops typing before searching
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) => (f.q === search ? f : { ...f, q: search }));
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(() => {
    const params = { page, limit: 20, sort: filters.sort };
    if (filters.q) params.q = filters.q;
    if (filters.status) params.status = filters.status;
    if (filters.causeOfLoss) params.causeOfLoss = filters.causeOfLoss;
    if (filters.verdict) params.verdict = filters.verdict;
    if (filters.overdue) params.overdue = 'true';
    if (filters.unassigned) params.assigned = 'none';
    setError('');
    api
      .get('/claims', { params })
      .then((res) => setData(res.data))
      .catch((err) => setError(errorMessage(err)));
  }, [filters, page]);

  useEffect(load, [load]);

  function setFilter(key, value) {
    setFilters({ ...filters, [key]: value });
    setPage(1);
    setSelected(new Set());
  }

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    if (!data) return;
    const allOnPage = data.claims.every((c) => selected.has(c._id));
    setSelected(allOnPage ? new Set() : new Set(data.claims.map((c) => c._id)));
  }

  async function applyBulk(e) {
    e.preventDefault();
    setBulkBusy(true);
    setBulkResult(null);
    try {
      const { data: result } = await api.post('/claims/bulk/status', {
        ids: [...selected],
        to: bulk.to,
        remark: bulk.remark || undefined,
      });
      setBulkResult(result);
      setSelected(new Set());
      load();
    } catch (err) {
      setBulkResult({ error: errorMessage(err) });
    } finally {
      setBulkBusy(false);
    }
  }

  const failed = bulkResult?.results?.filter((r) => !r.ok) || [];

  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>{user.role === 'admin' ? t('staff.allClaims') : t('staff.myClaims')}</h1>
        {data && <span className="muted small">{t('staff.total', { count: data.total })}</span>}
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="q">{t('staff.search')}</label>
            <input
              id="q"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('staff.searchPlaceholder')}
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="f-status">{t('claim.status')}</label>
            <select id="f-status" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">{t('common.all')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="f-cause">{t('claim.cause')}</label>
            <select id="f-cause" value={filters.causeOfLoss} onChange={(e) => setFilter('causeOfLoss', e.target.value)}>
              <option value="">{t('common.all')}</option>
              {CAUSES.map((c) => (
                <option key={c} value={c}>
                  {t(`cause.${c}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="f-verdict">{t('weatherCheck.title')}</label>
            <select id="f-verdict" value={filters.verdict} onChange={(e) => setFilter('verdict', e.target.value)}>
              <option value="">{t('common.all')}</option>
              {VERDICTS.map((v) => (
                <option key={v} value={v}>
                  {t(`verdict.${v}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="f-sort">{t('staff.sort')}</label>
            <select id="f-sort" value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)}>
              {['newest', 'oldest', 'amount', 'stale'].map((s) => (
                <option key={s} value={s}>
                  {t(`staff.sorts.${s}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row small">
          <label className="row" style={{ gap: 6 }}>
            <input
              type="checkbox"
              style={{ width: 'auto', minHeight: 0 }}
              checked={filters.overdue}
              onChange={(e) => setFilter('overdue', e.target.checked)}
            />
            {t('staff.onlyOverdue')}
          </label>
          {user.role === 'admin' && (
            <label className="row" style={{ gap: 6 }}>
              <input
                type="checkbox"
                style={{ width: 'auto', minHeight: 0 }}
                checked={filters.unassigned}
                onChange={(e) => setFilter('unassigned', e.target.checked)}
              />
              {t('staff.onlyUnassigned')}
            </label>
          )}
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setSearch('');
              setPage(1);
            }}
          >
            {t('staff.clearFilters')}
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <form className="bulk-bar" onSubmit={applyBulk}>
          <strong>{t('staff.selected', { count: selected.size })}</strong>
          <select
            value={bulk.to}
            onChange={(e) => setBulk({ ...bulk, to: e.target.value })}
            required
            aria-label={t('actions.moveTo')}
          >
            <option value="">{t('actions.moveTo')}</option>
            {BULK_STATUSES.filter((s) => s !== 'disbursed' || user.role === 'admin').map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
          <input
            value={bulk.remark}
            onChange={(e) => setBulk({ ...bulk, remark: e.target.value })}
            placeholder={bulk.to === 'rejected' ? t('actions.reasonRequired') : t('actions.remark')}
            required={bulk.to === 'rejected'}
            aria-label={t('actions.remark')}
          />
          <button className="btn btn-small" disabled={bulkBusy}>
            {bulkBusy ? t('common.pleaseWait') : t('staff.apply')}
          </button>
          <button type="button" className="btn-link" onClick={() => setSelected(new Set())}>
            {t('common.cancel')}
          </button>
        </form>
      )}

      {bulkResult?.error && <div className="alert alert-error">{bulkResult.error}</div>}
      {bulkResult?.results && (
        <div className={`alert ${failed.length ? 'alert-warn' : 'alert-success'}`}>
          {t('staff.bulkDone', { count: bulkResult.updated })}
          {failed.length > 0 && (
            <ul className="small" style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
              {failed.map((f) => (
                <li key={f.id}>{f.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}
      {!data && !error && <p className="muted">{t('common.loading')}</p>}

      {data && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      style={{ width: 'auto', minHeight: 0 }}
                      aria-label={t('staff.selectAll')}
                      checked={data.claims.length > 0 && data.claims.every((c) => selected.has(c._id))}
                      onChange={toggleAll}
                    />
                  </th>
                  <th>{t('claim.number')}</th>
                  <th>{t('claim.farmer')}</th>
                  <th>{t('claim.crop')}</th>
                  <th>{t('claim.cause')}</th>
                  <th className="num">{t('claim.amountClaimed')}</th>
                  <th>{t('weatherCheck.short')}</th>
                  <th>{t('claim.status')}</th>
                  <th>{t('claim.officer')}</th>
                  <th>{t('staff.lastUpdate')}</th>
                </tr>
              </thead>
              <tbody>
                {data.claims.length === 0 && (
                  <tr>
                    <td colSpan={10} className="empty">
                      {t('staff.noResults')}
                    </td>
                  </tr>
                )}
                {data.claims.map((c) => (
                  <tr key={c._id} className={c.isOverdue ? 'overdue' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        style={{ width: 'auto', minHeight: 0 }}
                        aria-label={c.claimNumber}
                        checked={selected.has(c._id)}
                        onChange={() => toggle(c._id)}
                      />
                    </td>
                    <td>
                      <Link to={`/claims/${c._id}`}>{c.claimNumber}</Link>
                    </td>
                    <td>
                      {c.farmerName}
                      <div className="small muted">
                        {c.location.district}, {c.location.state}
                      </div>
                    </td>
                    <td>{c.crop.name}</td>
                    <td>{t(`cause.${c.causeOfLoss}`)}</td>
                    <td className="num">{rupees(c.amountClaimed)}</td>
                    <td>
                      <VerdictBadge weatherCheck={c.weatherCheck} />
                    </td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="small">{c.assignedOfficer?.name || t('claim.unassigned')}</td>
                    <td className="small">
                      {formatDate(c.statusChangedAt, i18n.language)}
                      {c.isOverdue && <div style={{ color: 'var(--bad)', fontWeight: 600 }}>{t('claim.overdue')}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pages={data.pages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
