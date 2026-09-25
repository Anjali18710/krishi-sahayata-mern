// Admin page: list staff accounts, create officers/admins, and deactivate accounts.
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage, fieldErrors } from '../../api';
import { useAuth } from '../../context/AuthContext';
import Field from '../../components/Field';
import { STATES } from '../../constants';

const EMPTY = { name: '', email: '', password: '', role: 'officer', state: '', district: '', phone: '' };

export default function Users() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    Promise.all([api.get('/users', { params: { role: 'officer' } }), api.get('/users', { params: { role: 'admin' } })])
      .then(([o, a]) => setUsers([...a.data.users, ...o.data.users]))
      .catch((err) => setMessage({ type: 'error', text: errorMessage(err) }));
  }, []);

  useEffect(load, [load]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      const { data } = await api.post('/users/staff', form);
      let text = t('users.created', { name: form.name });
      if (data.claimsAssigned > 0) text += ` ${t('users.claimsAssigned', { count: data.claimsAssigned })}`;
      setMessage({ type: 'success', text });
      setForm(EMPTY);
      load();
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u) {
    try {
      const { data } = await api.patch(`/users/${u._id}`, { isActive: !u.isActive });
      if (data.claimsAssigned > 0) {
        setMessage({ type: 'success', text: t('users.claimsAssigned', { count: data.claimsAssigned }) });
      }
      load();
    } catch (err) {
      setMessage({ type: 'error', text: errorMessage(err) });
    }
  }

  return (
    <div className="stack">
      <h1>{t('users.title')}</h1>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('register.name')}</th>
              <th>{t('login.email')}</th>
              <th>{t('users.role')}</th>
              <th>{t('register.district')}</th>
              <th>{t('users.status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{t(`roles.${u.role}`)}</td>
                <td>
                  {u.district}, {u.state}
                </td>
                <td>
                  {u.isActive ? (
                    <span className="badge badge-good">{t('users.active')}</span>
                  ) : (
                    <span className="badge">{t('users.inactive')}</span>
                  )}
                </td>
                <td>
                  {u._id !== me._id && (
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => toggleActive(u)}>
                      {u.isActive ? t('users.deactivate') : t('users.activate')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="card" onSubmit={create} style={{ maxWidth: 760 }}>
        <h2>{t('users.addTitle')}</h2>
        <div className="form-row">
          <Field label={t('register.name')} error={errors.name}>
            <input value={form.name} onChange={set('name')} required />
          </Field>
          <Field label={t('login.email')} error={errors.email}>
            <input type="email" value={form.email} onChange={set('email')} required autoComplete="off" />
          </Field>
          <Field label={t('login.password')} hint={t('users.passwordHint')} error={errors.password}>
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              minLength={8}
              required
              autoComplete="new-password"
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label={t('users.role')} error={errors.role}>
            <select value={form.role} onChange={set('role')}>
              <option value="officer">{t('roles.officer')}</option>
              <option value="admin">{t('roles.admin')}</option>
            </select>
          </Field>
          <Field label={t('register.state')} error={errors.state}>
            <select value={form.state} onChange={set('state')} required>
              <option value="">{t('common.select')}</option>
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('register.district')} hint={t('users.districtHint')} error={errors.district}>
            <input value={form.district} onChange={set('district')} required />
          </Field>
        </div>
        <button className="btn" disabled={busy}>
          {busy ? t('common.pleaseWait') : t('users.create')}
        </button>
      </form>
    </div>
  );
}
