"use client";

import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import Sidebar from "./components/Sidebar";
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
import { AuthProvider } from "./context/AuthProvider";
import { SidebarProvider, useSidebar } from "./context/SidebarContext";

function AppLayout() {
  const token = localStorage.getItem("token");
  const isAuthenticated = !!token;
  const { sidebarWidth } = useSidebar();

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />

      {/* Main content shifts smoothly as sidebar expands/collapses */}
      <main
        className="flex-1 overflow-auto min-h-screen"
        style={{
          marginLeft: sidebarWidth,
          transition: "margin-left 0.3s ease-in-out",
        }}
      >
        <Routes>
          <Route
            path="/products"
            element={
              <RequireAuth>
                <Products />
              </RequireAuth>
            }
          />
          <Route
            path="/new-sale"
            element={
              <RequireAuth>
                <NewSale />
              </RequireAuth>
            }
          />
          <Route
            path="/entry"
            element={
              <RequireAuth>
                <Entry />
              </RequireAuth>
            }
          />
          <Route
            path="/entryhistory"
            element={
              <RequireAuth>
                <EntryHistory />
              </RequireAuth>
            }
          />
          <Route
            path="/EntryHistory"
            element={
              <RequireAuth>
                <EntryHistory />
              </RequireAuth>
            }
          />
          <Route
            path="/rate"
            element={
              <RequireAuth>
                <Rate />
              </RequireAuth>
            }
          />
          <Route
            path="/sortie"
            element={
              <RequireAuth>
                <Sortie />
              </RequireAuth>
            }
          />
          <Route
            path="/reservation"
            element={
              <RequireAuth>
                <Reservation />
              </RequireAuth>
            }
          />
          <Route
            path="/reservationhistory"
            element={
              <RequireAuth>
                <ReservationHistory />
              </RequireAuth>
            }
          />
          <Route
            path="/sortiehistory"
            element={
              <RequireAuth>
                <SortieHistory />
              </RequireAuth>
            }
          />
          <Route
            path="/"
            element={
              <RequireAuth>
                <NewSale />
              </RequireAuth>
            }
          />
          <Route
            path="/sales"
            element={
              <RequireAuth>
                <SalesHistory />
              </RequireAuth>
            }
          />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/reports"
            element={
              <RequireAuth>
                <Analytics />
              </RequireAuth>
            }
          />
          <Route
            path="/customers"
            element={
              <RequireAuth>
                <Customers />
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
          <AppLayout />
        </Router>
      </SidebarProvider>
    </AuthProvider>
  );
}
