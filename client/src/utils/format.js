// Formatting helpers. Indian number format: 1,25,000
export const rupees = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);

export const formatDate = (d, lang = 'en') =>
  d
    ? new Date(d).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

export const formatDateTime = (d, lang = 'en') =>
  d
    ? new Date(d).toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

// Today's date as YYYY-MM-DD in the user's own timezone (for <input type="date" max>)
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
