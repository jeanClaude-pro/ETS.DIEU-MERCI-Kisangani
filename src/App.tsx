"use client";

import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import AdaptiveNavigation from "./components/AdaptiveNavigation";
import ResponsiveTableEnhancer from "./components/ResponsiveTableEnhancer";
import PwaUpdatePrompt from "./components/PwaUpdatePrompt";
import Products from "./pages/products/products";
import SalesHistory from "./pages/history/SalesHistory";
import Dashboard from "./pages/dashboard/Dashboard";
import Analytics from "./pages/analytics/Analytics";
import Customers from "./pages/customers/Customers";
import LoginPage from "./pages/login/page";
import NewSale from "./pages/NewSale";
import Reservation from "./pages/Reservation";
import ReservationHistory from "./pages/ReservationHistory";
import Sortie from "./pages/Sortie";
import SortieHistory from "./pages/SortieHistory";
import Rate from "./pages/Rate";
import Entry from "./pages/Entry";
import EntryHistory from "./pages/EntryHistory";
import { RequireAuth } from "./components/RequireAuth";
import { RequireModule } from "./components/RequireModule";
import { AuthProvider } from "./context/AuthProvider";
import { SidebarProvider, useSidebar } from "./context/SidebarContext";
import Management from "./pages/management/Management";

function AppLayout() {
  const token = localStorage.getItem("token");
  const isAuthenticated = !!token;
  const { sidebarWidth } = useSidebar();

  return (
    <div className="min-h-screen flex bg-background">
      <AdaptiveNavigation />

      {/* Main content shifts smoothly as sidebar expands/collapses */}
      <main
        className="app-main flex-1 overflow-auto min-h-screen min-w-0"
        style={{
          marginLeft: isAuthenticated ? sidebarWidth : 0,
          transition: "margin-left 0.3s ease-in-out",
        }}
      >
        <ResponsiveTableEnhancer />
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
            path="/reservation"
            element={
              <RequireAuth>
                <RequireModule moduleId="reservation">
                  <Reservation />
                </RequireModule>
              </RequireAuth>
            }
          />
          <Route
            path="/reservationhistory"
            element={
              <RequireAuth>
                <RequireModule moduleId="reservations">
                  <ReservationHistory />
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
                <RequireModule moduleId="pos">
                  <NewSale />
                </RequireModule>
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
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SidebarProvider>
        <Router>
          <ToastContainer position="top-right" autoClose={3000} newestOnTop />
          <PwaUpdatePrompt />
          <AppLayout />
        </Router>
      </SidebarProvider>
    </AuthProvider>
  );
}
