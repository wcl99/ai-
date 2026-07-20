import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell, EmptyStatePage } from './components/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { ReportsPage, TasksPage, VulnerabilitiesPage } from './pages/ListPages';
import { PentestPage, PentestSessionPage } from './pages/PentestPage';

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/overview" element={<DashboardPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/assets" element={<EmptyStatePage title="资产中心" />} />
        <Route path="/vulnerabilities" element={<VulnerabilitiesPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/pentest" element={<PentestPage />} />
        <Route path="/pentest/session/:sessionId" element={<PentestSessionPage />} />
        <Route path="/settings" element={<EmptyStatePage title="平台设置" />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </AppShell>
  );
}
