import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import TrackClaim from './pages/TrackClaim';
import Login from './pages/Login';
import Register from './pages/Register';
import FarmerDashboard from './pages/farmer/FarmerDashboard';
import NewClaim from './pages/farmer/NewClaim';
import Profile from './pages/farmer/Profile';
import ClaimDetail from './pages/ClaimDetail';
import StaffDashboard from './pages/staff/StaffDashboard';
import Users from './pages/staff/Users';
import CropLimits from './pages/staff/CropLimits';
import NotFound from './pages/NotFound';

// The charts library is large, so the analytics page is only downloaded when someone opens it
const Analytics = lazy(() => import('./pages/staff/Analytics'));

export default function App() {
  return (
    <>
      <Navbar />
      <main className="container">
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/track" element={<TrackClaim />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            <Route element={<ProtectedRoute roles={['farmer']} />}>
              <Route path="/farmer" element={<FarmerDashboard />} />
              <Route path="/farmer/new" element={<NewClaim />} />
              <Route path="/farmer/profile" element={<Profile />} />
            </Route>

            <Route element={<ProtectedRoute roles={['farmer', 'officer', 'admin']} />}>
              <Route path="/claims/:id" element={<ClaimDetail />} />
            </Route>

            <Route element={<ProtectedRoute roles={['officer', 'admin']} />}>
              <Route path="/staff" element={<StaffDashboard />} />
              <Route path="/staff/analytics" element={<Analytics />} />
            </Route>

            <Route element={<ProtectedRoute roles={['admin']} />}>
              <Route path="/staff/users" element={<Users />} />
              <Route path="/staff/crop-limits" element={<CropLimits />} />
            </Route>

            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
    </>
  );
}
