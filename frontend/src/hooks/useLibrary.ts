"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Book } from "@/types";
import { API } from "@/lib/constants";

interface UseLibraryParams {
  token: string | null;
  getHeaders: () => HeadersInit;
  handleLogout: () => void;
}

export function useLibrary({ token, getHeaders, handleLogout }: UseLibraryParams) {
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoadingBooks, setIsLoadingBooks] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchBooks = useCallback(
    async (showLoader = false) => {
      if (!token) return;
      if (showLoader) setIsLoadingBooks(true);
      try {
        const res = await fetch(`${API}/api/books`, {
          headers: getHeaders(),
          credentials: "include",
        });
        if (res.ok) setBooks(await res.json());
        else if (res.status === 401) handleLogout();
      } catch {
        /* ignore */
      } finally {
        setIsLoadingBooks(false);
      }
    },
    [token, getHeaders]
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".pdf")) {
      setUploadError("Only PDF files are supported.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API}/api/ingest`, {
        method: "POST",
        headers: getHeaders(),
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || "Failed to start ingestion.");
      }
      if (fileRef.current) fileRef.current.value = "";
      await fetchBooks(false);
    } catch (err: any) {
      setUploadError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteBook = async (bookId: number, title: string) => {
    if (!confirm(`Remove "${title}"? This will delete all embeddings and figures.`)) return;
    try {
      const res = await fetch(`${API}/api/books/${bookId}`, {
        method: "DELETE",
        headers: getHeaders(),
        credentials: "include",
      });
      if (res.ok) setBooks((prev) => prev.filter((b) => b.id !== bookId));
      else alert("Failed to delete book.");
    } catch {
      alert("Network error.");
    }
  };

  const preloadDashboardData = useCallback(
    async (fetchStats: () => Promise<void>) => {
      if (!token) return;
      setIsLoadingBooks(true);
      try {
        await Promise.all([fetchBooks(false), fetchStats()]);
      } catch (err) {
        console.error("Dashboard preloading failed:", err);
      } finally {
        setIsLoadingBooks(false);
      }
    },
    [token, fetchBooks]
  );

  // Poll processing books every 4s
  useEffect(() => {
    if (!token || books.length === 0) return;
    const hasActive = books.some((b) => b.status === "processing" || b.status === "pending");
    if (!hasActive) return;
    const t = setInterval(() => fetchBooks(false), 4000);
    return () => clearInterval(t);
  }, [books, token]);

  return {
    books,
    setBooks,
    isLoadingBooks,
    setIsLoadingBooks,
    uploading,
    uploadError,
    fileRef,
    fetchBooks,
    handleFileUpload,
    handleDeleteBook,
    preloadDashboardData,
  };
}
