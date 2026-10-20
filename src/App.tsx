"use client";

import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { lazy, Suspense } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import AdaptiveNavigation from "./components/AdaptiveNavigation";
import AppHeader from "./components/AppHeader";
import ResponsiveTableEnhancer from "./components/ResponsiveTableEnhancer";
import PwaUpdatePrompt from "./components/PwaUpdatePrompt";
import IdleLogout from "./components/IdleLogout";
import LoginPage from "./pages/login/page";
import NewSale from "./pages/NewSale";
import Sortie from "./pages/Sortie";
import Entry from "./pages/Entry";
import { RequireAuth } from "./components/RequireAuth";
import { RequireModule } from "./components/RequireModule";
import { AuthProvider } from "./context/AuthProvider";
import { SidebarProvider, useSidebar } from "./context/SidebarContext";
import { ConnectivityProvider } from "./context/ConnectivityContext";
import Landing from "./pages/Landing";
import { useAuth } from "./hooks/useAuth";

// Back-office screens load on demand (Recharts, jsPDF tables…). They are
// still precached by the service worker, so they open offline too. The POS,
// and login screens stay in the main bundle for instant start.
const Products = lazy(() => import("./pages/products/products"));
const SalesHistory = lazy(() => import("./pages/history/SalesHistory"));
const Dashboard = lazy(() => import("./pages/dashboard/Dashboard"));
const Analytics = lazy(() => import("./pages/analytics/Analytics"));
const Customers = lazy(() => import("./pages/customers/Customers"));
const SortieHistory = lazy(() => import("./pages/SortieHistory"));
const Rate = lazy(() => import("./pages/Rate"));
const EntryHistory = lazy(() => import("./pages/EntryHistory"));
const Management = lazy(() => import("./pages/management/Management"));
const ScanReceipt = lazy(() => import("./pages/scanner/ScanReceipt"));
const SyncCenter = lazy(() => import("./pages/sync/SyncCenter"));
const OfflinePinSetup = lazy(() => import("./pages/security/OfflinePinSetup"));

function AppLayout() {
  const { isAuthenticated, loading } = useAuth();
  const { pathname } = useLocation();
  const showWorkspaceNavigation = isAuthenticated && pathname !== "/" && pathname !== "/login";
  const { sidebarWidth } = useSidebar();

  if (loading) {
    return <div className="app-loading" role="status" aria-live="polite"><span className="app-loading-spinner" />Chargement de votre espace…</div>;
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {showWorkspaceNavigation && <AdaptiveNavigation />}

      {/* Main content shifts smoothly as sidebar expands/collapses */}
      <main
        className="app-main min-h-screen min-w-0 flex-1 overflow-x-clip"
        style={{
          marginLeft: showWorkspaceNavigation ? sidebarWidth : 0,
          transition: "margin-left 0.25s ease-in-out",
        }}
      >
        <ResponsiveTableEnhancer />
        {showWorkspaceNavigation && <AppHeader />}
        <Suspense fallback={<div className="app-loading" role="status" aria-live="polite"><span className="app-loading-spinner" />Chargement…</div>}>
        <Routes>
          <Route
            path="/products"
            element={
              <RequireAuth>
                <RequireModule moduleId="products">
                  <Products />
                </RequireModule>
              </RequireAuth>
            }
          />
          <Route
            path="/new-sale"
            element={
              <RequireAuth>
                <RequireModule moduleId="pos">
                  <NewSale />
                </RequireModule>
              </RequireAuth>
            }
          />
          <Route
            path="/entry"
            element={
              <RequireAuth>
                <RequireModule moduleId="entry">
                  <Entry />
                </RequireModule>
              </RequireAuth>
            }
          />
          <Route
            path="/entryhistory"
            element={
              <RequireAuth>
                <RequireModule moduleId="entryhistory">
                  <EntryHistory />
                </RequireModule>
              </RequireAuth>
            }
          />
          <Route
            path="/EntryHistory"
            element={
              <RequireAuth>
                <RequireModule moduleId="entryhistory">
                  <EntryHistory />
                </RequireModule>
              </RequireAuth>
            }
          />
          <Route
            path="/rate"
            element={
              <RequireAuth>
                <RequireModule moduleId="rate">
                  <Rate />
                </RequireModule>
              </RequireAuth>
            }
          />
          <Route
            path="/sortie"
            element={
              <RequireAuth>
                <RequireModule moduleId="sortie">
                  <Sortie />
                </RequireModule>
              </RequireAuth>
            }
          />
          <Route
            path="/sortiehistory"
            element={
              <RequireAuth>
                <RequireModule moduleId="sortiehistory">
                  <SortieHistory />
                </RequireModule>
              </RequireAuth>
            }
          />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Landing />
              </RequireAuth>
            }
          />
          <Route
            path="/sales"
            element={
              <RequireAuth>
                <RequireModule moduleId="sales">
                  <SalesHistory />
                </RequireModule>
              </RequireAuth>
            }
          />
          <Route
            path="/scan"
            element={
              <RequireAuth>
                <RequireModule moduleId="scanner">
                  <ScanReceipt />
                </RequireModule>
              </RequireAuth>
            }
          />
          <Route
            path="/sync-center"
            element={
              <RequireAuth>
                <RequireModule moduleId="sync">
                  <SyncCenter />
                </RequireModule>
              </RequireAuth>
            }
          />
          <Route
            path="/offline-pin-setup"
            element={
              <RequireAuth>
                <RequireModule moduleId="pos">
                  <OfflinePinSetup />
                </RequireModule>
              </RequireAuth>
            }
          />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <RequireModule moduleId="dashboard">
                  <Dashboard />
                </RequireModule>
              </RequireAuth>
            }
          />
          <Route
            path="/reports"
            element={
              <RequireAuth>
                <RequireModule moduleId="reports">
                  <Analytics />
                </RequireModule>
              </RequireAuth>
            }
          />
          <Route
            path="/customers"
            element={
              <RequireAuth>
                <RequireModule moduleId="customers">
                  <Customers />
                </RequireModule>
              </RequireAuth>
            }
          />
          <Route
            path="/management"
            element={
              <RequireAuth>
                <RequireModule moduleId="management">
                  <Management />
                </RequireModule>
              </RequireAuth>
            }
          />
          <Route
            path="/login"
            element={
              isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
            }
          />
          <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/login"} replace />} />
        </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ConnectivityProvider>
        <SidebarProvider>
          <Router>
            <ToastContainer position="top-right" autoClose={3000} newestOnTop closeButton hideProgressBar />
            <PwaUpdatePrompt />
            <IdleLogout />
            <AppLayout />
          </Router>
        </SidebarProvider>
      </ConnectivityProvider>
    </AuthProvider>
  );
}
