"use client";

import React, { useState } from "react";
import { Stethoscope, ArrowUpRight, ArrowUp, X, Minus } from "lucide-react";
import { Message } from "@/types";
import { motion, AnimatePresence } from "framer-motion";

interface MinimizedChatWidgetProps {
  messages: Message[];
  isSearching: boolean;
  quickReplyVal: string;
  setQuickReplyVal: (v: string) => void;
  sendQuery: (q: string) => void;
  setIsChatMinimized: (v: boolean) => void;
  setActiveView: (view: any) => void;
  isChatMinimized: boolean;
}

export default function MinimizedChatWidget({
  messages,
  isSearching,
  quickReplyVal,
  setQuickReplyVal,
  sendQuery,
  setIsChatMinimized,
  setActiveView,
  isChatMinimized,
}: MinimizedChatWidgetProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  if (!isChatMinimized) return null;

  return (
    <AnimatePresence mode="wait">
      {isCollapsed ? (
        <motion.button
          key="fab"
          layoutId="chat-widget"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className="minimized-chat-fab"
          onClick={() => setIsCollapsed(false)}
          title="Open Quick Chat"
        >
          <Stethoscope size={24} />
        </motion.button>
      ) : (
        <motion.div
          key="pill"
          layoutId="chat-widget"
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          className="minimized-chat-pill"
        >
          <div className="mini-chat-pill-header">
            <div className="mini-chat-brand">
              <Stethoscope size={14} className="brand-icon" />
              <span>Dr. MedNama</span>
            </div>
            <div style={{ display: "flex", gap: "2px" }}>
              <button
                className="mini-maximize-btn"
                onClick={() => setIsCollapsed(true)}
                title="Minimize to Button"
              >
                <Minus size={16} />
              </button>
              <button
                className="mini-maximize-btn"
                onClick={() => {
                  setIsChatMinimized(false);
                  setActiveView("chat");
                }}
                title="Maximize to Full Chat"
              >
                <ArrowUpRight size={16} />
              </button>
              <button
                className="mini-maximize-btn close-btn"
                onClick={() => setIsChatMinimized(false)}
                title="Close Widget"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Mini Feed showing last message only for cleanliness */}
          <div className="mini-chat-feed">
            {(() => {
              const visible = messages.filter((m) => m.type === "user" || m.type === "ai");
              const lastMsg = visible[visible.length - 1];
              if (!lastMsg) {
                return <div className="mini-chat-row empty">No messages yet.</div>;
              }
              const isUser = lastMsg.type === "user";
              const rawContent = lastMsg.content || (lastMsg.answer ? lastMsg.answer.answer_markdown : "");
              const cleanText = rawContent.replace(/[#*`_\[\]]/g, "").slice(0, 60);
              const truncated = cleanText.length > 60 ? cleanText + "..." : cleanText;

              return (
                <div key={lastMsg.id} className={`mini-chat-row ${isUser ? "user" : "assistant"}`}>
                  <strong>{isUser ? "You" : "MedNama"}:</strong> {truncated}
                </div>
              );
            })()}
          </div>

          {/* Sleek Quick Reply Pill Form */}
          <form
            className="mini-chat-quick-reply"
            onSubmit={(e) => {
              e.preventDefault();
              if (!quickReplyVal.trim() || isSearching) return;
              sendQuery(quickReplyVal);
              setQuickReplyVal("");
            }}
          >
            <input
              type="text"
              className="mini-chat-quick-input"
              placeholder="Ask a quick question..."
              value={quickReplyVal}
              onChange={(e) => setQuickReplyVal(e.target.value)}
              disabled={isSearching}
            />
            <button
              type="submit"
              className="mini-chat-send-btn"
              disabled={isSearching || !quickReplyVal.trim()}
            >
              <ArrowUp size={16} />
            </button>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
