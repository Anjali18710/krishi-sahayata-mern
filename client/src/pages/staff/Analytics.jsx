// Dashboard of numbers computed by MongoDB aggregation pipelines (server/src/services/analytics.service.js).
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, errorMessage } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { rupees } from '../../utils/format';

// One colour per chart (each chart shows a single measure, so no legend is needed).
// Weather verdicts use the reserved good / warning / bad colours, always next to a text label.
const BAR = '#2f6b3a';
const VERDICT_COLORS = {
  consistent: '#2e7d32',
  inconclusive: '#b07d00',
  inconsistent: '#b3261e',
  not_applicable: '#8a918c',
  pending: '#b9bfba',
};
const AXIS = { fontSize: 12, fill: '#4b524d' };

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function ChartCard({ title, children, height = 260 }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </section>
  );
}

// ResponsiveContainer passes width/height to its child, so they must be forwarded to BarChart
function HorizontalBars({ data, label, colors, ...size }) {
  return (
    <BarChart {...size} data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }} barCategoryGap={6}>
      <CartesianGrid horizontal={false} stroke="#e7ebe6" />
      <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
      <YAxis type="category" dataKey="label" width={130} tick={AXIS} axisLine={false} tickLine={false} />
      <Tooltip cursor={{ fill: 'rgba(47,107,58,0.08)' }} formatter={(v) => [v, label]} />
      <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22} fill={BAR}>
        {colors && data.map((d) => <Cell key={d.key} fill={colors[d.key] || BAR} />)}
      </Bar>
    </BarChart>
  );
}

function RunAlertsButton() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const { data } = await api.post('/weather/alerts/run');
      setResult({ ok: true, text: t('analytics.alertsResult', data) });
    } catch (err) {
      setResult({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>{t('analytics.alertsTitle')}</h2>
      <p className="small muted">{t('analytics.alertsText')}</p>
      <button type="button" className="btn btn-secondary btn-small" onClick={run} disabled={busy}>
        {busy ? t('common.pleaseWait') : t('analytics.runAlerts')}
      </button>
      {result && (
        <div className={`alert ${result.ok ? 'alert-success' : 'alert-error'}`} style={{ marginTop: '0.6rem' }}>
          {result.text}
        </div>
      )}
    </section>
  );
}

export default function Analytics() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [officers, setOfficers] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/analytics/summary')
      .then((res) => setData(res.data))
      .catch((err) => setError(errorMessage(err)));
    if (user.role === 'admin') {
      api
        .get('/analytics/officers')
        .then((res) => setOfficers(res.data.officers))
        .catch((err) => setError(errorMessage(err)));
    }
  }, [user.role]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <p className="muted">{t('common.loading')}</p>;

  const { totals } = data;
  const monthLabel = (m) =>
    new Date(`${m}-01T00:00:00`).toLocaleDateString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
      month: 'short',
      year: '2-digit',
    });
  const countLabel = t('analytics.claims');

  return (
    <div className="stack">
      <h1>{user.role === 'admin' ? t('analytics.titleAll') : t('analytics.titleMine')}</h1>

      <div className="grid-3">
        <Stat label={t('analytics.totalClaims')} value={totals.claims} />
        <Stat label={t('analytics.open')} value={totals.open} />
        <Stat label={t('analytics.overdue', { days: data.slaDays })} value={totals.overdue} />
        <Stat label={t('analytics.approvalRate')} value={totals.approvalRate == null ? '—' : `${totals.approvalRate}%`} />
        <Stat label={t('analytics.avgDays')} value={totals.avgDaysToDecision ?? '—'} />
        <Stat label={t('analytics.disbursed')} value={rupees(totals.amountDisbursed)} />
      </div>

      <ChartCard title={t('analytics.monthly')}>
        <BarChart
          data={data.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }))}
          margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
        >
          <CartesianGrid vertical={false} stroke="#e7ebe6" />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: 'rgba(47,107,58,0.08)' }} formatter={(v) => [v, countLabel]} />
          <Bar dataKey="count" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ChartCard>

      <div className="grid-2">
        <ChartCard title={t('analytics.byStatus')}>
          <HorizontalBars
            label={countLabel}
            data={data.byStatus.map((s) => ({ key: s.status, label: t(`status.${s.status}`), count: s.count }))}
          />
        </ChartCard>
        <ChartCard title={t('analytics.byCause')}>
          <HorizontalBars
            label={countLabel}
            data={data.byCause.map((c) => ({ key: c.cause, label: t(`cause.${c.cause}`), count: c.count }))}
          />
        </ChartCard>
      </div>

      <div className="grid-2">
        <ChartCard title={t('analytics.verdicts')}>
          <HorizontalBars
            label={countLabel}
            colors={VERDICT_COLORS}
            data={data.weatherVerdicts.map((v) => ({ key: v.verdict, label: t(`verdict.${v.verdict}`), count: v.count }))}
          />
        </ChartCard>
        <section className="card">
          <h2>{t('analytics.byState')}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('register.state')}</th>
                  <th className="num">{countLabel}</th>
                  <th className="num">{t('claim.amountApproved')}</th>
                </tr>
              </thead>
              <tbody>
                {data.byState.map((s) => (
                  <tr key={s.state}>
                    <td>{s.state}</td>
                    <td className="num">{s.count}</td>
                    <td className="num">{rupees(s.amountApproved)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {officers && (
        <section className="card">
          <h2>{t('analytics.workload')}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('claim.officer')}</th>
                  <th>{t('register.district')}</th>
                  <th className="num">{t('analytics.open')}</th>
                  <th className="num">{t('claim.overdue')}</th>
                </tr>
              </thead>
              <tbody>
                {officers.map((o) => (
                  <tr key={o.officerId}>
                    <td>
                      {o.name} {!o.isActive && <span className="badge">{t('users.inactive')}</span>}
                    </td>
                    <td>{o.district}</td>
                    <td className="num">{o.open}</td>
                    <td className="num" style={o.overdue ? { color: 'var(--bad)', fontWeight: 600 } : undefined}>
                      {o.overdue}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {user.role === 'admin' && <RunAlertsButton />}
    </div>
  );
}
