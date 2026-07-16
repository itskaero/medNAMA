"use client";

import { useState, useCallback, RefObject } from "react";
import { Message, AnswerResponse } from "@/types";
import { API } from "@/lib/constants";

interface UseChatParams {
  token: string | null;
  activeConversationId: number | null;
  setActiveConversationId: (id: number | null) => void;
  fetchConversations: () => void;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
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

      try {
        const res = await fetch(`${API}/api/chat/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getHeaders() },
          credentials: "include",
          body: JSON.stringify({ query: queryText, conversation_id: activeConversationId }),
        });

        if (!res.ok) throw new Error("Failed to retrieve an answer. Please try again.");

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
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tid
              ? { id: tid, type: "error", errorMsg: err.message || "Search failed.", timestamp: timeStr }
              : m
          )
        );
        setIsSearching(false);
        inputRef.current?.focus();
      }
    },
    [isSearching, getHeaders, activeConversationId, fetchConversations]
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
