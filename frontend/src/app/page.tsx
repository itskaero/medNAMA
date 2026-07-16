"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Stethoscope, Menu } from "lucide-react";

import { Figure } from "../types";

// ─── Hooks ──────────────────────────────────────────────────────────────────
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useSidebar } from "@/hooks/useSidebar";
import { useLibrary } from "@/hooks/useLibrary";
import { useStats } from "@/hooks/useStats";
import { useConversations } from "@/hooks/useConversations";
import { useChat } from "@/hooks/useChat";
import { useBookmarks } from "@/hooks/useBookmarks";
import { useMCQBank } from "@/hooks/useMCQBank";
import { useQuiz } from "@/hooks/useQuiz";

// ─── Layout Components ───────────────────────────────────────────────────────
import AuthCard from "@/components/layout/AuthCard";
import AppSidebar from "@/components/layout/AppSidebar";
import LightboxModal from "@/components/layout/LightboxModal";
import MinimizedChatWidget from "@/components/layout/MinimizedChatWidget";

// ─── View Components ─────────────────────────────────────────────────────────
import DashboardView from "@/components/views/DashboardView";
import MCQBankView from "@/components/views/MCQBankView";
import BookmarksView from "@/components/views/BookmarksView";
import StatsView from "@/components/views/StatsView";
import QuizView from "@/components/views/QuizView";
import ChatView from "@/components/views/ChatView";

// ─── Main Component ──────────────────────────────────────────────────────────
export default function Home() {
  // ── Shared navigation state ────────────────────────────────────────────────
  const [activeView, setActiveView] = useState<
    "dashboard" | "chat" | "quiz" | "mcq-bank" | "bookmarks" | "stats"
  >("dashboard");
  const [selectedTopic, setSelectedTopic] = useState<any>(null);
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const [quickReplyVal, setQuickReplyVal] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openAccordionCategory, setOpenAccordionCategory] = useState<string | null>(null);
  const [lightboxFig, setLightboxFig] = useState<Figure | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastFetchedFilters = useRef({ category: "all", search: "" });

  // ── Hooks ──────────────────────────────────────────────────────────────────
  const { theme, setTheme } = useTheme();

  const {
    token,
    username,
    role,
    isAuthLoading,
    authError,
    authUsername,
    setAuthUsername,
    authPassword,
    setAuthPassword,
    authRole,
    setAuthRole,
    isRegisterMode,
    setIsRegisterMode,
    mounted,
    handleAuthSubmit,
    handleLogout,
  } = useAuth();

  const {
    sidebarWidth,
    isSidebarResizing,
    isSidebarHovered,
    setIsSidebarHovered,
    isSidebarLocked,
    setIsSidebarLocked,
    startResizing,
  } = useSidebar();

  // getHeaders — needed by multiple hooks
  const getHeaders = useCallback((): HeadersInit => {
    const t = localStorage.getItem("token") || token;
    return t ? { Authorization: `Bearer ${t}` } : {};
  }, [token]);

  const { stats, isLoadingStats, isLoadingDetailedStats, detailedStats, fetchStats, fetchDetailedStats } =
    useStats({ token, getHeaders, activeView });

  const {
    books,
    setBooks,
    isLoadingBooks,
    uploading,
    uploadError,
    fileRef,
    fetchBooks,
    handleFileUpload,
    handleDeleteBook,
    preloadDashboardData,
  } = useLibrary({ token, getHeaders, handleLogout });

  const {
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
  } = useConversations({ token });

  const { inputValue, setInputValue, isSearching, sendQuery, handleKeyDown } = useChat({
    token,
    activeConversationId,
    setActiveConversationId,
    fetchConversations,
    messagesEndRef,
    inputRef,
    messages,
    setMessages,
  });

  const {
    bookmarkedMcqs,
    bookmarkedConcepts,
    isLoadingBookmarks,
    bookmarksActiveTab,
    setBookmarksActiveTab,
    fetchBookmarks,
    toggleBookmarkMCQ: toggleBookmarkMCQBase,
    handleCreateConceptBookmark,
    handleDeleteConceptBookmark,
  } = useBookmarks({ token });

  const {
    mcqsList,
    setMcqsList,
    isLoadingMcqs,
    mcqSearchText,
    setMcqSearchText,
    mcqFilterCategory,
    setMcqFilterCategory,
    fetchMcqs,
  } = useMCQBank({ token });

  // Bind toggleBookmarkMCQ so it also updates mcqsList
  const toggleBookmarkMCQ = useCallback(
    (mcqId: number) => {
      toggleBookmarkMCQBase(mcqId, setMcqsList);
    },
    [toggleBookmarkMCQBase, setMcqsList]
  );

  const quiz = useQuiz({
    token,
    getHeaders,
    activeView,
    setActiveView,
    selectedTopic,
    stats,
    fetchStats,
  });

  // ── Derived values ─────────────────────────────────────────────────────────
  const isAdmin = role === "admin";
  const initials = username ? username.slice(0, 2).toUpperCase() : "DR";

  // ── Effects ────────────────────────────────────────────────────────────────

  // Preload dashboard data whenever token changes (login / restore)
  useEffect(() => {
    if (token) {
      preloadDashboardData(fetchStats);
    }
  }, [token]);

  // Load view-specific data when navigation happens
  useEffect(() => {
    const savedToken = token || localStorage.getItem("token");
    if (!savedToken) return;

    if (activeView === "chat") {
      if (conversations.length === 0) {
        fetchConversations();
      }
    } else if (activeView === "mcq-bank") {
      const isFilterChanged =
        lastFetchedFilters.current.category !== mcqFilterCategory ||
        lastFetchedFilters.current.search !== mcqSearchText;

      if (mcqsList.length === 0 || isFilterChanged) {
        fetchMcqs(mcqFilterCategory, mcqSearchText);
        lastFetchedFilters.current = { category: mcqFilterCategory, search: mcqSearchText };
      }
    } else if (activeView === "bookmarks") {
      if (bookmarkedMcqs.length === 0 && bookmarkedConcepts.length === 0) {
        fetchBookmarks();
      }
    } else if (activeView === "stats") {
      if (detailedStats === null) {
        fetchDetailedStats();
      }
    }
  }, [
    activeView,
    token,
    mcqFilterCategory,
    mcqSearchText,
    conversations.length,
    mcqsList.length,
    bookmarkedMcqs.length,
    bookmarkedConcepts.length,
    detailedStats,
    fetchConversations,
    fetchMcqs,
    fetchBookmarks,
    fetchDetailedStats,
  ]);

  // Clear messages/inputValue on logout (token becomes null)
  useEffect(() => {
    if (!token) {
      setMessages([]);
      setInputValue("");
      setBooks([]);
    }
  }, [token]);

  // Persist and restore activeView to survive page refresh
  useEffect(() => {
    const savedView = localStorage.getItem("activeView") as any;
    if (savedView) {
      setActiveView(savedView);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("activeView", activeView);
  }, [activeView]);

  // ── Render: init screen ────────────────────────────────────────────────────
  if (!mounted || (isAuthLoading && !token)) {
    return (
      <div className="init-screen" aria-label="Initializing medNAMA">
        <div className="init-spinner" role="status" aria-label="Loading" />
        <span className="init-label">Initializing secure session…</span>
      </div>
    );
  }

  // ── Render: auth screen ────────────────────────────────────────────────────
  if (!token) {
    return (
      <AuthCard
        isRegisterMode={isRegisterMode}
        setIsRegisterMode={setIsRegisterMode}
        authError={authError}
        authUsername={authUsername}
        setAuthUsername={setAuthUsername}
        authPassword={authPassword}
        setAuthPassword={setAuthPassword}
        authRole={authRole}
        setAuthRole={setAuthRole}
        isAuthLoading={isAuthLoading}
        handleAuthSubmit={handleAuthSubmit}
      />
    );
  }

  // ── renderMainContent ──────────────────────────────────────────────────────
  const renderMainContent = () => {
    if (activeView === "dashboard") {
      return (
        <DashboardView
          username={username}
          stats={stats}
          isLoadingStats={isLoadingStats}
          openAccordionCategory={openAccordionCategory}
          setOpenAccordionCategory={setOpenAccordionCategory}
          setActiveView={setActiveView}
          setSelectedTopic={setSelectedTopic}
          handleReviewPreviousQuiz={quiz.handleReviewPreviousQuiz}
        />
      );
    }

    if (activeView === "quiz") {
      return (
        <QuizView
          {...quiz}
          stats={stats}
          bookmarkedMcqs={bookmarkedMcqs}
          token={token}
          toggleBookmarkMCQ={toggleBookmarkMCQ}
          setActiveView={setActiveView}
          onFigureClick={setLightboxFig}
        />
      );
    }

    if (activeView === "mcq-bank") {
      return (
        <MCQBankView
          stats={stats}
          mcqsList={mcqsList}
          isLoadingMcqs={isLoadingMcqs}
          mcqSearchText={mcqSearchText}
          setMcqSearchText={setMcqSearchText}
          mcqFilterCategory={mcqFilterCategory}
          setMcqFilterCategory={setMcqFilterCategory}
          toggleBookmarkMCQ={toggleBookmarkMCQ}
          fetchExplanation={quiz.fetchExplanation}
          explanationMCQId={quiz.explanationMCQId}
          setExplanationMCQId={quiz.setExplanationMCQId}
          explanationData={quiz.explanationData}
          explanationLoading={quiz.explanationLoading}
          explanationError={quiz.explanationError}
          token={token}
          onFigureClick={setLightboxFig}
        />
      );
    }

    if (activeView === "bookmarks") {
      return (
        <BookmarksView
          bookmarkedMcqs={bookmarkedMcqs}
          bookmarkedConcepts={bookmarkedConcepts}
          isLoadingBookmarks={isLoadingBookmarks}
          bookmarksActiveTab={bookmarksActiveTab}
          setBookmarksActiveTab={setBookmarksActiveTab}
          toggleBookmarkMCQ={toggleBookmarkMCQ}
          fetchExplanation={quiz.fetchExplanation}
          handleDeleteConceptBookmark={handleDeleteConceptBookmark}
          explanationMCQId={quiz.explanationMCQId}
          setExplanationMCQId={quiz.setExplanationMCQId}
          explanationData={quiz.explanationData}
          explanationLoading={quiz.explanationLoading}
          explanationError={quiz.explanationError}
          token={token}
          onFigureClick={setLightboxFig}
        />
      );
    }

    if (activeView === "stats") {
      return (
        <StatsView
          detailedStats={detailedStats}
          isLoadingDetailedStats={isLoadingDetailedStats}
          getHeaders={getHeaders}
          handleReviewPreviousQuiz={quiz.handleReviewPreviousQuiz}
          setActiveView={setActiveView}
          setQuizAttemptId={quiz.setQuizAttemptId}
          setQuizMCQs={quiz.setQuizMCQs}
          setQuizSelectedAnswers={quiz.setQuizSelectedAnswers}
          setQuizStep={quiz.setQuizStep}
        />
      );
    }

    // Default: Chat view
    return (
      <ChatView
        messages={messages}
        inputValue={inputValue}
        setInputValue={setInputValue}
        isSearching={isSearching}
        sendQuery={sendQuery}
        handleKeyDown={handleKeyDown}
        conversations={conversations}
        activeConversationId={activeConversationId}
        isLoadingConversations={isLoadingConversations}
        handleSelectConversation={handleSelectConversation}
        handleNewChat={handleNewChat}
        handleDeleteConversation={handleDeleteConversation}
        isSidebarLocked={isSidebarLocked}
        setIsSidebarLocked={setIsSidebarLocked}
        isSidebarHovered={isSidebarHovered}
        setIsSidebarHovered={setIsSidebarHovered}
        isSidebarResizing={isSidebarResizing}
        sidebarWidth={sidebarWidth}
        startResizing={startResizing}
        setIsChatMinimized={setIsChatMinimized}
        setActiveView={setActiveView}
        token={token}
        messagesEndRef={messagesEndRef}
        inputRef={inputRef}
        onFigureClick={setLightboxFig}
        handleCreateConceptBookmark={handleCreateConceptBookmark}
      />
    );
  };

  // ── Render: main app ───────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      {/* Sticky Mobile Header */}
      <header className="mobile-header">
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu size={20} />
        </button>

        <div
          style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}
          onClick={() => {
            setActiveView("dashboard");
            setMobileMenuOpen(false);
          }}
        >
          <Stethoscope size={16} style={{ color: "var(--teal)" }} />
          <span className="brand-name" style={{ fontSize: "1.1rem" }}>
            med<span>NAMA</span>
          </span>
        </div>

        <div className="avatar" style={{ width: "30px", height: "30px", fontSize: "0.75rem" }} aria-hidden>
          {initials}
        </div>
      </header>

      {/* Backdrop overlay for mobile menu */}
      {mobileMenuOpen && (
        <div className="mobile-sidebar-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <AppSidebar
        activeView={activeView}
        setActiveView={setActiveView}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        username={username}
        role={role}
        isAdmin={isAdmin}
        books={books}
        isLoadingBooks={isLoadingBooks}
        uploading={uploading}
        uploadError={uploadError}
        theme={theme}
        setTheme={setTheme}
        handleLogout={handleLogout}
        handleFileUpload={handleFileUpload}
        handleDeleteBook={handleDeleteBook}
        fileRef={fileRef}
        setSelectedTopic={setSelectedTopic}
        fetchMcqs={fetchMcqs}
        fetchBookmarks={fetchBookmarks}
        fetchDetailedStats={fetchDetailedStats}
        mcqFilterCategory={mcqFilterCategory}
        mcqSearchText={mcqSearchText}
      />

      {/* ── Main content ── */}
      <main className="main" aria-label="Medical knowledge assistant">
        {renderMainContent()}
      </main>

      {/* ── Figure lightbox ── */}
      <LightboxModal lightboxFig={lightboxFig} setLightboxFig={setLightboxFig} token={token} />

      {/* ── Minimized Chat Widget ── */}
      {isChatMinimized && activeView !== "chat" && (
        <MinimizedChatWidget
          messages={messages}
          isSearching={isSearching}
          quickReplyVal={quickReplyVal}
          setQuickReplyVal={setQuickReplyVal}
          sendQuery={sendQuery}
          setIsChatMinimized={setIsChatMinimized}
          setActiveView={setActiveView}
          isChatMinimized={isChatMinimized}
        />
      )}
    </div>
  );
}
