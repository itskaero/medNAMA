"use client";

import React from "react";
import { Stethoscope } from "lucide-react";
import { Message } from "@/types";
import { FamilyButton } from "@/components/ui/family-button";

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
  if (!isChatMinimized) return null;

  return (
    <div className="minimized-chat-widget">
      <FamilyButton collapsedIcon={<Stethoscope size={15} />} isSearching={isSearching}>
        <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "1px solid var(--border-light)",
              paddingBottom: "8px",
              marginBottom: "8px",
            }}
          >
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--sky)",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Stethoscope size={12} />
              Dr. MedNama
            </span>
            <button
              className="btn-workspace"
              style={{ padding: "2px 8px", fontSize: "0.68rem" }}
              onClick={() => {
                setIsChatMinimized(false);
                setActiveView("chat");
              }}
            >
              Maximize
            </button>
          </div>

          {/* Mini Feed showing last 3 messages */}
          <div className="mini-chat-feed">
            {(() => {
              const visible = messages.filter((m) => m.type === "user" || m.type === "ai");
              const lastThree = visible.slice(-3);
              if (lastThree.length === 0) {
                return (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "100%",
                      color: "var(--text-muted)",
                      fontSize: "0.7rem",
                    }}
                  >
                    No messages yet.
                  </div>
                );
              }
              return lastThree.map((msg) => {
                const isUser = msg.type === "user";
                const rawContent =
                  msg.content || (msg.answer ? msg.answer.answer_markdown : "");
                const cleanText = rawContent.replace(/[#*`_\[\]]/g, "").slice(0, 50);
                const truncated = cleanText.length > 50 ? cleanText + "..." : cleanText;

                return (
                  <div key={msg.id} className={`mini-chat-row ${isUser ? "user" : "assistant"}`}>
                    <strong>{isUser ? "You" : "Dr. MedNama"}:</strong> {truncated}
                  </div>
                );
              });
            })()}
          </div>

          {/* Quick Reply Form */}
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
              placeholder="Quick reply..."
              value={quickReplyVal}
              onChange={(e) => setQuickReplyVal(e.target.value)}
              disabled={isSearching}
            />
            <button
              type="submit"
              className="btn-primary"
              style={{ padding: "4px 8px", fontSize: "0.72rem" }}
              disabled={isSearching || !quickReplyVal.trim()}
            >
              Send
            </button>
          </form>
        </div>
      </FamilyButton>
    </div>
  );
}
