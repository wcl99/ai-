import { Navigate, Route, Routes } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppShell } from './components/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { ReportsPage, TasksPage, VulnerabilitiesPage } from './pages/ListPages';
import { AssetsPage, SettingsPage } from './pages/ManagementPages';
import { AuthorizationPage } from './pages/AuthorizationPage';
import { TeamPage } from './pages/TeamPage';
import { ReportOverviewPage, VulnerabilityOverviewPage } from './pages/OverviewPages';
import { VulnerabilityDetailPage } from './pages/VulnerabilityDetailPage';
import { PentestPage, PentestSessionPage } from './pages/PentestPage';

export function App({ localAuthBypass = false }: { localAuthBypass?: boolean }) {
  const location = useLocation();
  if (location.pathname === '/login') {
    if (localAuthBypass) return <Navigate to="/overview" replace />;
    return <Routes><Route path="/login" element={<LoginPage />} /></Routes>;
  }
  return (
    <ProtectedRoute>
      <AppShell>
        <Routes>
          <Route path="/overview" element={<DashboardPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/vulnerabilities/overview" element={<VulnerabilityOverviewPage />} />
          <Route path="/vulnerabilities" element={<VulnerabilitiesPage />} />
          <Route path="/vulnerabilities/:vulnerabilityId" element={<VulnerabilityDetailPage />} />
          <Route path="/reports/overview" element={<ReportOverviewPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/pentest" element={<PentestPage />} />
          <Route path="/pentest/session/:sessionId" element={<PentestSessionPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/team" element={<TeamPage />} />
          <Route path="/settings/authorization" element={<AuthorizationPage />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </AppShell>
    </ProtectedRoute>
  );
}
