import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import {
  LayoutDashboard, Activity, HelpCircle, Menu, X, Eye, Sun, Moon,
  Users, History, AlertTriangle, PanelLeftClose, PanelLeftOpen,
  ChevronRight, Sparkles, Database,
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
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, desc: 'Overview & Analytics', color: 'from-violet-500 to-purple-600' },
    { name: 'Live Monitor', href: '/live-analytics', icon: Activity, desc: 'Real-time video feed', color: 'from-emerald-500 to-teal-600' },
    { name: 'Students', href: '/students', icon: Users, desc: 'Profiles & insights', color: 'from-blue-500 to-cyan-600' },
    { name: 'Sessions', href: '/sessions', icon: History, desc: 'Run history & data', color: 'from-amber-500 to-orange-600' },
    { name: 'Defaulters', href: '/defaulters', icon: AlertTriangle, desc: 'Alerts & actions', color: 'from-red-500 to-rose-600' },
    { name: 'Help', href: '/help', icon: HelpCircle, desc: 'Documentation', color: 'from-slate-500 to-gray-600' },
  ];

  const isActive = (href: string) =>
    location.pathname === href || (href === '/dashboard' && location.pathname === '/');

  const currentNav = navigation.find(n => isActive(n.href)) || navigation[0];

  // Breadcrumb
  const breadcrumbs = [
    { name: 'CORIS', href: '/' },
    { name: currentNav.name, href: currentNav.href },
  ];

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={
          'fixed inset-y-0 left-0 z-50 w-[260px] flex flex-col transition-transform duration-300 ease-in-out ' +
          'bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 shadow-glass dark:shadow-glass-dark ' +
          (mobileOpen ? 'translate-x-0 ' : '-translate-x-full ') +
          (sidebarOpen ? 'lg:translate-x-0' : 'lg:-translate-x-full')
        }
      >
        {/* Logo/Brand */}
        <div className="flex items-center justify-between h-16 border-b border-gray-100 dark:border-gray-800 flex-shrink-0 px-5">
          <Link to="/" className="flex items-center gap-3 min-w-0 group" onClick={() => setMobileOpen(false)}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center flex-shrink-0 shadow-glow-purple group-hover:shadow-lg transition-shadow">
              <Eye className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <span className="font-extrabold text-lg text-gray-900 dark:text-white tracking-tight block leading-tight">CORIS</span>
              <span className="text-[9px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest">AI Classroom</span>
            </div>
          </Link>
          <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
          <button onClick={toggleSidebar} className="hidden lg:flex p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Collapse sidebar">
            <PanelLeftClose className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-5 overflow-y-auto px-3 space-y-1">
          <p className="px-3 mb-3 text-[10px] font-bold text-gray-400 dark:text-gray-600 uppercase tracking-[0.15em]">Navigation</p>
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setMobileOpen(false)}
                className={
                  'group flex items-center gap-3 rounded-xl text-sm font-medium px-3 py-2.5 transition-all duration-200 relative ' +
                  (active
                    ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-white')
                }
              >
                {active && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-gradient-to-b from-primary-400 to-primary-600 rounded-r-full" />
                )}
                <div className={
                  'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ' +
                  (active
                    ? 'bg-gradient-to-br ' + item.color + ' text-white shadow-md'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 group-hover:bg-gray-200 dark:group-hover:bg-gray-700')
                }>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-[13px]">{item.name}</div>
                  <div className={'text-[10px] leading-tight truncate ' + (active ? 'text-primary-500/70 dark:text-primary-400/60' : 'text-gray-400 dark:text-gray-600')}>
                    {item.desc}
                  </div>
                </div>
                {active && <ChevronRight className="w-3.5 h-3.5 text-primary-400 dark:text-primary-500 flex-shrink-0" />}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="border-t border-gray-100 dark:border-gray-800 p-4 flex-shrink-0">
          <div className="flex items-center gap-3 px-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center flex-shrink-0">
              <Database className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">SQLite Database</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">Persistent Storage Active</p>
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
          </div>
          <div className="mt-3 px-1">
            <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
              <Sparkles className="w-3 h-3" />
              <span>CORIS v2.0 &middot; AI-Powered</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className={'flex flex-col min-h-screen transition-[margin] duration-300 ease-in-out ' + (sidebarOpen ? 'lg:ml-[260px]' : 'lg:ml-0')}>
        {/* Top Header */}
        <header className="sticky top-0 z-30 h-16 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800 flex items-center justify-between px-5 gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <Menu className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
            {!sidebarOpen && (
              <button onClick={toggleSidebar} className="hidden lg:flex p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Expand sidebar">
                <PanelLeftOpen className="w-4 h-4 text-gray-500" />
              </button>
            )}
            {/* Breadcrumb */}
            <nav className="hidden sm:flex items-center gap-1.5 text-sm">
              {breadcrumbs.map((bc, i) => (
                <React.Fragment key={bc.href}>
                  {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />}
                  <Link
                    to={bc.href}
                    className={
                      i === breadcrumbs.length - 1
                        ? 'font-semibold text-gray-900 dark:text-white'
                        : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors'
                    }
                  >
                    {bc.name}
                  </Link>
                </React.Fragment>
              ))}
            </nav>
            <h1 className="sm:hidden text-base font-bold text-gray-900 dark:text-white">
              {currentNav.name}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun className="w-[18px] h-[18px] text-amber-400" /> : <Moon className="w-[18px] h-[18px] text-gray-500" />}
            </button>

            {/* User avatar */}
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xs font-bold shadow-md cursor-default" title="Admin">
              A
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">{children}</main>

        {/* Footer */}
        <footer className="border-t border-gray-100 dark:border-gray-800 px-6 py-3 flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-600">
          <span>&copy; 2026 CORIS &middot; Classroom Observation & Recognition Intelligence System</span>
          <span className="hidden sm:block">Powered by YOLOv8 + FaceNet + FastAPI + React</span>
        </footer>
      </div>
    </div>
  );
};

export default Layout;
