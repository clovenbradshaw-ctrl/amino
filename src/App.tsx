import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './state/AuthContext';
import { DataProvider } from './state/DataContext';
import { SchemaProvider } from './state/SchemaContext';
import { ViewProvider } from './state/ViewContext';
import { PreferencesProvider } from './state/PreferencesContext';
import { InterfaceProvider, useInterface } from './state/InterfaceContext';
import LoginPage from './components/auth/LoginPage';
import AppShell from './components/layout/AppShell';

// Lazy-load heavy pages
const DataGrid = lazy(() => import('./components/grid/DataGrid'));
const InterfacePage = lazy(() => import('./components/interface/InterfacePage'));
const InterfaceNav = lazy(() => import('./components/interface/InterfaceNav'));
const InterfaceBuilder = lazy(() => import('./components/interface/builder/InterfaceBuilder'));
const ProfileLayoutBuilder = lazy(() => import('./components/profile/ProfileLayoutBuilder'));
const SchemaDesigner = lazy(() => import('./components/schema/SchemaDesigner'));
const EoNotationHistory = lazy(() => import('./components/history/EoNotationHistory'));

/** Route wrapper that extracts tableId param and passes it as prop */
function DataGridRoute() {
  const { tableId } = useParams<{ tableId: string }>();
  if (!tableId) return <Navigate to="/interface" replace />;
  return <DataGrid tableId={tableId} />;
}

/** Route wrapper for interface — renders all pre-built pages with nav */
function InterfaceRoute() {
  const { pages } = useInterface();
  const [activePageId, setActivePageId] = React.useState<string | null>(pages[0]?.pageId || null);

  React.useEffect(() => {
    if (!activePageId && pages.length > 0) {
      setActivePageId(pages[0].pageId);
    }
  }, [pages, activePageId]);

  const activePage = pages.find(p => p.pageId === activePageId) || pages[0];

  if (!activePage) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#999' }}>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>No Interface Pages</h2>
        <p>Go to Interface Builder to create pages.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <InterfaceNav
        pages={pages}
        activePageId={activePageId}
        onSelectPage={setActivePageId}
      />
      <InterfacePage pageSchema={activePage} />
    </div>
  );
}

function LoadingFallback() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      color: '#999',
      fontSize: '14px',
    }}>
      Loading…
    </div>
  );
}

function AuthGate() {
  const { isLoggedIn, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: '#666',
      }}>
        Restoring session…
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginPage />;
  }

  return (
    <DataProvider>
      <SchemaProvider>
        <ViewProvider>
          <InterfaceProvider>
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                <Route element={<AppShell />}>
                  <Route path="/tables/:tableId" element={<DataGridRoute />} />
                  <Route path="/interface" element={<InterfaceRoute />} />
                  <Route path="/builder/interface" element={<InterfaceBuilder />} />
                  <Route path="/builder/profile" element={<ProfileLayoutBuilder />} />
                  <Route path="/schema" element={<SchemaDesigner />} />
                  <Route path="/history" element={<EoNotationHistory />} />
                  <Route path="/" element={<Navigate to="/interface" replace />} />
                  <Route path="*" element={<Navigate to="/interface" replace />} />
                </Route>
              </Routes>
            </Suspense>
          </InterfaceProvider>
        </ViewProvider>
      </SchemaProvider>
    </DataProvider>
  );
}

export default function App() {
  return (
    <PreferencesProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </PreferencesProvider>
  );
}
