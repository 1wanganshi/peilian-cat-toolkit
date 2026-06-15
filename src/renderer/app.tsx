import type { JSX } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/app-layout';
import { ArticlePublisherPage } from './pages/article-publisher-page';
import { BackendManagerPage } from './pages/backend-manager-page';
import { MomentsPage } from './pages/moments-page';
import { ScriptGeneratorPage } from './pages/script-generator-page';

export function App(): JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/scripts" replace />} />
          <Route path="/scripts" element={<ScriptGeneratorPage />} />
          <Route path="/moments" element={<MomentsPage />} />
          <Route path="/articles" element={<ArticlePublisherPage />} />
          <Route path="/backend" element={<BackendManagerPage />} />
          <Route path="/models" element={<Navigate to="/backend" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
