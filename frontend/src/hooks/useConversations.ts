"use client";

import { useState, useCallback } from "react";
import { Message } from "@/types";
import { API } from "@/lib/constants";

interface UseConversationsParams {
  token: string | null;
}

export function useConversations({ token }: UseConversationsParams) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  const fetchConversations = useCallback(() => {
    const savedToken = localStorage.getItem("token") || token;
    if (!savedToken) return;
    setIsLoadingConversations(true);
    fetch(`${API}/api/chat/conversations`, {
      headers: { Authorization: `Bearer ${savedToken}` },
      credentials: "include",
    })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Failed to load chat history");
      })
      .then((data) => {
        setConversations(data);
      })
      .catch((err) => console.error(err))
      .finally(() => setIsLoadingConversations(false));
  }, [token]);

  const handleSelectConversation = useCallback(
    (convId: number) => {
      const savedToken = localStorage.getItem("token") || token;
      if (!savedToken) return;

      fetch(`${API}/api/chat/conversations/${convId}`, {
        headers: { Authorization: `Bearer ${savedToken}` },
        credentials: "include",
      })
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error("Failed to fetch conversation history");
        })
        .then((data) => {
          setActiveConversationId(data.id);
          const loadedMessages = data.messages.map((m: any) => {
            if (m.type === "ai") {
              return {
                id: m.id,
                type: "ai",
                content: m.content || "",
                timestamp: m.timestamp,
                answer: {
                  answer_markdown: m.content || "",
                  citations: m.answer?.citations || [],
                  figures: m.answer?.figures || [],
                },
              };
            } else {
              return {
                id: m.id,
                type: "user",
                content: m.content || "",
                timestamp: m.timestamp,
              };
            }
          });
          setMessages(loadedMessages);
        })
        .catch((err) => console.error(err));
    },
    [token]
  );

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setActiveConversationId(null);
  }, []);

  const handleDeleteConversation = useCallback(
    (convId: number) => {
      const savedToken = localStorage.getItem("token") || token;
      if (!savedToken) return;

      fetch(`${API}/api/chat/conversations/${convId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${savedToken}` },
        credentials: "include",
      })
        .then((res) => {
          if (res.ok) {
            fetchConversations();
            if (activeConversationId === convId) {
              handleNewChat();
            }
          }
        })
        .catch((err) => console.error(err));
    },
    [token, activeConversationId, fetchConversations, handleNewChat]
  );

  return {
    conversations,
    activeConversationId,
    setActiveConversationId,
    isLoadingConversations,
    messages,
    setMessages,
    fetchConversations,
    handleSelectConversation,
    handleNewChat,
    handleDeleteConversation,
  };
}
