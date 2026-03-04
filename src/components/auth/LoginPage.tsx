import React, { useState } from 'react';
import { useAuth } from '../../state/AuthContext';

export default function LoginPage() {
  const { login, loading, error } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    try {
      await login(username.trim(), password);
    } catch {
      // Error is set in AuthContext
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1 className="login-title">Amino</h1>
          <p className="login-subtitle">Sign in with your Matrix account</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-server">
            <span className="login-server-label">Homeserver</span>
            <span className="login-server-value">app.aminoimmigration.com</span>
          </div>

          <div className="login-field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="@user:app.aminoimmigration.com"
              autoComplete="username"
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-button" disabled={loading || !username.trim() || !password}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>

      <style>{`
        .login-page {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #1b1b25 0%, #2d2d3d 100%);
          padding: var(--space-lg);
        }

        .login-card {
          background: var(--color-bg-primary);
          border-radius: var(--radius-xl);
          box-shadow: var(--shadow-xl);
          width: 100%;
          max-width: 400px;
          padding: var(--space-3xl) var(--space-2xl);
        }

        .login-header {
          text-align: center;
          margin-bottom: var(--space-2xl);
        }

        .login-title {
          font-size: 28px;
          font-weight: 700;
          color: var(--color-text-primary);
          margin-bottom: var(--space-xs);
        }

        .login-subtitle {
          color: var(--color-text-secondary);
          font-size: var(--text-lg);
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-lg);
        }

        .login-server {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-sm) var(--space-md);
          background: var(--color-bg-secondary);
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
        }

        .login-server-label {
          color: var(--color-text-muted);
        }

        .login-server-value {
          color: var(--color-text-primary);
          font-weight: 500;
        }

        .login-field {
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
        }

        .login-field label {
          font-size: var(--text-sm);
          font-weight: 500;
          color: var(--color-text-secondary);
        }

        .login-field input {
          padding: 10px var(--space-md);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          font-size: var(--text-lg);
          background: var(--color-bg-input);
          transition: border-color var(--transition-fast);
        }

        .login-field input:focus {
          outline: none;
          border-color: var(--color-accent);
          box-shadow: 0 0 0 3px var(--color-accent-light);
        }

        .login-field input:disabled {
          opacity: 0.6;
        }

        .login-error {
          color: var(--color-text-error);
          font-size: var(--text-sm);
          padding: var(--space-sm) var(--space-md);
          background: #fef2f2;
          border-radius: var(--radius-md);
          border: 1px solid #fecaca;
        }

        .login-button {
          padding: 12px;
          background: var(--color-accent);
          color: var(--color-text-inverse);
          border-radius: var(--radius-md);
          font-size: var(--text-lg);
          font-weight: 600;
          transition: background var(--transition-fast);
        }

        .login-button:hover:not(:disabled) {
          background: var(--color-accent-hover);
        }

        .login-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
