import React, { createContext, useContext, useState, useEffect, useMemo } from "react";

interface SidebarContextType {
  isCollapsed: boolean;
  isMobile: boolean;
  isMobileOpen: boolean;
  sidebarWidth: number;
  setIsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  setIsMobileOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const SidebarContext = createContext<SidebarContextType>({
  isCollapsed: false,
  isMobile: false,
  isMobileOpen: false,
  sidebarWidth: 280,
  setIsCollapsed: () => {},
  setIsMobileOpen: () => {},
});

export const useSidebar = () => useContext(SidebarContext);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
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
    () => (isMobile ? 0 : isCollapsed ? 70 : 280),
    [isMobile, isCollapsed]
  );

  return (
    <SidebarContext.Provider
      value={{ isCollapsed, isMobile, isMobileOpen, sidebarWidth, setIsCollapsed, setIsMobileOpen }}
    >
      {children}
    </SidebarContext.Provider>
  );
}
