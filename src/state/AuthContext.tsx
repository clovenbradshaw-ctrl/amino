import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { setAccessToken } from '../services/matrix/client';
import {
  deriveSynapseKey,
  exportKeyToStorage,
  importKeyFromStorage,
  clearKeyFromStorage,
  createVerificationToken,
  verifyEncryptionKey,
} from '../services/data/encryption';
import {
  openDatabase,
  closeDatabase,
  encryptAllRecords,
  getPreference,
  putPreference,
  clearRecords,
  clearTables,
  clearSyncState,
} from '../services/data/idb-store';

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
  /** AES-GCM-256 crypto key derived from user credentials, available during active session. */
  cryptoKey: CryptoKey | null;
  /** Whether the local database has been opened and is ready. */
  dbReady: boolean;
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
    cryptoKey: null,
    dbReady: false,
  });

  // Restore session on mount — open IDB + import stored key
  useEffect(() => {
    (async () => {
      try {
        const saved = localStorage.getItem(SESSION_KEY);
        if (saved) {
          const session = JSON.parse(saved) as MatrixSession;
          setAccessToken(session.accessToken);

          // Open IDB and try to import the crypto key from localStorage
          await openDatabase();
          const storedKey = await importKeyFromStorage();

          if (storedKey) {
            // Verify the key still works (password may have changed)
            const token = await getPreference('encryption_verification');
            const valid = token ? await verifyEncryptionKey(storedKey, token) : true;
            if (valid) {
              setState({ session, loading: false, error: null, cryptoKey: storedKey, dbReady: true });
              return;
            }
            // Key invalid — clear stale encrypted data
            console.warn('[Auth] Stored encryption key is invalid, clearing local cache');
            await clearRecords();
            await clearSyncState();
            clearKeyFromStorage();
          }

          setState({ session, loading: false, error: null, cryptoKey: null, dbReady: true });
        } else {
          setState(s => ({ ...s, loading: false }));
        }
      } catch {
        setState(s => ({ ...s, loading: false }));
      }
    })();
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

      // Sync access token with Matrix client module
      setAccessToken(data.access_token);

      // Derive encryption key from password + userId (PBKDF2)
      let cryptoKey: CryptoKey | null = null;
      try {
        cryptoKey = await deriveSynapseKey(password, data.user_id);
        // Open IDB and store the key for session restoration
        await openDatabase();
        await exportKeyToStorage(cryptoKey);

        // Verify key against stored token (detect password changes)
        const existingToken = await getPreference('encryption_verification');
        if (existingToken) {
          const valid = await verifyEncryptionKey(cryptoKey, existingToken);
          if (!valid) {
            console.warn('[Auth] Password changed — clearing stale encrypted cache');
            await clearRecords();
            await clearSyncState();
          }
        }
        // Store fresh verification token
        const verifyToken = await createVerificationToken(cryptoKey);
        await putPreference('encryption_verification', verifyToken);
      } catch (keyErr) {
        console.warn('[Auth] Could not derive encryption key:', keyErr);
      }

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
      setState({ session, loading: false, error: null, cryptoKey, dbReady: true });
    } catch (err: any) {
      setState(s => ({ ...s, loading: false, error: err.message }));
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    // Encrypt all plaintext records before closing the database
    if (state.cryptoKey) {
      try {
        const count = await encryptAllRecords(state.cryptoKey);
        console.log(`[Auth] Encrypted ${count} records on logout`);
      } catch (err) {
        console.warn('[Auth] Failed to encrypt records on logout:', err);
      }
    }

    // Close IDB and clear the exported key
    closeDatabase();
    clearKeyFromStorage();

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

    // Clear access token from Matrix client module
    setAccessToken(null);
    localStorage.removeItem(SESSION_KEY);
    setState({ session: null, loading: false, error: null, cryptoKey: null, dbReady: false });
  }, [state.session, state.cryptoKey]);

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
