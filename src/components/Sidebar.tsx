"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  LogIn,
  User,
  Clock,
  Menu,
  X,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useSidebar } from "../context/SidebarContext";
import { isNavigationItemActive, permittedNavigationSections } from "./navigationConfig";
import { useOfflineQueueCounts } from "../hooks/useOfflineQueue";

const clsx = (...classes: (string | undefined | null | false)[]): string => {
  return classes.filter(Boolean).join(" ");
};


const isAllowedTime = (): boolean => {
  const now = new Date();
  const currentHour = now.getHours();
  return currentHour >= 7 && currentHour < 20;
};

const isSunday = (): boolean => {
  return new Date().getDay() === 0;
};

const hasRestrictedAccess = (userRole: string | undefined): boolean => {
  if (userRole === "admin") return false;
  return !isAllowedTime() || isSunday();
};

export default function Sidebar() {
  const { isCollapsed, setIsCollapsed, isMobile, isMobileOpen, setIsMobileOpen } = useSidebar();
  const [currentTime, setCurrentTime] = useState(new Date());
  const location = useLocation();
  const { activeUser: user, isAuthenticated, clearAuth } = useAuth();
  const navigate = useNavigate();
  const { pending, attention } = useOfflineQueueCounts();

  const sidebarRef = useRef<HTMLElement>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndX = useRef(0);

  const isAuthed = isAuthenticated && Boolean(user);
  const isNonAdmin = user?.role !== "admin";
  const isRestricted = isNonAdmin && hasRestrictedAccess(user?.role);
  const showTimeWarning = isRestricted;

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Auto-logout for restricted non-admin users
  useEffect(() => {
    if (isAuthed && isNonAdmin) {
      if (isRestricted) {
        const logoutTimer = setTimeout(() => {
          clearAuth();
          navigate("/login?message=auto_logout", { replace: true });
        }, 10000);
        return () => clearTimeout(logoutTimer);
      }
    }
  }, [clearAuth, isAuthed, isNonAdmin, isRestricted, currentTime, navigate]);

  // Close mobile sidebar when route changes
  useEffect(() => {
    if (isMobile) {
      setIsMobileOpen(false);
    }
  }, [location.pathname, isMobile, setIsMobileOpen]);

  // Touch swipe gestures for mobile
  useEffect(() => {
    const sidebarElement = sidebarRef.current;
    if (!sidebarElement || !isMobile) return;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };
    const handleTouchMove = (e: TouchEvent) => {
      touchEndX.current = e.touches[0].clientX;
    };
    const handleTouchEnd = () => {
      const diffX = touchEndX.current - touchStartX.current;
      const diffY = Math.abs(touchEndX.current - touchStartX.current);
      if (Math.abs(diffX) > 50 && diffY < 100) {
        setIsMobileOpen(diffX > 0);
      }
    };

    sidebarElement.addEventListener("touchstart", handleTouchStart);
    sidebarElement.addEventListener("touchmove", handleTouchMove);
    sidebarElement.addEventListener("touchend", handleTouchEnd);
    return () => {
      sidebarElement.removeEventListener("touchstart", handleTouchStart);
      sidebarElement.removeEventListener("touchmove", handleTouchMove);
      sidebarElement.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isMobile, setIsMobileOpen]);

  const sidebarSections = permittedNavigationSections(user).map((section) => ({
    ...section,
    items: section.items.map((item) => item.id === "sync" ? { ...item, badge: pending + attention || undefined } : item),
  }));

  const toggleSidebar = () => {
    if (isMobile) {
      setIsMobileOpen(!isMobileOpen);
    } else {
      setIsCollapsed(!isCollapsed);
    }
  };

  const handleLogout = () => {
    clearAuth();
    navigate("/login", { replace: true });
  };

  const formatTime = (date: Date): string =>
    date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false });

  const formatDay = (date: Date): string =>
    date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  const getRestrictionMessage = (): string => {
    if (isSunday()) return "L'accès est restreint le dimanche.";
    if (!isAllowedTime())
      return `L'accès est restreint de 20:00 à 07:00.`;
    return "Accès restreint.";
  };

  const isExpanded = isMobile ? isMobileOpen : !isCollapsed;

  const tooltip = (label: React.ReactNode) =>
    isCollapsed && !isMobile ? (
      <span role="tooltip" className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg ring-1 ring-white/10 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
        {label}
      </span>
    ) : null;

  return (
    <>
      {/* Mobile hamburger button */}
      {isMobile && isAuthed && (
        <button
          type="button"
          onClick={toggleSidebar}
          className="fixed left-4 top-4 z-50 grid h-11 w-11 place-items-center rounded-lg bg-slate-900 text-white shadow-lg lg:hidden"
          aria-label={isMobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
        >
          {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      )}

      {/* Mobile overlay backdrop */}
      <AnimatePresence>
        {isMobile && isMobileOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" onClick={() => setIsMobileOpen(false)} />}
      </AnimatePresence>

      {/* Sidebar — always fixed so main content margin controls spacing */}
      <motion.aside
        ref={sidebarRef}
        initial={false}
        animate={{
          width: isMobile ? (isMobileOpen ? 280 : 0) : isCollapsed ? 70 : 280,
          x: isMobile ? (isMobileOpen ? 0 : -280) : 0,
        }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="z-50 flex h-screen flex-col overflow-hidden border-r border-slate-800 bg-slate-900 text-slate-300"
        style={{ position: "fixed", top: 0, left: 0, touchAction: "pan-y" }}
        aria-label="Navigation principale"
      >
        {/* Auto-logout Warning */}
        <AnimatePresence>
          {showTimeWarning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-sm"
              role="alert"
            >
              <div className="w-full max-w-sm rounded-xl border border-red-200 bg-white p-5 text-center text-slate-700 shadow-xl">
                <span className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-red-50 text-red-700">
                  <Clock className="h-5 w-5" />
                </span>
                <h3 className="mt-3 text-base font-semibold text-red-700">Accès restreint</h3>
                <p className="mt-1 text-sm">{getRestrictionMessage()}</p>
                <p className="mt-2 text-xs font-medium text-slate-500">Déconnexion automatique dans 10 secondes…</p>
                <button type="button" onClick={handleLogout} className="ui-btn ui-btn-danger ui-btn-block mt-4">
                  Se déconnecter maintenant
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <div className="flex-shrink-0 border-b border-slate-800 px-3 py-3.5">
          <div className={clsx("flex items-center gap-2", isExpanded ? "justify-between" : "flex-col")}>
            <Link to="/" className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Retour à l’accueil">
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center overflow-hidden rounded-lg bg-white">
                <img src="/Mrcleanlogo.png" alt="" className="h-full w-full object-contain" />
              </span>
              {isExpanded && (
                <span className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-300">Boutique · Kisangani</span>
                  <span className="block text-[13px] font-semibold leading-tight text-white">C’EST DIEU QUI PARTAGE</span>
                </span>
              )}
            </Link>

            {!isMobile && (
              <button
                type="button"
                onClick={toggleSidebar}
                className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label={isCollapsed ? "Déplier la barre latérale" : "Replier la barre latérale"}
                aria-expanded={!isCollapsed}
              >
                {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
            )}
          </div>

          {/* User + clock */}
          {isAuthed && (
            isExpanded ? (
              <div className="mt-3 flex items-center gap-3 rounded-lg bg-slate-800/60 px-2.5 py-2">
                <span className={clsx("grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-white", isNonAdmin && isRestricted ? "bg-red-500" : "bg-blue-600")}>
                  <User className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">{user?.username || "Utilisateur"}</span>
                  <span className={clsx("block truncate text-xs capitalize", isNonAdmin && isRestricted ? "text-red-300" : "text-slate-400")}>
                    {user?.role || "Non défini"}
                    {isNonAdmin && isRestricted && " • Accès restreint"}
                  </span>
                </span>
                <span className="flex-shrink-0 text-right" title={formatDay(currentTime)}>
                  <span className="flex items-center justify-end gap-1 text-xs font-medium tabular-nums text-slate-300">
                    <Clock className="h-3 w-3" />
                    {formatTime(currentTime)}
                  </span>
                </span>
              </div>
            ) : !isMobile ? (
              <div className="group relative mt-3 flex justify-center">
                <span className={clsx("grid h-8 w-8 place-items-center rounded-full text-white", isNonAdmin && isRestricted ? "bg-red-500" : "bg-blue-600")} tabIndex={0} aria-label={`${user?.username || "Utilisateur"} · ${user?.role || ""}`}>
                  <User className="h-4 w-4" />
                </span>
                {tooltip(
                  <span className="block">
                    <span className="block font-medium">{user?.username || "Utilisateur"}</span>
                    <span className="block capitalize text-slate-300">{user?.role || "Non défini"}</span>
                    <span className="mt-1 block text-slate-400">{formatTime(currentTime)} · {formatDay(currentTime)}</span>
                  </span>,
                )}
              </div>
            ) : null
          )}
          {isExpanded && isNonAdmin && isRestricted && (
            <p className="mt-2 text-center text-xs text-red-300">
              {isSunday() ? "Dimanche — accès restreint" : "Accès restreint • Ouverture à 07:00"}
            </p>
          )}
        </div>

        {/* Unauthenticated: show login */}
        {!isAuthed ? (
          <div className="flex-1 p-3">
            <Link to="/login" className="ui-btn ui-btn-primary group relative w-full">
              <LogIn className="h-4 w-4" />
              {isExpanded && <span>Se connecter</span>}
              {tooltip("Se connecter")}
            </Link>
          </div>
        ) : (
          <>
            {/* Authenticated navigation */}
            <nav className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-3 py-4 [scrollbar-width:thin]">
              {sidebarSections.map((section) => (
                <div key={section.title}>
                  {isExpanded ? (
                    <h3 className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {section.title}
                    </h3>
                  ) : (
                    <div className="mx-auto mb-2 h-px w-6 bg-slate-800" aria-hidden="true" />
                  )}

                  <ul className="space-y-0.5">
                    {section.items.map((item) => {
                      const isActive = isNavigationItemActive(location.pathname, item.path);
                      const Icon = item.icon;
                      const isItemDisabled = isNonAdmin && isRestricted;

                      return (
                        <li key={item.id}>
                          <Link
                            to={isItemDisabled ? "#" : item.path}
                            onClick={(e) => {
                              if (isItemDisabled) {
                                e.preventDefault();
                              }
                              if (isMobile) setIsMobileOpen(false);
                            }}
                            aria-current={isActive ? "page" : undefined}
                            aria-disabled={isItemDisabled || undefined}
                            aria-label={!isExpanded ? item.label : undefined}
                            className={clsx(
                              "group relative flex min-h-10 items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                              !isExpanded && "justify-center",
                              isActive && !isItemDisabled
                                ? "bg-blue-600 font-semibold text-white"
                                : isItemDisabled
                                ? "cursor-not-allowed text-slate-600"
                                : "font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
                            )}
                          >
                            <Icon
                              className={clsx(
                                "h-[18px] w-[18px] flex-shrink-0",
                                isActive && !isItemDisabled
                                  ? "text-white"
                                  : isItemDisabled
                                  ? "text-slate-600"
                                  : "text-slate-400 group-hover:text-white"
                              )}
                            />

                            {isExpanded && (
                              <span className="min-w-0 flex-1 truncate">
                                {item.label}
                                {isItemDisabled && " 🔒"}
                              </span>
                            )}

                            {Boolean(item.badge) && isExpanded && (
                              <span className="ml-auto min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums text-white">
                                {item.badge}
                              </span>
                            )}
                            {Boolean(item.badge) && !isExpanded && (
                              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-slate-900" aria-hidden="true" />
                            )}

                            {tooltip(<>{item.label}{isItemDisabled && " (Accès restreint)"}</>)}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>

            {/* Footer */}
            <div className="flex-shrink-0 border-t border-slate-800 p-3">
              <button
                type="button"
                onClick={handleLogout}
                aria-label={!isExpanded ? "Se déconnecter" : undefined}
                className={clsx(
                  "group relative flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-300 transition-colors duration-150 hover:bg-red-500/15 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500",
                  !isExpanded && "justify-center",
                )}
              >
                <LogOut className="h-[18px] w-[18px] flex-shrink-0 text-slate-400 group-hover:text-red-300" />
                {isExpanded && <span>Se déconnecter</span>}
                {tooltip("Se déconnecter")}
              </button>
            </div>
          </>
        )}
      </motion.aside>
    </>
  );
}
