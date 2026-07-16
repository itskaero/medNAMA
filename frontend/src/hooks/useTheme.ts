"use client";

import { useState, useEffect } from "react";

export function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light" | "balanced" | "warm">("dark");

  // Load saved theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme && ["dark", "light", "balanced", "warm"].includes(savedTheme)) {
      setTheme(savedTheme as any);
    }
  }, []);

  // Apply CSS class + persist on change
  useEffect(() => {
    document.documentElement.classList.remove("theme-dark", "theme-light", "theme-balanced", "theme-warm");
    document.documentElement.classList.add(`theme-${theme}`);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return { theme, setTheme };
}
