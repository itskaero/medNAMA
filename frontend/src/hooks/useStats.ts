"use client";

import { useState, useCallback, useEffect } from "react";
import { API } from "@/lib/constants";

interface UseStatsParams {
  token: string | null;
  getHeaders: () => HeadersInit;
  activeView: string;
}

export function useStats({ token, getHeaders, activeView }: UseStatsParams) {
  const [stats, setStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [detailedStats, setDetailedStats] = useState<any>(null);
  const [isLoadingDetailedStats, setIsLoadingDetailedStats] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!token) return;
    setIsLoadingStats(true);
    try {
      const res = await fetch(`${API}/api/dashboard/stats`, {
        headers: getHeaders(),
        credentials: "include",
      });
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.error("Failed to load dashboard stats", err);
    } finally {
      setIsLoadingStats(false);
    }
  }, [token, getHeaders]);

  const fetchDetailedStats = useCallback(() => {
    const savedToken = localStorage.getItem("token") || token;
    if (!savedToken) return;
    setIsLoadingDetailedStats(true);

    fetch(`${API}/api/dashboard/detailed-stats`, {
      headers: { Authorization: `Bearer ${savedToken}` },
      credentials: "include",
    })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Failed to load detailed stats");
      })
      .then((data) => setDetailedStats(data))
      .catch((err) => console.error(err))
      .finally(() => setIsLoadingDetailedStats(false));
  }, [token]);

  // Refresh stats when dashboard becomes active
  useEffect(() => {
    if (token && activeView === "dashboard") {
      fetchStats();
    }
  }, [activeView, token, fetchStats]);

  return {
    stats,
    isLoadingStats,
    setIsLoadingStats,
    detailedStats,
    isLoadingDetailedStats,
    fetchStats,
    fetchDetailedStats,
  };
}
