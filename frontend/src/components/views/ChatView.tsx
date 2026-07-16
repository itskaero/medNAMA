"use client";

import React, { RefObject, useEffect } from "react";
import {
  Stethoscope,
  Send,
  MessageSquare,
  Loader2,
  Minimize2,
  Plus,
  Pin,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { Message, Figure } from "@/types";
import { AIMessage } from "@/components";
import { groupConversations } from "@/utils/quizHelpers";

const SUGGESTIONS = [
  { icon: <span>🔬</span>, text: "What did Louis Pasteur say about microbes?" },
  { icon: <span>📖</span>, text: "What manual is used for bacterial classification?" },
  { icon: <span>📚</span>, text: "Who drew the artwork for Pelczar's fifth edition?" },
  { icon: <span>🩺</span>, text: "What is the difference between gram-positive and gram-negative bacteria?" },
];

interface ChatViewProps {
  messages: Message[];
  inputValue: string;
  setInputValue: (v: string) => void;
  isSearching: boolean;
  sendQuery: (q: string) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  conversations: any[];
  activeConversationId: number | null;
  isLoadingConversations: boolean;
  handleSelectConversation: (id: number) => void;
  handleNewChat: () => void;
  handleDeleteConversation: (id: number) => void;
  isSidebarLocked: boolean;
  setIsSidebarLocked: (v: boolean) => void;
  isSidebarHovered: boolean;
  setIsSidebarHovered: (v: boolean) => void;
  isSidebarResizing: boolean;
  sidebarWidth: number;
  startResizing: (e: React.MouseEvent) => void;
  setIsChatMinimized: (v: boolean) => void;
  setActiveView: (view: any) => void;
  token: string | null;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onFigureClick: (fig: Figure) => void;
  handleCreateConceptBookmark: (
    content: string,
    title?: string | null,
    page?: number | null,
    context?: string | null
  ) => void;
}

export default function ChatView({
  messages,
  inputValue,
  setInputValue,
  isSearching,
  sendQuery,
  handleKeyDown,
  conversations,
  activeConversationId,
  isLoadingConversations,
  handleSelectConversation,
  handleNewChat,
  handleDeleteConversation,
  isSidebarLocked,
  setIsSidebarLocked,
  isSidebarHovered,
  setIsSidebarHovered,
  isSidebarResizing,
  sidebarWidth,
  startResizing,
  setIsChatMinimized,
  setActiveView,
  token,
  messagesEndRef,
  inputRef,
  onFigureClick,
  handleCreateConceptBookmark,
}: ChatViewProps) {
  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="chat-view-container">
      {/* Chat Mini-Sidebar (Left) */}
      <div
        className={`chat-history-sidebar ${isSidebarLocked ? "locked" : ""} ${
          isSidebarHovered || isSidebarResizing ? "expanded" : "collapsed"
        } ${isSidebarResizing ? "resizing" : ""}`}
        style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
      >
        <div
          className="chat-sidebar-expanded-content"
          style={{
            opacity: 1,
            pointerEvents: "auto",
            display: "flex",
            flexDirection: "column",
            height: "100%",
            width: "100%",
            padding: "12px",
            boxSizing: "border-box",
          }}
        >
          {isSidebarHovered || isSidebarResizing || isSidebarLocked ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
              <button className="new-chat-btn" onClick={handleNewChat} style={{ flex: 1 }}>
                <Plus size={14} />
                New Chat
              </button>
              <button
                className={`sidebar-pin-btn ${isSidebarLocked ? "active" : ""}`}
                onClick={() => setIsSidebarLocked(!isSidebarLocked)}
                title={isSidebarLocked ? "Unlock sidebar hover-collapse" : "Lock sidebar expanded"}
              >
                <Pin size={12} style={{ transform: isSidebarLocked ? "none" : "rotate(-45deg)" }} />
              </button>
            </div>
          ) : (
            <button className="new-chat-btn-collapsed" onClick={handleNewChat} title="New Chat">
              <Plus size={16} />
            </button>
          )}

          <div className="chat-history-list" style={{ marginTop: "12px" }}>
            {isLoadingConversations ? (
              <div className="chat-history-loading">Loading...</div>
            ) : conversations.length === 0 ? (
              <div
                className="chat-history-empty"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "32px 8px",
                  color: "var(--text-muted)",
                  fontSize: "0.8rem",
                  textAlign: "center",
                }}
              >
                <MessageSquare size={16} style={{ opacity: 0.3 }} />
                {(isSidebarHovered || isSidebarResizing || isSidebarLocked) && (
                  <span>No recent discussions</span>
                )}
              </div>
            ) : (
              (() => {
                const isExpanded = isSidebarHovered || isSidebarResizing || isSidebarLocked;
                const getMonogram = (title: string): string => {
                  if (!title) return "CH";
                  const words = title.trim().split(/\s+/);
                  if (words.length >= 2) {
                    return (words[0][0] + words[1][0]).toUpperCase();
                  }
                  return title.slice(0, 2).toUpperCase();
                };

                if (!isExpanded) {
                  return conversations.map((conv) => {
                    const monogram = getMonogram(conv.title);
                    return (
                      <div
                        key={conv.id}
                        className={`chat-history-item ${activeConversationId === conv.id ? "active" : ""}`}
                        onClick={() => handleSelectConversation(conv.id)}
                        title={conv.title}
                        style={{ padding: "6px 0", display: "flex", justifyContent: "center", alignItems: "center" }}
                      >
                        <div className="chat-monogram-badge">{monogram}</div>
                      </div>
                    );
                  });
                }

                const grouped = groupConversations(conversations);
                const renderGroupSection = (title: string, list: any[]) => {
                  if (list.length === 0) return null;
                  return (
                    <div
                      className="chat-history-group"
                      key={title}
                      style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "12px" }}
                    >
                      <div
                        className="chat-history-group-title"
                        style={{
                          fontSize: "0.68rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          color: "var(--text-muted)",
                          padding: "4px var(--sp-3)",
                          fontWeight: 600,
                        }}
                      >
                        {title}
                      </div>
                      {list.map((conv) => (
                        <div
                          key={conv.id}
                          className={`chat-history-item ${activeConversationId === conv.id ? "active" : ""}`}
                          onClick={() => handleSelectConversation(conv.id)}
                          style={{ display: "flex", alignItems: "center" }}
                        >
                          <MessageSquare size={13} className="chat-icon" />
                          <span
                            className="chat-title"
                            title={conv.title}
                            style={{ marginLeft: "8px", flex: 1 }}
                          >
                            {conv.title}
                          </span>
                          <button
                            className="chat-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteConversation(conv.id);
                            }}
                            title="Delete Chat"
                            aria-label="Delete Chat"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                };
                return [
                  renderGroupSection("Today", grouped.today),
                  renderGroupSection("Yesterday", grouped.yesterday),
                  renderGroupSection("Older", grouped.older),
                ];
              })()
            )}
          </div>
        </div>

        {/* Vertical drag handle for resizing */}
        <div
          className="sidebar-resize-handle"
          onMouseDown={startResizing}
          title="Drag to resize chat history"
          aria-label="Resize sidebar handle"
        />
      </div>

      {/* Chat Active Screen (Right) */}
      <div className="chat-active-panel" style={{ position: "relative" }}>
        {/* Minimize Button */}
        <button
          className="chat-minimize-btn"
          onClick={() => {
            setIsChatMinimized(true);
            setActiveView("dashboard");
          }}
          title="Minimize Chat"
          aria-label="Minimize Chat"
        >
          <Minimize2 size={13} />
          <span>Minimize</span>
        </button>

        {/* Conversation area */}
        <div className="conversation" role="log" aria-label="Conversation" aria-live="polite">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-eyebrow">
                <Stethoscope size={12} />
                Clinical Knowledge Assistant
              </div>
              <h1 className="welcome-title">
                What would you like to <em>research</em> today?
              </h1>
              <p className="welcome-body">
                Ask any medical question and receive a grounded, evidence-based answer drawn strictly from
                textbooks — with inline citations and diagrams.
              </p>
              <div className="suggestion-grid" role="list" aria-label="Suggested questions">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    className="suggestion-chip"
                    role="listitem"
                    onClick={() => sendQuery(s.text)}
                  >
                    <span className="suggestion-chip-icon" aria-hidden>
                      {s.icon}
                    </span>
                    {s.text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="chat-message-thread">
              <div className="chat-date-separator">
                <span>
                  TODAY ·{" "}
                  {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              {messages.map((msg) =>
                msg.type === "user" ? (
                  <div key={msg.id} className="user-message">
                    <div className="user-bubble">
                      <div>{msg.content}</div>
                      {msg.timestamp && (
                        <div
                          style={{
                            fontSize: "0.68rem",
                            opacity: 0.7,
                            marginTop: "4px",
                            textAlign: "right",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {msg.timestamp}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <AIMessage
                    key={msg.id}
                    msg={msg}
                    token={token}
                    onFigureClick={onFigureClick}
                    onBookmarkConcept={(content) => {
                      const firstCitation = msg.answer?.citations?.[0];
                      const title = firstCitation ? firstCitation.book_title : null;
                      const page = firstCitation ? firstCitation.page_number : null;
                      handleCreateConceptBookmark(content, title, page, "RAG Chatbot");
                    }}
                  />
                )
              )}
              <div ref={messagesEndRef} aria-hidden />
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="input-area">
          <div className="composer-card">
            <textarea
              ref={inputRef}
              className="input-box"
              placeholder={isSearching ? "Consulting reference library…" : "Reply to Dr. MedNama…"}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
              }}
              onKeyDown={handleKeyDown}
              disabled={isSearching}
              rows={1}
              aria-label="Ask a medical question"
              aria-multiline
            />

            <div className="composer-bottom-row">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div className="model-chip-pill">
                  <span className="model-chip-dot" />
                  <span>Dr. MedNama 1.5 · Textbook RAG</span>
                  <ChevronDown size={10} style={{ marginLeft: "4px" }} />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span className="keyboard-send-hint">⏎ to send</span>
                <button
                  className="send-btn"
                  onClick={() => sendQuery(inputValue)}
                  disabled={isSearching || !inputValue.trim()}
                  aria-label="Send question"
                >
                  {isSearching ? (
                    <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                  ) : (
                    <Send size={14} />
                  )}
                </button>
              </div>
            </div>
          </div>

          <p className="input-hint" style={{ marginTop: "8px" }}>
            Dr. MedNama can make mistakes. Verify textbook sources.
          </p>
        </div>
      </div>
    </div>
  );
}
