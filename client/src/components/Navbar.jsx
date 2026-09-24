import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { homePathFor, useAuth } from '../context/AuthContext';
import LanguageSwitch from './LanguageSwitch';

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#3b7f47" />
      <path d="M16 26V13" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16 17c-4.5 0-7-2.8-7-7 4.5 0 7 2.8 7 7zM16 14c0-4.2 2.5-7 7-7 0 4.2-2.5 7-7 7z" fill="#e9c46a" />
    </svg>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const links = [];
  if (!user) {
    links.push(['/track', t('nav.track')]);
  } else if (user.role === 'farmer') {
    links.push(['/farmer', t('nav.myClaims')], ['/farmer/new', t('nav.newClaim')], ['/farmer/profile', t('nav.profile')]);
  } else {
    links.push(['/staff', t('nav.claims')], ['/staff/analytics', t('nav.analytics')]);
    if (user.role === 'admin') links.push(['/staff/users', t('nav.users')]);
  }

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <header className="navbar">
      <nav className="navbar-inner" aria-label={t('nav.main')}>
        <Link to={homePathFor(user)} className="brand">
          <Logo />
          {t('app.name')}
        </Link>
        <div className="nav-links">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end>
              {label}
            </NavLink>
          ))}
        </div>
        <div className="nav-right">
          <LanguageSwitch />
          {user ? (
            <>
              <span className="small" style={{ color: '#dfeadf' }}>
                {user.name} · {t(`roles.${user.role}`)}
              </span>
              <button type="button" className="btn btn-ghost btn-small" onClick={handleLogout}>
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn-ghost btn-small">
              {t('nav.login')}
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
