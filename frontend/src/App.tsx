import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { BusinessDesktopPage } from '@/pages/BusinessDesktopPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PortalChooserPage } from '@/pages/PortalChooserPage'
import { UserPhonePage } from '@/pages/UserPhonePage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PortalChooserPage />} />
      <Route path="/user" element={<UserPhonePage />} />
      <Route path="/business" element={<BusinessDesktopPage />} />
      <Route path="/demo" element={<Navigate to="/business" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
