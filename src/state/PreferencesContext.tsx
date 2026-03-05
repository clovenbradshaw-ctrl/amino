import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface Preferences {
  sidebarCollapsed: boolean;
  defaultPageSize: number;
  theme: 'light' | 'dark';
  compactMode: boolean;
}

interface PreferencesContextValue extends Preferences {
  updatePreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
}

const defaultPreferences: Preferences = {
  sidebarCollapsed: false,
  defaultPageSize: 100,
  theme: 'light',
  compactMode: false,
};

const PREFS_KEY = 'amino_preferences';

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(() => {
    try {
      const saved = localStorage.getItem(PREFS_KEY);
      return saved ? { ...defaultPreferences, ...JSON.parse(saved) } : defaultPreferences;
    } catch {
      return defaultPreferences;
    }
  });

  const updatePreference = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs(p => {
      const updated = { ...p, [key]: value };
      localStorage.setItem(PREFS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <PreferencesContext.Provider value={{ ...prefs, updatePreference }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
