import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import LiveAnalytics from './pages/LiveAnalytics';
import Students from './pages/Students';
import Sessions from './pages/Sessions';
import Defaulters from './pages/Defaulters';
import Help from './pages/Help';

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
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;