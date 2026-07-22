"use client";

import { useState, useEffect } from "react";

export type ThemeMode = "dark" | "light" | "balanced" | "warm";

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>("dark");

  // Detect system theme preference or load saved theme on initial mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme && ["dark", "light", "balanced", "warm"].includes(savedTheme)) {
      setTheme(savedTheme as ThemeMode);
    } else {
      const isSystemLight = window.matchMedia("(prefers-color-scheme: light)").matches;
      setTheme(isSystemLight ? "light" : "dark");
    }

    // Listen to system preference changes when user hasn't explicitly set a custom theme
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const handleSystemChange = (e: MediaQueryListEvent) => {
      const currentSaved = localStorage.getItem("theme");
      if (!currentSaved) {
        setTheme(e.matches ? "light" : "dark");
      }
    };

    mediaQuery.addEventListener("change", handleSystemChange);
    return () => mediaQuery.removeEventListener("change", handleSystemChange);
  }, []);

  // Apply CSS class + persist on change
  useEffect(() => {
    document.documentElement.classList.remove("theme-dark", "theme-light", "theme-balanced", "theme-warm");
    document.documentElement.classList.add(`theme-${theme}`);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return { theme, setTheme };
}
