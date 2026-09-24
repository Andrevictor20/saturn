import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { InstallProvider } from './contexts/InstallContext';
import { StatsProvider } from './contexts/StatsContext';
import { AlertsProvider } from './contexts/AlertsContext';
import { BatchUpdateProvider } from './contexts/BatchUpdateContext';
import { UploadManagerProvider } from './contexts/UploadManagerContext';
import { SystemUpdateProvider } from './contexts/SystemUpdateContext';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './contexts/ThemeContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { Loader2 } from 'lucide-react';

// Code Splitting & Dynamic Route Imports for Minimal Memory Footprint
const Overview = lazy(() => import('./pages/Overview').then(m => ({ default: m.Overview })));
const Containers = lazy(() => import('./pages/Containers').then(m => ({ default: m.Containers })));
const ContainerDetail = lazy(() => import('./pages/ContainerDetail').then(m => ({ default: m.ContainerDetail })));
const AppStore = lazy(() => import('./pages/AppStore').then(m => ({ default: m.AppStore })));
const AppDetail = lazy(() => import('./pages/AppDetail').then(m => ({ default: m.AppDetail })));
const Images = lazy(() => import('./pages/Images').then(m => ({ default: m.Images })));
const Networks = lazy(() => import('./pages/Networks').then(m => ({ default: m.Networks })));
const Terminal = lazy(() => import('./pages/Terminal').then(m => ({ default: m.Terminal })));
const Metrics = lazy(() => import('./pages/Metrics').then(m => ({ default: m.Metrics })));
const Volumes = lazy(() => import('./pages/Volumes').then(m => ({ default: m.Volumes })));
const Logs = lazy(() => import('./pages/Logs').then(m => ({ default: m.Logs })));
const FileManager = lazy(() => import('./pages/FileManager').then(m => ({ default: m.FileManager })));
const DiskAnalyzer = lazy(() => import('./pages/DiskAnalyzer').then(m => ({ default: m.DiskAnalyzer })));
const HomeAssistant = lazy(() => import('./pages/HomeAssistant').then(m => ({ default: m.HomeAssistant })));
const PiHole = lazy(() => import('./pages/PiHole').then(m => ({ default: m.PiHole })));
const Cloudflare = lazy(() => import('./pages/Cloudflare').then(m => ({ default: m.Cloudflare })));
const Backups = lazy(() => import('./pages/Backups'));
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Setup = lazy(() => import('./pages/Setup').then(m => ({ default: m.Setup })));
const SystemUpdating = lazy(() => import('./pages/SystemUpdating').then(m => ({ default: m.SystemUpdating })));

function PageFallback() {
  return (
    <div className="flex-1 flex flex-col min-h-[60vh] p-3.5 sm:p-6 lg:p-8 animate-fade-in w-full max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-40 sm:w-56 rounded-xl bg-accent/40 animate-pulse" />
          <div className="h-3.5 w-60 sm:w-80 rounded-lg bg-accent/25 animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 rounded-xl bg-accent/30 animate-pulse hidden sm:block" />
          <div className="h-9 w-9 rounded-xl bg-accent/30 animate-pulse" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-card/50 border border-border/50 p-4 space-y-3 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-20 rounded-md bg-accent/40 animate-pulse" />
              <div className="h-8 w-8 rounded-xl bg-saturn-500/10 animate-pulse" />
            </div>
            <div className="h-6 w-16 rounded-md bg-accent/50 animate-pulse" />
          </div>
        ))}
      </div>

      <div className="h-64 rounded-3xl bg-card/40 border border-border/50 p-6 flex flex-col justify-center items-center gap-3 backdrop-blur-xl">
        <Loader2 className="w-7 h-7 animate-spin text-saturn-500/70" />
        <span className="text-xs text-secondary/70 font-medium tracking-wide">Carregando interface...</span>
      </div>
    </div>
  );
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" defaultColor="zinc">
      <ConfirmProvider>
        <SettingsProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
            <InstallProvider>
            <BrowserRouter>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/setup" element={<Setup />} />
                <Route path="/updating" element={<SystemUpdating />} />
                
                {/* Protected Dashboard Routes */}
                <Route 
                  path="/*" 
                  element={
                    <ProtectedRoute>
                      <StatsProvider>
                        <AlertsProvider>
                          <BatchUpdateProvider>
                            <UploadManagerProvider>
                              <SystemUpdateProvider>
                                <DashboardLayout>
                                  <Suspense fallback={<PageFallback />}>
                                    <Routes>
                                      <Route path="/" element={<Overview />} />
                                      <Route path="/metrics" element={<Metrics />} />
                                      <Route path="/containers" element={<Containers />} />
                                      <Route path="/containers/:id" element={<ContainerDetail />} />
                                      <Route path="/store" element={<AppStore />} />
                                      <Route path="/store/app/:id" element={<AppDetail />} />
                                      <Route path="/compose" element={<Navigate to="/store?custom=true" replace />} />
                                      <Route path="/images" element={<AdminRoute><Images /></AdminRoute>} />
                                      <Route path="/networks" element={<AdminRoute><Networks /></AdminRoute>} />
                                      <Route path="/volumes" element={<AdminRoute><Volumes /></AdminRoute>} />
                                      <Route path="/backups" element={<AdminRoute><Backups /></AdminRoute>} />
                                      <Route path="/files" element={<FileManager />} />
                                      <Route path="/disk-analyzer" element={<DiskAnalyzer />} />
                                      <Route path="/terminal" element={<AdminRoute><Terminal /></AdminRoute>} />
                                      <Route path="/logs" element={<Logs />} />
                                      <Route path="/homeassistant" element={<AdminRoute><HomeAssistant /></AdminRoute>} />
                                      <Route path="/pihole" element={<AdminRoute><PiHole /></AdminRoute>} />
                                      <Route path="/cloudflare" element={<AdminRoute><Cloudflare /></AdminRoute>} />
                                      <Route path="*" element={<Navigate to="/" replace />} />
                                    </Routes>
                                  </Suspense>
                                </DashboardLayout>
                              </SystemUpdateProvider>
                            </UploadManagerProvider>
                          </BatchUpdateProvider>
                        </AlertsProvider>
                      </StatsProvider>
                    </ProtectedRoute>
                  } 
                />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </InstallProvider>
        <Toaster 
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--card)',
              color: 'var(--primary)',
              border: '1px solid var(--border)',
            },
            success: {
              iconTheme: {
                primary: 'var(--saturn-500)',
                secondary: 'var(--bg)',
              },
            },
          }}
        />
        </AuthProvider>
        </QueryClientProvider>
      </SettingsProvider>
      </ConfirmProvider>
    </ThemeProvider>
  );
}

export default App;
