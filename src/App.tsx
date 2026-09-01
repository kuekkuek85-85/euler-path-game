import { Suspense, lazy } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { SessionProvider } from './state/SessionContext';
import { Entry } from './pages/Entry';
import { StageSelect } from './pages/StageSelect';
import { Play } from './pages/Play';
import { Result } from './pages/Result';

// 수업 중 대부분의 시간은 플레이 화면에 머문다.
// 대시보드·교사 모드는 필요할 때만 내려받는다 (PRD 7.2 최초 로드 3초).
const Dashboard = lazy(() =>
  import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })),
);
const Teacher = lazy(() =>
  import('./pages/Teacher').then((module) => ({ default: module.Teacher })),
);

function Loading() {
  return (
    <div className="flex min-h-full items-center justify-center text-sm text-slate-500">
      불러오는 중…
    </div>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <Router>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Entry />} />
            <Route path="/stages" element={<StageSelect />} />
            <Route path="/play/:stageId" element={<Play />} />
            <Route path="/result" element={<Result />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/teacher" element={<Teacher />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Router>
    </SessionProvider>
  );
}
