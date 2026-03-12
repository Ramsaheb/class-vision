import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import {
  LayoutDashboard, Activity, HelpCircle, Menu, X, Eye, Sun, Moon,
  Users, History, AlertTriangle, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem('coris-sb') !== '0'; } catch { return true; }
  });

  const toggleSidebar = () => {
    const next = !sidebarOpen;
    setSidebarOpen(next);
    try { localStorage.setItem('coris-sb', next ? '1' : '0'); } catch { /* ignore */ }
  };

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, desc: 'Overview & KPIs' },
    { name: 'Live Monitor', href: '/live-analytics', icon: Activity, desc: 'Real-time feed' },
    { name: 'Students', href: '/students', icon: Users, desc: 'Profiles & insights' },
    { name: 'Sessions', href: '/sessions', icon: History, desc: 'Run history' },
    { name: 'Defaulters', href: '/defaulters', icon: AlertTriangle, desc: 'Alerts & actions' },
    { name: 'Help', href: '/help', icon: HelpCircle, desc: 'Docs & FAQ' },
  ];

  const isActive = (href: string) =>
    location.pathname === href || (href === '/dashboard' && location.pathname === '/');

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar – fixed, slides via translateX */}
      <aside
        className={
          'fixed inset-y-0 left-0 z-50 w-60 bg-card-light dark:bg-card-dark border-r border-gray-200 dark:border-gray-700 ' +
          'flex flex-col transition-transform duration-300 ease-in-out shadow-lg ' +
          (mobileOpen ? 'translate-x-0 ' : '-translate-x-full ') +
          (sidebarOpen ? 'lg:translate-x-0' : 'lg:-translate-x-full')
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between h-14 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 px-4">
          <Link to="/" className="flex items-center gap-2 min-w-0" onClick={() => setMobileOpen(false)}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center flex-shrink-0">
              <Eye className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg text-gray-900 dark:text-white tracking-tight">CORIS</span>
          </Link>
          <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-500" />
          </button>
          <button onClick={toggleSidebar} className="hidden lg:block p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" title="Collapse sidebar">
            <PanelLeftClose className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 space-y-0.5 overflow-y-auto px-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setMobileOpen(false)}
                className={
                  'flex items-center gap-3 rounded-lg text-sm font-medium px-3 py-2.5 transition-all ' +
                  (active
                    ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white')
                }
              >
                <Icon className={'w-[18px] h-[18px] flex-shrink-0 ' + (active ? 'text-purple-600 dark:text-purple-400' : '')} />
                <div className="min-w-0">
                  <div className="truncate">{item.name}</div>
                  <div className={'text-[10px] leading-tight truncate ' + (active ? 'text-purple-500 dark:text-purple-400' : 'text-gray-400 dark:text-gray-500')}>
                    {item.desc}
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 py-3 px-4 flex-shrink-0">
          <div className="text-[10px] text-gray-400 dark:text-gray-500">
            CORIS v2.0 &middot; Classroom AI
          </div>
        </div>
      </aside>

      {/* Main content – margin-left transitions with sidebar */}
      <div className={'flex flex-col min-h-screen transition-[margin] duration-300 ease-in-out ' + (sidebarOpen ? 'lg:ml-60' : 'lg:ml-0')}>
        <header className="sticky top-0 z-30 h-14 bg-card-light/80 dark:bg-card-dark/80 backdrop-blur border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
              <Menu className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            {!sidebarOpen && (
              <button onClick={toggleSidebar} className="hidden lg:block p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700" title="Expand sidebar">
                <PanelLeftOpen className="w-4 h-4 text-gray-500" />
              </button>
            )}
            <h1 className="text-base font-semibold text-gray-900 dark:text-white">
              {navigation.find((n) => isActive(n.href))?.name || 'Dashboard'}
            </h1>
          </div>
          <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" title={isDark ? 'Light mode' : 'Dark mode'}>
            {isDark ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4 text-gray-600" />}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
};

export default Layout;
