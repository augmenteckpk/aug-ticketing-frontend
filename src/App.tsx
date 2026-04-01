import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { AuthProvider } from './context/AuthContext'
import { LoginPage } from './pages/LoginPage'
import { DashboardHome } from './pages/DashboardHome'
import { HospitalsPage } from './pages/admin/HospitalsPage'
import { CentersPage } from './pages/admin/CentersPage'
import { DepartmentsPage } from './pages/admin/DepartmentsPage'
import { UsersPage } from './pages/admin/UsersPage'
import { RolesPage } from './pages/admin/RolesPage'
import { CheckInPage } from './pages/reception/CheckInPage'
import { QueuePage } from './pages/queue/QueuePage'
import { AppointmentsPage } from './pages/appointments/AppointmentsPage'
import { ReportsPage } from './pages/ReportsPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/app"
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardHome />} />
            <Route path="appointments" element={<AppointmentsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="reception" element={<CheckInPage />} />
            <Route path="queue" element={<QueuePage />} />
            <Route path="hospitals" element={<HospitalsPage />} />
            <Route path="centers" element={<CentersPage />} />
            <Route path="departments" element={<DepartmentsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="roles" element={<RolesPage />} />
          </Route>
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
