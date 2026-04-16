import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Login from './pages/Login';
import PrincipalDashboard from './pages/PrincipalDashboard';
import HODDashboard from './pages/HODDashboard';
import PrivateRoute from './components/PrivateRoute';
import Voting from './components/Voting';

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/principal/dashboard"
            element={
              <PrivateRoute allowedRoles={['principal']}>
                <PrincipalDashboard />
              </PrivateRoute>
            }
          />

          <Route
            path="/hod/dashboard"
            element={
              <PrivateRoute allowedRoles={['hod']}>
                <HODDashboard />
              </PrivateRoute>
            }
          />

          <Route path="/v" element={<Voting />} />

          <Route path="/" element={<Navigate to="/login" replace />} />
          {/* Catch all redirect to login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
