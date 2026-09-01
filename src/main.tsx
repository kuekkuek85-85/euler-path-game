import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { assertStageDataInDev } from './data/stages';
import './index.css';

// 개발 모드에서 스테이지 데이터가 실제로 풀리는지 즉시 확인한다 (PRD 4.3).
assertStageDataInDev();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
