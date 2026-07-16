"use client";

import { useState, useCallback, useEffect } from "react";

export function useSidebar() {
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isSidebarLocked, setIsSidebarLocked] = useState(false);

  const startResizing = useCallback((e: React.MouseEvent) => {
    setIsSidebarResizing(true);
    e.preventDefault();
  }, []);

  const stopResizing = useCallback(() => {
    setIsSidebarResizing(false);
  }, []);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isSidebarResizing) {
        const newWidth = e.clientX;
        if (newWidth > 180 && newWidth < 450) {
          setSidebarWidth(newWidth);
        }
      }
    },
    [isSidebarResizing]
  );

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  return {
    sidebarWidth,
    isSidebarResizing,
    isSidebarHovered,
    setIsSidebarHovered,
    isSidebarLocked,
    setIsSidebarLocked,
    startResizing,
    stopResizing,
    resize,
  };
}
