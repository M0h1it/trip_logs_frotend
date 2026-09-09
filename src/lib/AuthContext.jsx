import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, clearToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [hasToken, setHasToken] = useState(!!getToken());
  const [loading, setLoading] = useState(false);

  // We don't verify the token against the server on every load — if you're
  // offline at trip time, we shouldn't lock you out just because we can't
  // reach the backend to confirm the token is still valid. The token is only
  // actually checked when a real API call is made; if it's expired/invalid,
  // that call fails with 401 and the UI can react then.
  useEffect(() => {
    setHasToken(!!getToken());
  }, []);

  async function login(email, password) {
    setLoading(true);
    try {
      await api.login(email, password);
      setHasToken(true);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearToken();
    setHasToken(false);
  }

  return (
    <AuthContext.Provider value={{ isAuthed: hasToken, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
