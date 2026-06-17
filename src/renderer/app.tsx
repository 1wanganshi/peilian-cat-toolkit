import type { JSX } from 'react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppErrorBoundary } from './components/app-error-boundary';
import { AppLayout } from './components/app-layout';
import { PhoneLoginPage } from './pages/phone-login-page';
import { ensureArticleGenerationProgressListener } from './stores/article-generation-store';
import type { UserAuthSession } from '../shared/types';

const ArticlePublisherPage = lazy(() => import('./pages/article-publisher-page').then((module) => ({ default: module.ArticlePublisherPage })));
const BackendManagerPage = lazy(() => import('./pages/backend-manager-page').then((module) => ({ default: module.BackendManagerPage })));
const ModelSettingsPage = lazy(() => import('./pages/backend-manager-page').then((module) => ({ default: module.ModelSettingsPage })));
const HistoryPage = lazy(() => import('./pages/history-page').then((module) => ({ default: module.HistoryPage })));
const MomentsPage = lazy(() => import('./pages/moments-page').then((module) => ({ default: module.MomentsPage })));
const ScriptGeneratorPage = lazy(() => import('./pages/script-generator-page').then((module) => ({ default: module.ScriptGeneratorPage })));

export function App(): JSX.Element {
  const [session, setSession] = useState<UserAuthSession | undefined>();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => ensureArticleGenerationProgressListener(), []);

  useEffect(() => {
    let alive = true;
    window.electron.getAuthSession()
      .then((result) => {
        if (alive && result?.authorized) setSession(result);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setCheckingAuth(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function logout(): Promise<void> {
    await window.electron.logoutAuthSession();
    setSession(undefined);
  }

  return (
    <AppErrorBoundary>
      {checkingAuth ? (
        <div className="center-spin loading-hint">正在校验授权...</div>
      ) : !session?.authorized ? (
        <PhoneLoginPage onLoggedIn={setSession} />
      ) : (
      <HashRouter>
        <Suspense fallback={<div className="center-spin loading-hint">正在打开...</div>}>
          <Routes>
            <Route element={<AppLayout session={session} onLogout={logout} />}>
              <Route path="/" element={<Navigate to="/scripts" replace />} />
              <Route path="/scripts" element={<ScriptGeneratorPage />} />
              <Route path="/moments" element={<MomentsPage />} />
              <Route path="/articles" element={<ArticlePublisherPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/backend" element={session.isModelAdmin ? <BackendManagerPage /> : <Navigate to="/scripts" replace />} />
              <Route path="/models" element={<ModelSettingsPage />} />
            </Route>
          </Routes>
        </Suspense>
      </HashRouter>
      )}
    </AppErrorBoundary>
  );
}
