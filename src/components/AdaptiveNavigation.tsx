import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import { LogOut, Menu, MoreHorizontal, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useSidebar } from "../context/SidebarContext";
import Sidebar from "./Sidebar";
import {
  isNavigationItemActive,
  permittedNavigationItems,
  permittedNavigationSections,
  type NavigationItem,
} from "./navigationConfig";

const NavLink = ({ item, compact = false, onNavigate }: { item: NavigationItem; compact?: boolean; onNavigate?: () => void }) => {
  const { pathname } = useLocation();
  const active = isNavigationItemActive(pathname, item.path);
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`native-nav-link ${active ? "native-nav-link-active" : ""} ${compact ? "native-nav-link-compact" : ""}`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span>{compact ? item.shortLabel : item.label}</span>
    </Link>
  );
};

function MobileNavigation() {
  const { user, clearAuth } = useAuth();
  const [open, setOpen] = useState(false);
  const items = useMemo(() => permittedNavigationItems(user), [user]);
  const primary = useMemo(() => items.filter((item) => item.phonePriority).sort((a, b) => (a.phonePriority || 99) - (b.phonePriority || 99)).slice(0, 4), [items]);
  const secondary = items.filter((item) => !primary.some((primaryItem) => primaryItem.id === item.id));
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);
  return (
    <>
      <nav className="phone-tab-bar" aria-label="Navigation principale" style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0, 1fr))` }}>
        {primary.map((item) => <NavLink key={item.id} item={item} compact />)}
        <button type="button" onClick={() => setOpen(true)} className={`native-nav-link native-nav-link-compact ${open ? "native-nav-link-active" : ""}`} aria-label="Plus de modules">
          <MoreHorizontal className="h-5 w-5" /><span>Plus</span>
        </button>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div className="native-sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.section className="native-sheet" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 28, stiffness: 330 }} onClick={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-label="Plus de modules">
              <div className="native-sheet-handle" />
              <div className="flex items-center justify-between px-5 pb-3">
                <div><p className="font-bold text-gray-900">Autres modules</p><p className="text-sm text-gray-500">{user?.username}</p></div>
                <button type="button" className="touch-icon-button" onClick={() => setOpen(false)} aria-label="Fermer" autoFocus><X className="h-5 w-5" /></button>
              </div>
              <div className="native-sheet-grid">
                {secondary.map((item) => <NavLink key={item.id} item={item} onNavigate={() => setOpen(false)} />)}
              </div>
              <button type="button" className="native-sheet-logout" onClick={() => { clearAuth(); window.location.href = "/login"; }}><LogOut className="h-5 w-5" />Se déconnecter</button>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function TabletNavigation() {
  const { user, clearAuth } = useAuth();
  const { tabletOpen, setTabletOpen } = useSidebar();
  const location = useLocation();
  const sections = useMemo(() => permittedNavigationSections(user), [user]);
  useEffect(() => setTabletOpen(false), [location.pathname, setTabletOpen]);
  return (
    <>
      <aside className="tablet-rail" aria-label="Navigation tablette">
        <button type="button" className="tablet-brand" onClick={() => setTabletOpen(true)} aria-label="Ouvrir tous les modules"><img src="/Mrcleanlogo.png" alt="" /></button>
        <button type="button" className="tablet-menu-button" onClick={() => setTabletOpen(true)} aria-label="Menu"><Menu className="h-5 w-5" /></button>
        <div className="tablet-rail-items">{sections.flatMap((section) => section.items).map((item) => <NavLink key={item.id} item={item} compact />)}</div>
        <button type="button" className="tablet-logout" onClick={() => { clearAuth(); window.location.href = "/login"; }} aria-label="Se déconnecter"><LogOut className="h-5 w-5" /></button>
      </aside>
      <AnimatePresence>
        {tabletOpen && (<motion.div className="tablet-drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setTabletOpen(false)}>
          <motion.aside className="tablet-drawer" initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }} transition={{ duration: .22 }} onClick={(event) => event.stopPropagation()}>
            <header className="tablet-drawer-header"><div className="flex items-center gap-3"><img src="/Mrcleanlogo.png" alt="Logo de la boutique" /><div><strong>C'EST DIEU QUI PARTAGE</strong><small>Kisangani</small></div></div><button type="button" className="touch-icon-button" onClick={() => setTabletOpen(false)} aria-label="Fermer le menu"><X className="h-5 w-5" /></button></header>
            <nav className="tablet-drawer-nav">{sections.map((section) => <section key={section.title}><h2>{section.title}</h2>{section.items.map((item) => <NavLink key={item.id} item={item} />)}</section>)}</nav>
          </motion.aside>
        </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default function AdaptiveNavigation() {
  const { deviceMode } = useSidebar();
  const { token, user, clearAuth } = useAuth();
  const [clock, setClock] = useState(() => new Date());
  const restricted = deviceMode !== "desktop" && user?.role !== "admin" && (clock.getDay() === 0 || clock.getHours() < 7 || clock.getHours() >= 20);
  useEffect(() => {
    if (deviceMode === "desktop") return;
    const timer = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [deviceMode]);
  useEffect(() => {
    if (!token || !restricted) return;
    const timer = window.setTimeout(() => {
      clearAuth();
      window.location.href = "/login?message=auto_logout";
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [clearAuth, restricted, token]);
  if (!token || !user) return null;
  if (deviceMode === "desktop") return <Sidebar />;
  return <>
    {deviceMode === "phone" ? <MobileNavigation /> : <TabletNavigation />}
    {restricted && <div className="access-restriction" role="alert"><div><strong>Accès restreint</strong><p>{clock.getDay() === 0 ? "L’accès est fermé le dimanche." : "L’accès est limité de 07:00 à 20:00."}</p><small>Déconnexion automatique dans 10 secondes…</small></div></div>}
  </>;
}
