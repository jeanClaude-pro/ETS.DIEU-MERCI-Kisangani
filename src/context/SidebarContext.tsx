/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useMemo } from "react";

interface SidebarContextType {
  isCollapsed: boolean;
  isMobile: boolean;
  isMobileOpen: boolean;
  sidebarWidth: number;
  deviceMode: "phone" | "tablet" | "desktop";
  tabletOpen: boolean;
  setIsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  setIsMobileOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setTabletOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const SidebarContext = createContext<SidebarContextType>({
  isCollapsed: false,
  isMobile: false,
  isMobileOpen: false,
  sidebarWidth: 280,
  deviceMode: "desktop",
  tabletOpen: false,
  setIsCollapsed: () => {},
  setIsMobileOpen: () => {},
  setTabletOpen: () => {},
});

export const useSidebar = () => useContext(SidebarContext);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [tabletOpen, setTabletOpen] = useState(false);
  const [deviceMode, setDeviceMode] = useState<"phone" | "tablet" | "desktop">(() =>
    window.innerWidth <= 480 ? "phone" : window.innerWidth < 1024 ? "tablet" : "desktop"
  );

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setDeviceMode(window.innerWidth <= 480 ? "phone" : mobile ? "tablet" : "desktop");
      setIsMobile(mobile);
      if (mobile) {
        setIsCollapsed(true);
        setIsMobileOpen(false);
      }
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const sidebarWidth = useMemo(
    () => (deviceMode === "phone" ? 0 : deviceMode === "tablet" ? 76 : isCollapsed ? 70 : 280),
    [deviceMode, isCollapsed]
  );

  return (
    <SidebarContext.Provider
      value={{ isCollapsed, isMobile, isMobileOpen, sidebarWidth, deviceMode, tabletOpen, setIsCollapsed, setIsMobileOpen, setTabletOpen }}
    >
      {children}
    </SidebarContext.Provider>
  );
}
