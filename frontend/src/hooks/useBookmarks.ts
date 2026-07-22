"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { API } from "@/lib/constants";

interface UseBookmarksParams {
  token: string | null;
}

export function useBookmarks({ token }: UseBookmarksParams) {
  const [bookmarkedMcqs, setBookmarkedMcqs] = useState<any[]>([]);
  const [bookmarkedConcepts, setBookmarkedConcepts] = useState<any[]>([]);
  const [isLoadingBookmarks, setIsLoadingBookmarks] = useState(false);
  const [bookmarksActiveTab, setBookmarksActiveTab] = useState<"mcq" | "concept">("mcq");

  const fetchBookmarks = useCallback(() => {
    const savedToken = localStorage.getItem("token") || token;
    if (!savedToken) return;
    setIsLoadingBookmarks(true);

    const p1 = fetch(`${API}/api/bookmarks/mcq`, {
      headers: { Authorization: `Bearer ${savedToken}` },
      credentials: "include",
    }).then((res) => res.json());

    const p2 = fetch(`${API}/api/bookmarks/concept`, {
      headers: { Authorization: `Bearer ${savedToken}` },
      credentials: "include",
    }).then((res) => res.json());

    Promise.all([p1, p2])
      .then(([mcqs, concepts]) => {
        setBookmarkedMcqs(mcqs);
        setBookmarkedConcepts(concepts);
      })
      .catch((err) => console.error(err))
      .finally(() => setIsLoadingBookmarks(false));
  }, [token]);

  /**
   * Toggles bookmark on an MCQ.
   * Pass setMcqsList from useMCQBank to keep both lists in sync.
   */
  const toggleBookmarkMCQ = useCallback(
    (mcqId: number, setMcqsList?: React.Dispatch<React.SetStateAction<any[]>>) => {
      const savedToken = localStorage.getItem("token") || token;
      if (!savedToken) return;

      fetch(`${API}/api/bookmarks/mcq/${mcqId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${savedToken}` },
        credentials: "include",
      })
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error("Failed to toggle bookmark");
        })
        .then((data) => {
          const isBookmarked = data.bookmarked;
          if (setMcqsList) {
            setMcqsList((prev) =>
              prev.map((m) => (m.id === mcqId ? { ...m, bookmarked: isBookmarked } : m))
            );
          }
          if (!isBookmarked) {
            setBookmarkedMcqs((prev) => prev.filter((m) => m.id !== mcqId));
          } else {
            fetchBookmarks();
          }
        })
        .catch((err) => console.error(err));
    },
    [token, fetchBookmarks]
  );

  const handleCreateConceptBookmark = useCallback(
    (
      content: string,
      title: string | null = null,
      page: number | null = null,
      context: string | null = null
    ) => {
      const savedToken = localStorage.getItem("token") || token;
      if (!savedToken) return;

      fetch(`${API}/api/bookmarks/concept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${savedToken}`,
        },
        credentials: "include",
        body: JSON.stringify({
          content,
          book_title: title,
          page_number: page,
          source_context: context,
        }),
      })
        .then((res) => {
          if (res.ok) {
            fetchBookmarks();
            toast.success("Concept bookmarked successfully!");
          } else {
            toast.error("Failed to bookmark concept.", { duration: Infinity });
          }
        })
        .catch((err) => console.error(err));
    },
    [token, fetchBookmarks]
  );

  const handleDeleteConceptBookmark = useCallback(
    (bookmarkId: number) => {
      const savedToken = localStorage.getItem("token") || token;
      if (!savedToken) return;

      fetch(`${API}/api/bookmarks/concept/${bookmarkId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${savedToken}` },
        credentials: "include",
      })
        .then((res) => {
          if (res.ok) {
            setBookmarkedConcepts((prev) => prev.filter((b) => b.id !== bookmarkId));
          }
        })
        .catch((err) => console.error(err));
    },
    [token]
  );

  return {
    bookmarkedMcqs,
    setBookmarkedMcqs,
    bookmarkedConcepts,
    isLoadingBookmarks,
    bookmarksActiveTab,
    setBookmarksActiveTab,
    fetchBookmarks,
    toggleBookmarkMCQ,
    handleCreateConceptBookmark,
    handleDeleteConceptBookmark,
  };
}
