"use client";

import { useState, useEffect, useRef } from "react";
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
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useSidebar } from "../context/SidebarContext";
import { isNavigationItemActive, permittedNavigationSections } from "./navigationConfig";

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
  const { token, user, clearAuth } = useAuth();

  const sidebarRef = useRef<HTMLElement>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndX = useRef(0);

  const isAuthed = Boolean(token && user);
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
          window.location.href = "/login?message=auto_logout";
        }, 10000);
        return () => clearTimeout(logoutTimer);
      }
    }
  }, [clearAuth, isAuthed, isNonAdmin, isRestricted, currentTime]);

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

  const sidebarSections = permittedNavigationSections(user);

  const toggleSidebar = () => {
    if (isMobile) {
      setIsMobileOpen(!isMobileOpen);
    } else {
      setIsCollapsed(!isCollapsed);
    }
  };

  const handleLogout = () => {
    clearAuth();
    window.location.href = "/login";
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

  return (
    <>
      {/* Mobile hamburger button */}
      {isMobile && isAuthed && (
        <button
          onClick={toggleSidebar}
          className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-gray-900 rounded-md text-white shadow-lg"
          aria-label="Toggle menu"
        >
          {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      )}

      {/* Mobile overlay backdrop */}
      <AnimatePresence>
        {isMobile && isMobileOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40" onClick={() => setIsMobileOpen(false)} />}
      </AnimatePresence>

      {/* Sidebar — always fixed so main content margin controls spacing */}
      <motion.aside
        ref={sidebarRef}
        initial={false}
        animate={{
          width: isMobile ? (isMobileOpen ? 280 : 0) : isCollapsed ? 70 : 280,
          x: isMobile ? (isMobileOpen ? 0 : -280) : 0,
        }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="bg-gray-900 border-r border-gray-800 flex flex-col h-screen z-50 overflow-hidden"
        style={{ position: "fixed", top: 0, left: 0, touchAction: "pan-y" }}
      >
        {/* Auto-logout Warning */}
        <AnimatePresence>
          {showTimeWarning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="bg-red-600 text-white p-6 rounded-lg max-w-sm mx-4 text-center"
              >
                <Clock className="w-12 h-12 mx-auto mb-4" />
                <h3 className="text-lg font-bold mb-2">Accès Restreint</h3>
                <p className="mb-4">{getRestrictionMessage()}</p>
                <p className="mb-4 font-semibold">Déconnexion automatique dans 10 secondes...</p>
                <button
                  onClick={handleLogout}
                  className="bg-white text-red-600 px-4 py-2 rounded font-semibold hover:bg-gray-100 transition-colors"
                >
                  Se déconnecter maintenant
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center justify-between">
            <AnimatePresence mode="wait">
              {isExpanded ? (
                <motion.div
                  key="expanded-header"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-3 min-w-0"
                >
                  <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                    <img src="/Mrcleanlogo.png" alt="" className="w-full h-full object-contain" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-base font-bold text-white truncate">DIEU QUI PARTAGE</h1>
                    <p className="text-xs text-gray-400">Kisangani</p>
                  </div>
                </motion.div>
              ) : !isMobile ? (
                <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center mx-auto overflow-hidden">
                  <img src="/Mrcleanlogo.png" alt="Logo" className="w-full h-full object-contain" />
                </div>
              ) : null}
            </AnimatePresence>

            {!isMobile && (
              <button
                onClick={toggleSidebar}
                className="p-1.5 rounded-md hover:bg-gray-800 transition-colors flex-shrink-0"
                aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                ) : (
                  <ChevronLeft className="w-4 h-4 text-gray-300" />
                )}
              </button>
            )}
          </div>

          {/* Time & Date (expanded only) */}
          <AnimatePresence mode="wait">
            {isExpanded && (
              <motion.div
                key="time-display"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="mt-2 text-center"
              >
                <div className="text-xs text-gray-400 flex items-center justify-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTime(currentTime)}
                </div>
                <div className="text-xs text-gray-500 mt-1">{formatDay(currentTime)}</div>
                {isNonAdmin && isRestricted && (
                  <div className="text-xs text-red-400 mt-1">
                    {isSunday() ? "Dimanche - Accès restreint" : "Accès restreint • Ouverture à 07:00"}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* User info (expanded) */}
          <AnimatePresence mode="wait">
            {isAuthed && isExpanded && (
              <motion.div
                key="user-expanded"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="mt-4 pt-4 border-t border-gray-800"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isNonAdmin && isRestricted ? "bg-red-500" : "bg-blue-500"
                    }`}
                  >
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {user?.username || "Utilisateur"}
                    </p>
                    <p
                      className={`text-xs capitalize truncate ${
                        isNonAdmin && isRestricted ? "text-red-400" : "text-blue-400"
                      }`}
                    >
                      {user?.role || "Non défini"}
                      {isNonAdmin && isRestricted && " • Accès restreint"}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* User info (collapsed tooltip on desktop) */}
          <AnimatePresence mode="wait">
            {isAuthed && isCollapsed && !isMobile && (
              <motion.div
                key="user-collapsed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-4 pt-4 border-t border-gray-800 flex justify-center"
              >
                <div className="relative group">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isNonAdmin && isRestricted ? "bg-red-500" : "bg-blue-500"
                    }`}
                  >
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-sm rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                    <div className="font-medium">{user?.username || "Utilisateur"}</div>
                    <div
                      className={`capitalize text-xs ${
                        isNonAdmin && isRestricted ? "text-red-400" : "text-blue-400"
                      }`}
                    >
                      {user?.role || "Non défini"}
                    </div>
                    <div className="text-gray-300 text-xs mt-1">{formatTime(currentTime)}</div>
                    <div className="text-gray-400 text-xs">{formatDay(currentTime)}</div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Unauthenticated: show login */}
        {!isAuthed ? (
          <div className="flex-1 p-4">
            <Link
              to="/login"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all duration-200 group relative"
            >
              <LogIn className="w-5 h-5 flex-shrink-0" />
              <AnimatePresence mode="wait">
                {isExpanded && (
                  <motion.span
                    key="login-label"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                    className="font-medium text-sm"
                  >
                    Se connecter
                  </motion.span>
                )}
              </AnimatePresence>
              {isCollapsed && !isMobile && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-sm rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                  Se connecter
                </div>
              )}
            </Link>
          </div>
        ) : (
          <>
            {/* Authenticated navigation */}
            <nav className="flex-1 overflow-y-auto p-4 space-y-6">
              {sidebarSections.map((section) => {
                return (
                  <div key={section.title}>
                    <AnimatePresence mode="wait">
                      {isExpanded && (
                        <motion.h3
                          key={`section-${section.title}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3"
                        >
                          {section.title}
                        </motion.h3>
                      )}
                    </AnimatePresence>

                    <ul className="space-y-1">
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
                              className={clsx(
                                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative",
                                isActive && !isItemDisabled
                                  ? "bg-blue-600 text-white shadow-sm"
                                  : isItemDisabled
                                  ? "text-gray-500 cursor-not-allowed bg-gray-800 bg-opacity-50"
                                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
                              )}
                            >
                              <Icon
                                className={clsx(
                                  "w-5 h-5 flex-shrink-0",
                                  isActive && !isItemDisabled
                                    ? "text-white"
                                    : isItemDisabled
                                    ? "text-gray-500"
                                    : "text-gray-400 group-hover:text-white"
                                )}
                              />

                              <AnimatePresence mode="wait">
                                {isExpanded && (
                                  <motion.span
                                    key={`label-${item.id}`}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -10 }}
                                    transition={{ duration: 0.2 }}
                                    className="font-medium text-sm truncate"
                                  >
                                    {item.label}
                                    {isItemDisabled && " 🔒"}
                                  </motion.span>
                                )}
                              </AnimatePresence>

                              {item.badge && isExpanded && (
                                <motion.span
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  className="ml-auto bg-red-600 text-white text-xs px-2 py-0.5 rounded-full"
                                >
                                  {item.badge}
                                </motion.span>
                              )}

                              {isCollapsed && !isMobile && (
                                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-sm rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                                  {item.label}
                                  {isItemDisabled && " (Accès restreint)"}
                                </div>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-gray-800 space-y-2 flex-shrink-0">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-300 hover:bg-red-600 hover:text-white transition-colors group relative"
              >
                <LogOut className="w-5 h-5 text-gray-400 group-hover:text-white flex-shrink-0" />
                <AnimatePresence mode="wait">
                  {isExpanded && (
                    <motion.span
                      key="logout-label"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.2 }}
                      className="font-medium text-sm"
                    >
                      Se déconnecter
                    </motion.span>
                  )}
                </AnimatePresence>
                {isCollapsed && !isMobile && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-sm rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                    Se déconnecter
                  </div>
                )}
              </button>

            </div>
          </>
        )}
      </motion.aside>
    </>
  );
}
