"use client";

import { useState, useCallback, RefObject } from "react";
import { Message, AnswerResponse } from "@/types";
import { API } from "@/lib/constants";
import { proxySafeFetch } from "@/lib/proxyFetch";

interface UseChatParams {
  token: string | null;
  activeConversationId: number | null;
  setActiveConversationId: (id: number | null) => void;
  fetchConversations: () => void;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  /** F2: restrict retrieval to a book and/or chapter. */
  scope?: { book_id: number | null; chapter: string | null };
}

// Request cap so a slow/absent backend shows a clear message instead of a
// cryptic "Failed to fetch". DeepSeek can reason for a while on deep questions,
// so this is generous.
const REQUEST_TIMEOUT_MS = 120_000;

const API_HOST = String(API).replace(/^https?:\/\//, "");

/** Try to read FastAPI's `detail` (or a JSON `message`) from an error response body. */
async function readServerDetail(res: Response): Promise<string | null> {
  if (!res) return null;
  try {
    const data = await res.json();
    if (data && typeof data.detail === "string") return data.detail;
    if (data && data.message && typeof data.message === "string") return data.message;
  } catch {
    /* body isn't JSON — fall through */
  }
  return null;
}

/** Classify a chat failure into a self-diagnosing message for the UI. */
function describeChatError(err: unknown, timedOut: boolean): string {
  if (timedOut) {
    return (
      `Request timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s — the AI took too long to respond. ` +
      "Try again, or ask a shorter/simpler question."
    );
  }
  if (err instanceof SyntaxError) {
    return "Server returned an unreadable response (invalid data). Try again.";
  }
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (
    lower.includes("failed to fetch") ||
    lower.includes("load failed") ||
    lower.includes("networkerror") ||
    lower.includes("network error") ||
    lower.includes("connection")
  ) {
    return (
      `Backend unreachable — ${API_HOST} didn't respond to the request. ` +
      "Check that the API server is running (local uvicorn or Railway) and reachable from the browser."
    );
  }
  return msg || "Search failed.";
}

export function useChat({
  token,
  activeConversationId,
  setActiveConversationId,
  fetchConversations,
  messagesEndRef,
  inputRef,
  messages,
  setMessages,
  scope,
}: UseChatParams) {
  const [inputValue, setInputValue] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const getHeaders = useCallback((): HeadersInit => {
    const t = localStorage.getItem("token") || token;
    return t ? { Authorization: `Bearer ${t}` } : {};
  }, [token]);

  const sendQuery = useCallback(
    async (q: string) => {
      if (!q.trim() || isSearching) return;
      const queryText = q.trim();
      setInputValue("");
      setIsSearching(true);

      const timeStr = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

      const uid = `u-${Date.now()}`;
      const tid = `t-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: uid, type: "user", content: queryText, timestamp: timeStr },
        { id: tid, type: "thinking" },
      ]);

      // Abort after REQUEST_TIMEOUT_MS so a dead/slow backend surfaces a clear
      // "timeout" message instead of the browser's cryptic "Failed to fetch".
      // NOTE: timedOut/timeoutId must live OUTSIDE the try so the catch block
      // can read them (try/catch are separate block scopes).
      let timedOut = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        const controller = new AbortController();
        timeoutId = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, REQUEST_TIMEOUT_MS);

      let res: Response;
      try {
        res = await proxySafeFetch(`${API}/api/chat/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getHeaders() },
          credentials: "include",
          signal: controller.signal,
          body: JSON.stringify({
            query: queryText,
            conversation_id: activeConversationId,
            book_id: scope?.book_id ?? null,
            chapter: scope?.chapter ?? null,
          }),
        });
        clearTimeout(timeoutId);
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }

      if (!res.ok) {
        const detail = await readServerDetail(res);
        throw new Error(
          detail
            ? `Server error (HTTP ${res.status}): ${detail}`
            : `Server error (HTTP ${res.status}). The API returned no usable error detail.`
        );
      }

      const responseData = await res.json();
        const convId = responseData.conversation_id;
        const data: AnswerResponse = responseData.answer;
        const isNewChat = activeConversationId === null;

        if (isNewChat) {
          setActiveConversationId(convId);
        }

        const words = data.answer_markdown.split(" ");
        let currentText = "";
        let wordIdx = 0;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === tid
              ? {
                  id: tid,
                  type: "ai",
                  answer: { answer_markdown: "", citations: [], figures: [] },
                  query: queryText,
                  timestamp: timeStr,
                }
              : m
          )
        );

        const streamInterval = setInterval(() => {
          if (wordIdx < words.length) {
            currentText += (wordIdx === 0 ? "" : " ") + words[wordIdx];
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tid
                  ? {
                      id: tid,
                      type: "ai",
                      answer: { answer_markdown: currentText, citations: [], figures: [] },
                      query: queryText,
                      timestamp: timeStr,
                    }
                  : m
              )
            );
            wordIdx++;
          } else {
            clearInterval(streamInterval);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tid ? { id: tid, type: "ai", answer: data, query: queryText, timestamp: timeStr } : m
              )
            );
            setIsSearching(false);
            if (isNewChat) {
              fetchConversations();
            }
            inputRef.current?.focus();
          }
        }, 15);
      } catch (err: any) {
        if (timeoutId) clearTimeout(timeoutId);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tid
              ? { id: tid, type: "error", errorMsg: describeChatError(err, timedOut), timestamp: timeStr }
              : m
          )
        );
        setIsSearching(false);
        inputRef.current?.focus();
      }
    },
    [isSearching, getHeaders, activeConversationId, fetchConversations, scope]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuery(inputValue);
    }
  };

  return {
    inputValue,
    setInputValue,
    isSearching,
    sendQuery,
    handleKeyDown,
  };
}
