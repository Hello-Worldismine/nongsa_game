import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';

const App = lazy(() => import('./app/App'));
const ArtGallery = lazy(() => import('./app/ArtGallery'));

if (import.meta.env.DEV) {
  // 개발/테스트용 디버그 핸들
  void import('./stores/gameStore').then((m) => { (window as unknown as { __store: unknown }).__store = m.useGame; });
}

const isGallery = import.meta.env.DEV && new URLSearchParams(location.search).has('gallery');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="boot-loading">햇살마을로 가는 중…</div>}>
      {isGallery ? <ArtGallery /> : <App />}
    </Suspense>
  </StrictMode>,
);
