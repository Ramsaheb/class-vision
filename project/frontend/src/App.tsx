import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import LiveAnalytics from './pages/LiveAnalytics';
import Students from './pages/Students';
import Sessions from './pages/Sessions';
import Defaulters from './pages/Defaulters';
import Help from './pages/Help';

const NotFound = () => (
  <div className="flex flex-col items-center justify-center h-80 gap-4">
    <p className="text-6xl font-extrabold text-gray-200 dark:text-gray-800">404</p>
    <p className="text-sm text-gray-500 dark:text-gray-400">Page not found</p>
    <Link to="/" className="btn-primary text-sm">Go to Dashboard</Link>
  </div>
);

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/live-analytics" element={<LiveAnalytics />} />
          <Route path="/students" element={<Students />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/defaulters" element={<Defaulters />} />
          <Route path="/help" element={<Help />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;