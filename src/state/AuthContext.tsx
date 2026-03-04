import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export interface MatrixSession {
  userId: string;
  accessToken: string;
  deviceId: string;
  homeserverUrl: string;
  displayName?: string;
}

interface AuthState {
  session: MatrixSession | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoggedIn: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const HOMESERVER = 'https://app.aminoimmigration.com';
const SESSION_KEY = 'amino_session';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    loading: true,
    error: null,
  });

  // Restore session on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const session = JSON.parse(saved) as MatrixSession;
        setState({ session, loading: false, error: null });
      } else {
        setState(s => ({ ...s, loading: false }));
      }
    } catch {
      setState(s => ({ ...s, loading: false }));
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const body = {
        type: 'm.login.password',
        identifier: {
          type: 'm.id.user',
          user: username,
        },
        password,
        initial_device_display_name: 'Amino Web',
      };

      const resp = await fetch(`${HOMESERVER}/_matrix/client/v3/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Login failed: ${resp.status}`);
      }

      const data = await resp.json();
      const session: MatrixSession = {
        userId: data.user_id,
        accessToken: data.access_token,
        deviceId: data.device_id,
        homeserverUrl: HOMESERVER,
      };

      // Fetch display name
      try {
        const profileResp = await fetch(
          `${HOMESERVER}/_matrix/client/v3/profile/${encodeURIComponent(data.user_id)}/displayname`,
          { headers: { Authorization: `Bearer ${data.access_token}` } }
        );
        if (profileResp.ok) {
          const profile = await profileResp.json();
          session.displayName = profile.displayname;
        }
      } catch {
        // Non-critical
      }

      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      setState({ session, loading: false, error: null });
    } catch (err: any) {
      setState(s => ({ ...s, loading: false, error: err.message }));
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    if (state.session) {
      try {
        await fetch(`${HOMESERVER}/_matrix/client/v3/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${state.session.accessToken}` },
        });
      } catch {
        // Continue logout even if server call fails
      }
    }
    localStorage.removeItem(SESSION_KEY);
    setState({ session: null, loading: false, error: null });
  }, [state.session]);

  return (
    <AuthContext.Provider value={{
      ...state,
      login,
      logout,
      isLoggedIn: !!state.session,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
