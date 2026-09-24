// Keeps track of who is logged in and shares it with every component via React context.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, getToken, setToken } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [config, setConfig] = useState({ demoMode: false, smsEnabled: false, aiEnabled: false });
  const { i18n } = useTranslation();

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // Called after a successful login/registration with the API response
  const login = useCallback(
    ({ token, user: loggedInUser }) => {
      setToken(token);
      setUser(loggedInUser);
      if (loggedInUser.role === 'farmer' && loggedInUser.language) i18n.changeLanguage(loggedInUser.language);
    },
    [i18n]
  );

  const updateUser = useCallback((updated) => setUser(updated), []);

  // On first load: if a token is saved, fetch the current user
  useEffect(() => {
    api
      .get('/auth/config')
      .then((res) => setConfig(res.data))
      .catch(() => {});
    if (!getToken()) return;
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    window.addEventListener('ks:logout', logout);
    return () => window.removeEventListener('ks:logout', logout);
  }, [logout]);

  const value = useMemo(
    () => ({ user, loading, config, login, logout, updateUser }),
    [user, loading, config, login, logout, updateUser]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

// Where each role lands after logging in
export function homePathFor(user) {
  if (!user) return '/';
  return user.role === 'farmer' ? '/farmer' : '/staff';
}
