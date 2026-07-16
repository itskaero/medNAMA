"use client";

import { useState, useCallback } from "react";
import { API } from "@/lib/constants";

interface UseMCQBankParams {
  token: string | null;
}

export function useMCQBank({ token }: UseMCQBankParams) {
  const [mcqsList, setMcqsList] = useState<any[]>([]);
  const [isLoadingMcqs, setIsLoadingMcqs] = useState(false);
  const [mcqSearchText, setMcqSearchText] = useState("");
  const [mcqFilterCategory, setMcqFilterCategory] = useState("all");

  const fetchMcqs = useCallback(
    (category = "all", search = "") => {
      const savedToken = localStorage.getItem("token") || token;
      if (!savedToken) return;
      setIsLoadingMcqs(true);

      let url = `${API}/api/mcqs?category=${category}`;
      if (search.trim()) {
        url += `&search=${encodeURIComponent(search.trim())}`;
      }

      fetch(url, {
        headers: { Authorization: `Bearer ${savedToken}` },
        credentials: "include",
      })
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error("Failed to load MCQs");
        })
        .then((data) => setMcqsList(data))
        .catch((err) => console.error(err))
        .finally(() => setIsLoadingMcqs(false));
    },
    [token]
  );

  return {
    mcqsList,
    setMcqsList,
    isLoadingMcqs,
    mcqSearchText,
    setMcqSearchText,
    mcqFilterCategory,
    setMcqFilterCategory,
    fetchMcqs,
  };
}
