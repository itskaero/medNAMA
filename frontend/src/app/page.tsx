"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { marked } from "marked";
import {
  BookOpen,
  Stethoscope,
  Send,
  LogOut,
  Upload,
  Trash2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  BookMarked,
  Microscope,
  AlertCircle,
  ImageIcon,
  X,
  Loader2,
  LayoutDashboard,
  MessageSquare,
  Bookmark,
  TrendingUp,
  GraduationCap,
  Clock,
  Menu,
  Sun,
  Moon,
  Compass,
  Sunset,
  Copy,
  Check,
  Plus,
} from "lucide-react";

import { Book, Citation, Figure, AnswerResponse, Message } from "../types";
import { parseMarkdown } from "../utils/markdown";
import { CitationsDrawer, FiguresDrawer, AIMessage, BookItem } from "../components";

// ─── Config ────────────────────────────────────────────────────
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const SUGGESTIONS = [
  { icon: <Microscope size={14} />, text: "What did Louis Pasteur say about microbes?" },
  { icon: <BookMarked size={14} />, text: "What manual is used for bacterial classification?" },
  { icon: <BookOpen size={14} />, text: "Who drew the artwork for Pelczar's fifth edition?" },
  { icon: <Stethoscope size={14} />, text: "What is the difference between gram-positive and gram-negative bacteria?" },
];

// ─── Main Component ─────────────────────────────────────────────
export default function Home() {
  // Auth
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authRole, setAuthRole] = useState("student");
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Library
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoadingBooks, setIsLoadingBooks] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Dashboard & Navigation Views
  const [activeView, setActiveView] = useState<"dashboard" | "chat" | "quiz" | "mcq-bank" | "bookmarks" | "stats">("dashboard");
  const [stats, setStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<any>(null);

  // ─── Quiz / Practice Center States (Phase 11) ────────────────
  const [quizStep, setQuizStep] = useState<"config" | "taker" | "summary">("config");
  const [quizMCQs, setQuizMCQs] = useState<any[]>([]);
  const [quizCurrentIdx, setQuizCurrentIdx] = useState(0);
  const [quizSelectedAnswers, setQuizSelectedAnswers] = useState<{ [key: number]: string }>({});
  const [quizAttemptId, setQuizAttemptId] = useState<number | null>(null);
  const [quizIsLoading, setQuizIsLoading] = useState(false);
  const [quizIsSubmitting, setQuizIsSubmitting] = useState(false);

  // Configuration settings
  const [quizConfigCategory, setQuizConfigCategory] = useState<string>("all");
  const [quizConfigSubCategory, setQuizConfigSubCategory] = useState<string>("all");
  const [quizConfigNumQuestions, setQuizConfigNumQuestions] = useState<number>(10);

  // Active review focus inside summary step
  const [summaryReviewIdx, setSummaryReviewIdx] = useState<number | null>(null);

  // Timer stopwatch states
  const [quizSecondsElapsed, setQuizSecondsElapsed] = useState(0);
  const [quizTimerActive, setQuizTimerActive] = useState(false);

  // RAG explanation side drawer state
  const [explanationMCQId, setExplanationMCQId] = useState<number | null>(null);
  const [explanationData, setExplanationData] = useState<AnswerResponse | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState<string | null>(null);

  // UX Improvement state declarations (hamburger menu, accordion, feedback animations)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openAccordionCategory, setOpenAccordionCategory] = useState<string | null>(null);
  const [lastSelectedChoice, setLastSelectedChoice] = useState<string | null>(null);
  const [isCorrectSelection, setIsCorrectSelection] = useState<boolean | null>(null);
  const [theme, setTheme] = useState<"dark" | "light" | "balanced" | "warm">("dark");

  // Conversation
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Conversational Chat History states
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);

  // Resizable & Hover-Reveal Sidebar states
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);

  // MCQ Bank States
  const [mcqsList, setMcqsList] = useState<any[]>([]);
  const [isLoadingMcqs, setIsLoadingMcqs] = useState(false);
  const [mcqSearchText, setMcqSearchText] = useState("");
  const [mcqFilterCategory, setMcqFilterCategory] = useState("all");

  // Bookmarks States
  const [bookmarkedMcqs, setBookmarkedMcqs] = useState<any[]>([]);
  const [bookmarkedConcepts, setBookmarkedConcepts] = useState<any[]>([]);
  const [isLoadingBookmarks, setIsLoadingBookmarks] = useState(false);
  const [bookmarksActiveTab, setBookmarksActiveTab] = useState<"mcq" | "concept">("mcq");

  // Stats States
  const [detailedStats, setDetailedStats] = useState<any>(null);
  const [isLoadingDetailedStats, setIsLoadingDetailedStats] = useState(false);

  const fetchConversations = useCallback(() => {
    const savedToken = localStorage.getItem("token") || token;
    if (!savedToken) return;
    setIsLoadingConversations(true);
    fetch(`${API}/api/chat/conversations`, {
      headers: { Authorization: `Bearer ${savedToken}` },
      credentials: "include"
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

  const handleSelectConversation = useCallback((convId: number) => {
    const savedToken = localStorage.getItem("token") || token;
    if (!savedToken) return;
    
    fetch(`${API}/api/chat/conversations/${convId}`, {
      headers: { Authorization: `Bearer ${savedToken}` },
      credentials: "include"
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
              citations: m.answer?.citations || [],
              figures: m.answer?.figures || []
            };
          } else {
            return {
              id: m.id,
              type: "user",
              content: m.content || "",
              timestamp: m.timestamp
            };
          }
        });
        setMessages(loadedMessages);
      })
      .catch((err) => console.error(err));
  }, [token]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setActiveConversationId(null);
    setInputValue("");
  }, []);

  const handleDeleteConversation = useCallback((convId: number) => {
    const savedToken = localStorage.getItem("token") || token;
    if (!savedToken) return;
    
    fetch(`${API}/api/chat/conversations/${convId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${savedToken}` },
      credentials: "include"
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
  }, [token, activeConversationId, fetchConversations, handleNewChat]);

  // MCQ Bank Actions
  const fetchMcqs = useCallback((category = "all", search = "") => {
    const savedToken = localStorage.getItem("token") || token;
    if (!savedToken) return;
    setIsLoadingMcqs(true);
    
    let url = `${API}/api/mcqs?category=${category}`;
    if (search.trim()) {
      url += `&search=${encodeURIComponent(search.trim())}`;
    }
    
    fetch(url, {
      headers: { Authorization: `Bearer ${savedToken}` },
      credentials: "include"
    })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Failed to load MCQs");
      })
      .then((data) => setMcqsList(data))
      .catch((err) => console.error(err))
      .finally(() => setIsLoadingMcqs(false));
  }, [token]);

  const toggleBookmarkMCQ = useCallback((mcqId: number) => {
    const savedToken = localStorage.getItem("token") || token;
    if (!savedToken) return;
    
    fetch(`${API}/api/bookmarks/mcq/${mcqId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${savedToken}` },
      credentials: "include"
    })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Failed to toggle bookmark");
      })
      .then((data) => {
        const isBookmarked = data.bookmarked;
        // Update MCQ Bank state list
        setMcqsList((prev) =>
          prev.map((m) => (m.id === mcqId ? { ...m, bookmarked: isBookmarked } : m))
        );
        // Update Bookmarks page state list
        if (!isBookmarked) {
          setBookmarkedMcqs((prev) => prev.filter((m) => m.id !== mcqId));
        } else {
          // Trigger bookmark fetch to sync
          fetchBookmarks();
        }
      })
      .catch((err) => console.error(err));
  }, [token]);

  // Bookmarks Actions
  const fetchBookmarks = useCallback(() => {
    const savedToken = localStorage.getItem("token") || token;
    if (!savedToken) return;
    setIsLoadingBookmarks(true);
    
    // Fetch MCQs bookmarks
    const p1 = fetch(`${API}/api/bookmarks/mcq`, {
      headers: { Authorization: `Bearer ${savedToken}` },
      credentials: "include"
    }).then((res) => res.json());

    // Fetch concepts bookmarks
    const p2 = fetch(`${API}/api/bookmarks/concept`, {
      headers: { Authorization: `Bearer ${savedToken}` },
      credentials: "include"
    }).then((res) => res.json());

    Promise.all([p1, p2])
      .then(([mcqs, concepts]) => {
        setBookmarkedMcqs(mcqs);
        setBookmarkedConcepts(concepts);
      })
      .catch((err) => console.error(err))
      .finally(() => setIsLoadingBookmarks(false));
  }, [token]);

  const handleCreateConceptBookmark = useCallback((content: string, title: string | null = null, page: number | null = null, context: string | null = null) => {
    const savedToken = localStorage.getItem("token") || token;
    if (!savedToken) return;
    
    fetch(`${API}/api/bookmarks/concept`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        Authorization: `Bearer ${savedToken}` 
      },
      credentials: "include",
      body: JSON.stringify({
        content,
        book_title: title,
        page_number: page,
        source_context: context
      })
    })
      .then((res) => {
        if (res.ok) {
          fetchBookmarks();
          // Alert user of bookmark success
          alert("Concept bookmarked successfully!");
        } else {
          alert("Failed to bookmark concept.");
        }
      })
      .catch((err) => console.error(err));
  }, [token, fetchBookmarks]);

  const handleDeleteConceptBookmark = useCallback((bookmarkId: number) => {
    const savedToken = localStorage.getItem("token") || token;
    if (!savedToken) return;
    
    fetch(`${API}/api/bookmarks/concept/${bookmarkId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${savedToken}` },
      credentials: "include"
    })
      .then((res) => {
        if (res.ok) {
          setBookmarkedConcepts((prev) => prev.filter((b) => b.id !== bookmarkId));
        }
      })
      .catch((err) => console.error(err));
  }, [token]);

  // Stats Actions
  const fetchDetailedStats = useCallback(() => {
    const savedToken = localStorage.getItem("token") || token;
    if (!savedToken) return;
    setIsLoadingDetailedStats(true);
    
    fetch(`${API}/api/dashboard/detailed-stats`, {
      headers: { Authorization: `Bearer ${savedToken}` },
      credentials: "include"
    })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Failed to load detailed stats");
      })
      .then((data) => setDetailedStats(data))
      .catch((err) => console.error(err))
      .finally(() => setIsLoadingDetailedStats(false));
  }, [token]);

  // Load conversations, mcqs, bookmarks, or stats when their views become active
  useEffect(() => {
    const savedToken = token || localStorage.getItem("token");
    if (!savedToken) return;

    if (activeView === "chat") {
      fetchConversations();
    } else if (activeView === "mcq-bank") {
      fetchMcqs(mcqFilterCategory, mcqSearchText);
    } else if (activeView === "bookmarks") {
      fetchBookmarks();
    } else if (activeView === "stats") {
      fetchDetailedStats();
    }
  }, [activeView, token, fetchConversations, fetchMcqs, fetchBookmarks, fetchDetailedStats, mcqFilterCategory, mcqSearchText]);

  // Lightbox
  const [lightboxFig, setLightboxFig] = useState<Figure | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const getHeaders = useCallback((): HeadersInit => {
    const t = localStorage.getItem("token") || token;
    return t ? { Authorization: `Bearer ${t}` } : {};
  }, [token]);

  // Load saved theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme && ["dark", "light", "balanced", "warm"].includes(savedTheme)) {
      setTheme(savedTheme as any);
    }
  }, []);

  // Update root element class list when theme changes
  useEffect(() => {
    document.documentElement.classList.remove("theme-dark", "theme-light", "theme-balanced", "theme-warm");
    document.documentElement.classList.add(`theme-${theme}`);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    if (activeView === "chat") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, activeView]);

  // Mount + auth check
  useEffect(() => {
    setMounted(true);
    const savedToken = localStorage.getItem("token");
    const savedUsername = localStorage.getItem("username");
    const savedRole = localStorage.getItem("role");

    if (savedToken && savedUsername && savedRole) {
      fetch(`${API}/api/auth/me`, {
        headers: { Authorization: `Bearer ${savedToken}` },
        credentials: "include",
      })
        .then((res) => {
          if (res.ok) {
            setToken(savedToken);
            setUsername(savedUsername);
            setRole(savedRole);
          } else {
            handleLogout();
          }
        })
        .catch(() => {
          setToken(savedToken);
          setUsername(savedUsername);
          setRole(savedRole);
        })
        .finally(() => setIsAuthLoading(false));
    } else {
      setIsAuthLoading(false);
    }
  }, []);

  // ─── Practice Center / Quiz Effects & Actions (Phase 11) ─────

  // Reset/Pre-fill Quiz States on View Entry
  useEffect(() => {
    if (activeView === "quiz") {
      setQuizStep("config");
      setQuizSelectedAnswers({});
      setQuizCurrentIdx(0);
      setQuizSecondsElapsed(0);
      setQuizTimerActive(false);
      setExplanationMCQId(null);
      setExplanationData(null);
      setSummaryReviewIdx(null);
      
      if (selectedTopic) {
        setQuizConfigCategory(selectedTopic.main_category || "all");
        setQuizConfigSubCategory(selectedTopic.name || "all");
      } else {
        setQuizConfigCategory("all");
        setQuizConfigSubCategory("all");
      }
    }
  }, [activeView, selectedTopic]);

  // Stopwatch Interval
  useEffect(() => {
    let interval: any = null;
    if (quizTimerActive) {
      interval = setInterval(() => {
        setQuizSecondsElapsed((s) => s + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [quizTimerActive]);

  const formatTime = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // On-demand explanation fetcher
  const fetchExplanation = async (mcqId: number) => {
    setExplanationMCQId(mcqId);
    setExplanationLoading(true);
    setExplanationError(null);
    setExplanationData(null);
    try {
      const res = await fetch(`${API}/api/mcqs/${mcqId}/explain`, {
        method: "POST",
        headers: getHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to generate clinical explanation from textbook library.");
      }
      const data = await res.json();
      setExplanationData({
        answer_markdown: data.answer_markdown,
        citations: data.citations || [],
        figures: data.figures || [],
      });
    } catch (err: any) {
      setExplanationError(err.message || "Failed to load explanation.");
    } finally {
      setExplanationLoading(false);
    }
  };

  // Review a previous quiz attempt
  const handleReviewPreviousQuiz = async (attemptId: number) => {
    setQuizIsLoading(true);
    try {
      const res = await fetch(`${API}/api/quizzes/${attemptId}`, {
        method: "GET",
        headers: getHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || "Failed to load quiz details for review.");
      }
      const data = await res.json();
      setQuizMCQs(data.questions || []);
      setQuizSelectedAnswers(data.selected_answers || {});
      setQuizAttemptId(data.id);
      setQuizCurrentIdx(0);
      setSummaryReviewIdx(0);
      setQuizSecondsElapsed(0); // Optional: reset elapsed time visual
      setQuizTimerActive(false);
      setQuizStep("summary");
      setActiveView("quiz");
    } catch (err: any) {
      alert(err.message || "Failed to load quiz attempt details.");
    } finally {
      setQuizIsLoading(false);
    }
  };

  // Launch quiz attempt
  const handleStartQuiz = async () => {
    setQuizIsLoading(true);
    try {
      const res = await fetch(`${API}/api/quizzes/start`, {
        method: "POST",
        headers: {
          ...getHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          main_category: quizConfigCategory === "all" ? null : quizConfigCategory,
          sub_category: quizConfigSubCategory === "all" ? null : quizConfigSubCategory,
          num_questions: quizConfigNumQuestions,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || "No questions found matching category criteria.");
      }
      const data = await res.json();
      setQuizMCQs(data.mcqs);
      setQuizAttemptId(data.quiz_attempt_id);
      setQuizCurrentIdx(0);
      setQuizSelectedAnswers({});
      setQuizStep("taker");
      setQuizSecondsElapsed(0);
      setQuizTimerActive(true);
    } catch (err: any) {
      alert(err.message || "Failed to generate quiz attempt.");
    } finally {
      setQuizIsLoading(false);
    }
  };

  // Submit and score quiz
  const handleSubmitQuiz = async () => {
    if (!quizAttemptId) return;
    setQuizIsSubmitting(true);
    setQuizTimerActive(false);

    const formattedAnswers = Object.entries(quizSelectedAnswers).map(([mcqId, option]) => ({
      mcq_id: parseInt(mcqId),
      selected_option: option,
    }));

    try {
      const res = await fetch(`${API}/api/quizzes/${quizAttemptId}/submit`, {
        method: "POST",
        headers: {
          ...getHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ answers: formattedAnswers }),
      });
      if (!res.ok) {
        throw new Error("Failed to finalize results on server.");
      }
      // Finish locally and transition step
      setQuizStep("summary");
      setSummaryReviewIdx(0); // pre-focus first question in review
      fetchStats();
    } catch (err: any) {
      alert(err.message || "Failed to submit answers.");
      setQuizTimerActive(true);
    } finally {
      setQuizIsSubmitting(false);
    }
  };

  // Lifted option selector supporting pop/shake animations and incorrect auto-explain
  const handleSelectOption = (key: string) => {
    const currentMCQ = quizMCQs[quizCurrentIdx];
    if (!currentMCQ) return;
    const isAnswered = quizSelectedAnswers[currentMCQ.id] !== undefined;
    if (isAnswered) return;

    const isCorrect = key === currentMCQ.correct_option;
    setQuizSelectedAnswers((prev) => ({
      ...prev,
      [currentMCQ.id]: key,
    }));

    setLastSelectedChoice(key);
    setIsCorrectSelection(isCorrect);

    // Auto-open RAG explanation for incorrect answers only (hybrid behavior)
    if (!isCorrect) {
      fetchExplanation(currentMCQ.id);
    }
  };

  // Keyboard shortcut listener hook
  useEffect(() => {
    if (activeView !== "quiz" || quizStep !== "taker" || quizMCQs.length === 0) return;

    const currentMCQ = quizMCQs[quizCurrentIdx];
    if (!currentMCQ) return;

    const isAnswered = quizSelectedAnswers[currentMCQ.id] !== undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
        return;
      }

      const key = e.key.toUpperCase();
      const optionKeys = Object.keys(currentMCQ.options).sort();

      // 1. Select options via keys A, B, C, D or 1, 2, 3, 4
      if (!isAnswered) {
        if (["A", "B", "C", "D"].includes(key)) {
          if (optionKeys.includes(key)) {
            handleSelectOption(key);
          }
        } else if (["1", "2", "3", "4"].includes(key)) {
          const idx = parseInt(key) - 1;
          if (idx >= 0 && idx < optionKeys.length) {
            handleSelectOption(optionKeys[idx]);
          }
        }
      } else {
        // 2. Next Question / Submit via Enter or Right Arrow
        if (e.key === "Enter" || e.key === "ArrowRight") {
          if (quizCurrentIdx < quizMCQs.length - 1) {
            setQuizCurrentIdx((prev) => prev + 1);
            setExplanationMCQId(null);
            setLastSelectedChoice(null);
            setIsCorrectSelection(null);
          } else if (!quizIsSubmitting) {
            handleSubmitQuiz();
          }
        }

        // 3. Toggle explanation via E key
        if (key === "E") {
          if (explanationMCQId === null) {
            fetchExplanation(currentMCQ.id);
          } else {
            setExplanationMCQId(null);
          }
        }
      }

      // 4. Quit session via Q key
      if (key === "Q") {
        const confirmQuit = window.confirm(
          "Are you sure you want to quit this practice session? Your progress will not be saved."
        );
        if (confirmQuit) {
          setActiveView("dashboard");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeView, quizStep, quizCurrentIdx, quizMCQs, quizSelectedAnswers, quizIsSubmitting, explanationMCQId]);


  // Fetch books
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

  // Fetch stats from backend
  const fetchStats = useCallback(async () => {
    if (!token) return;
    setIsLoadingStats(true);
    try {
      const res = await fetch(`${API}/api/dashboard/stats`, {
        headers: getHeaders(),
        credentials: "include",
      });
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.error("Failed to load dashboard stats", err);
    } finally {
      setIsLoadingStats(false);
    }
  }, [token, getHeaders]);

  // Unified dashboard preloader to fetch books and stats in parallel
  const preloadDashboardData = useCallback(async () => {
    if (!token) return;
    setIsLoadingBooks(true);
    setIsLoadingStats(true);
    try {
      await Promise.all([
        fetchBooks(false),
        fetchStats()
      ]);
    } catch (err) {
      console.error("Dashboard preloading failed:", err);
    } finally {
      setIsLoadingBooks(false);
      setIsLoadingStats(false);
    }
  }, [token, fetchBooks, fetchStats]);

  useEffect(() => {
    if (token) {
      preloadDashboardData();
    }
  }, [token, preloadDashboardData]);

  // Poll processing books
  useEffect(() => {
    if (!token || books.length === 0) return;
    const hasActive = books.some((b) => b.status === "processing" || b.status === "pending");
    if (!hasActive) return;
    const t = setInterval(() => fetchBooks(false), 4000);
    return () => clearInterval(t);
  }, [books, token]);

  // Refresh stats on specific actions
  useEffect(() => {
    if (token && activeView === "dashboard") {
      fetchStats();
    }
  }, [activeView, token, fetchStats]);

  // Auth submit
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthError("Username and password are required.");
      return;
    }
    setAuthError(null);
    setIsAuthLoading(true);
    try {
      if (isRegisterMode) {
        const res = await fetch(`${API}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ username: authUsername, password: authPassword, role: authRole }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.detail || "Registration failed.");
        }
        setIsRegisterMode(false);
        setAuthPassword("");
        setAuthError(null);
        alert("Account created. Please sign in.");
      } else {
        const params = new URLSearchParams();
        params.append("username", authUsername);
        params.append("password", authPassword);
        const res = await fetch(`${API}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          credentials: "include",
          body: params,
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.detail || "Incorrect credentials.");
        }
        const data = await res.json();
        localStorage.setItem("token", data.access_token);
        localStorage.setItem("username", data.username);
        localStorage.setItem("role", data.role);
        setToken(data.access_token);
        setUsername(data.username);
        setRole(data.role);
        setAuthUsername("");
        setAuthPassword("");
      }
    } catch (err: any) {
      setAuthError(err.message || "Authentication error.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API}/api/auth/logout`, { method: "POST", credentials: "include" });
    } catch {}
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("role");
    setToken(null);
    setUsername(null);
    setRole(null);
    setBooks([]);
    setMessages([]);
    setInputValue("");
  };

  // File upload
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

  // Delete book
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

  // Query
  const sendQuery = useCallback(
    async (q: string) => {
      if (!q.trim() || isSearching) return;
      const queryText = q.trim();
      setInputValue("");
      setIsSearching(true);

      const timeStr = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

      // Add user bubble with timestamp
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

        // Client-side word-by-word streaming effect
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
                  timestamp: timeStr
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
                      timestamp: timeStr
                    }
                  : m
              )
            );
            wordIdx++;
          } else {
            clearInterval(streamInterval);
            // Finally set the complete object with citations and figures
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tid
                  ? { id: tid, type: "ai", answer: data, query: queryText, timestamp: timeStr }
                  : m
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

  // Textarea auto-grow + submit on Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuery(inputValue);
    }
  };

  // Detailed charts init hook
  useEffect(() => {
    let active = true;
    if (activeView === "stats" && detailedStats) {
      const initCharts = () => {
        const trendCtx = document.getElementById("accuracyTrendChart") as HTMLCanvasElement;
        const catCtx = document.getElementById("categoryBreakdownChart") as HTMLCanvasElement;
        if (!trendCtx || !catCtx || !active) return;
        
        if ((window as any).trendChartInstance) (window as any).trendChartInstance.destroy();
        if ((window as any).catChartInstance) (window as any).catChartInstance.destroy();
        
        const trendLabels = detailedStats.history_trend.map((t: any) => t.date);
        const trendData = detailedStats.history_trend.map((t: any) => t.accuracy);
        
        const catLabels = Object.keys(detailedStats.category_breakdown);
        const catData = Object.values(detailedStats.category_breakdown).map((c: any) => c.accuracy);
        
        (window as any).trendChartInstance = new (window as any).Chart(trendCtx, {
          type: 'line',
          data: {
            labels: trendLabels,
            datasets: [{
              label: 'Accuracy %',
              data: trendData,
              borderColor: '#30c5ff',
              backgroundColor: 'rgba(48, 197, 255, 0.1)',
              tension: 0.3,
              fill: true
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
              duration: 500,
              easing: 'easeOutQuart'
            },
            plugins: {
              legend: { labels: { color: '#b0c4de' } }
            },
            scales: {
              x: { ticks: { color: '#b0c4de' }, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
              y: { min: 0, max: 100, ticks: { color: '#b0c4de' }, grid: { color: 'rgba(255, 255, 255, 0.05)' } }
            }
          }
        });
        
        (window as any).catChartInstance = new (window as any).Chart(catCtx, {
          type: 'bar',
          data: {
            labels: catLabels,
            datasets: [{
              label: 'Accuracy %',
              data: catData,
              backgroundColor: 'rgba(92, 148, 110, 0.7)',
              borderColor: '#5c946e',
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
              duration: 500,
              easing: 'easeOutQuart'
            },
            plugins: {
              legend: { labels: { color: '#b0c4de' } }
            },
            scales: {
              x: { ticks: { color: '#b0c4de' }, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
              y: { min: 0, max: 100, ticks: { color: '#b0c4de' }, grid: { color: 'rgba(255, 255, 255, 0.05)' } }
            }
          }
        });
      };

      if (!(window as any).Chart) {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/chart.js";
        script.async = true;
        script.onload = () => {
          if (active) initCharts();
        };
        document.body.appendChild(script);
      } else {
        initCharts();
      }
    }
    return () => {
      active = false;
    };
  }, [activeView, detailedStats]);

  // Handle sidebar resize drag logic
  const startResizing = useCallback((e: React.MouseEvent) => {
    setIsSidebarResizing(true);
    e.preventDefault();
  }, []);

  const stopResizing = useCallback(() => {
    setIsSidebarResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isSidebarResizing) {
      // Allow sizes between 180px and 450px
      const newWidth = e.clientX;
      if (newWidth > 180 && newWidth < 450) {
        setSidebarWidth(newWidth);
      }
    }
  }, [isSidebarResizing]);

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  // Helper to split conversations into Today, Yesterday, and Older sections
  const groupConversations = (items: any[]) => {
    const today: any[] = [];
    const yesterday: any[] = [];
    const older: any[] = [];
    
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    
    items.forEach((item) => {
      const itemDate = new Date(item.created_at || item.updated_at || Date.now());
      if (itemDate >= startOfToday) {
        today.push(item);
      } else if (itemDate >= startOfYesterday) {
        yesterday.push(item);
      } else {
        older.push(item);
      }
    });
    
    return { today, yesterday, older };
  };

  // ─── Render: init ───────────────────────────────────────────
  if (!mounted || (isAuthLoading && !token)) {
    return (
      <div className="init-screen" aria-label="Initializing medNAMA">
        <div className="init-spinner" role="status" aria-label="Loading" />
        <span className="init-label">Initializing secure session…</span>
      </div>
    );
  }

  // ─── Render: auth ───────────────────────────────────────────
  if (!token) {
    return (
      <div className="auth-shell">
        <div className="auth-card" role="main">
          <div className="auth-logo">
            <div className="auth-brand-mark" aria-hidden>
              <Stethoscope size={26} />
            </div>
            <div>
              <h1 className="auth-title">
                med<span>NAMA</span>
              </h1>
              <p className="auth-subtitle">
                {isRegisterMode
                  ? "Create your clinical workspace account"
                  : "Sign in to access your medical knowledge base"}
              </p>
            </div>
          </div>

          {authError && (
            <div className="auth-error" role="alert">
              <AlertCircle size={14} />
              {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} noValidate>
            <div className="field">
              <label className="field-label" htmlFor="auth-username">
                Username
              </label>
              <input
                id="auth-username"
                type="text"
                className="field-input"
                placeholder="Enter your username"
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="auth-password">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                className="field-input"
                placeholder="Enter your password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                autoComplete={isRegisterMode ? "new-password" : "current-password"}
                required
              />
            </div>
            {isRegisterMode && (
              <div className="field">
                <label className="field-label" htmlFor="auth-role">
                  Account role
                </label>
                <select
                  id="auth-role"
                  className="field-input field-select"
                  value={authRole}
                  onChange={(e) => setAuthRole(e.target.value)}
                >
                  <option value="student">Student</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
            )}
            <button type="submit" className="btn-primary" disabled={isAuthLoading}>
              {isAuthLoading
                ? "Authenticating…"
                : isRegisterMode
                ? "Create account"
                : "Sign in"}
            </button>
          </form>

          {!isRegisterMode && (
            <div className="quick-creds">
              <div className="quick-creds-label">Quick start credentials</div>
              <div className="quick-creds-row">
                <button
                  className="quick-cred-btn"
                  type="button"
                  onClick={() => {
                    setAuthUsername("admin");
                    setAuthPassword("admin123");
                  }}
                >
                  Admin
                </button>
                <button
                  className="quick-cred-btn"
                  type="button"
                  onClick={() => {
                    setAuthUsername("student");
                    setAuthPassword("student123");
                  }}
                >
                  Student
                </button>
              </div>
            </div>
          )}

          <div className="auth-switch">
            {isRegisterMode ? (
              <>
                Already have an account?{" "}
                <button
                  className="auth-switch-btn"
                  type="button"
                  onClick={() => setIsRegisterMode(false)}
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                New to medNAMA?{" "}
                <button
                  className="auth-switch-btn"
                  type="button"
                  onClick={() => {
                    setIsRegisterMode(true);
                    setAuthRole("student");
                  }}
                >
                  Create account
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: main app ───────────────────────────────────────
  const isAdmin = role === "admin";
  const initials = username ? username.slice(0, 2).toUpperCase() : "DR";



  // MCQ Bank page renderer
  const renderMCQBank = () => {
    const categories = stats?.categories || [];
    return (
      <div className="dashboard-view" role="region" aria-label="MCQ Bank">
        <div className="dashboard-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--sp-4)" }}>
          <div>
            <div className="dashboard-eyebrow">
              <BookMarked size={12} style={{ marginRight: 6 }} />
              Clinical Question Bank
            </div>
            <h1 className="dashboard-title">MCQ Bank</h1>
          </div>
          
          <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap", alignItems: "center" }}>
            <select 
              className="theme-mode-btn" 
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: "0.85rem", height: "38px" }}
              value={mcqFilterCategory}
              onChange={(e) => setMcqFilterCategory(e.target.value)}
            >
              <option value="all">All Subjects</option>
              {categories.map((c: any, idx: number) => (
                <option key={idx} value={c.main_category}>{c.main_category}</option>
              ))}
            </select>
            <input 
              type="text" 
              className="input-box" 
              style={{ width: "200px", padding: "8px 12px", fontSize: "0.85rem", border: "1px solid var(--border)", height: "38px", margin: 0 }}
              placeholder="Search questions..."
              value={mcqSearchText}
              onChange={(e) => setMcqSearchText(e.target.value)}
            />
          </div>
        </div>

        <div className={`quiz-split-layout ${explanationMCQId !== null ? "has-explanation" : ""}`}>
          <div className="quiz-question-col" style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)", maxHeight: "calc(100vh - 200px)", overflowY: "auto", paddingRight: "4px" }}>
            {isLoadingMcqs ? (
              <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "var(--sp-12)" }}>Loading question bank...</div>
            ) : mcqsList.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "var(--sp-12)" }}>No questions matched filters</div>
            ) : (
              mcqsList.map((mcq) => (
                <div 
                  key={mcq.id} 
                  style={{ 
                    background: "var(--surface-2)", 
                    border: "1px solid var(--border)", 
                    borderRadius: "var(--r-xl)", 
                    padding: "var(--sp-5)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--sp-3)"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--sky)", background: "var(--sky-dim)", padding: "2px 8px", borderRadius: "10px", fontWeight: 600 }}>
                      {mcq.main_category}
                    </span>
                    <button 
                      className="chat-delete-btn" 
                      style={{ position: "static", opacity: 1, color: mcq.bookmarked ? "var(--teal)" : "var(--text-muted)" }}
                      onClick={() => toggleBookmarkMCQ(mcq.id)}
                      title="Bookmark Question"
                    >
                      <Bookmark size={14} fill={mcq.bookmarked ? "currentColor" : "none"} />
                    </button>
                  </div>

                  <p style={{ fontWeight: 500, lineHeight: 1.5, color: "var(--text-primary)", fontFamily: "var(--font-serif)" }}>{mcq.question_text}</p>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                    {Object.keys(mcq.options).sort().map((key) => {
                      const isCorrect = key === mcq.correct_option;
                      return (
                        <div 
                          key={key} 
                          className={`option-button ${isCorrect ? "correct" : ""}`}
                          style={{ cursor: "default", opacity: 0.9, display: "flex", alignItems: "center", gap: "10px" }}
                        >
                          <span className="option-badge">{key}</span>
                          <span style={{ textAlign: "left", flex: 1 }}>{mcq.options[key]}</span>
                          {isCorrect && <Check size={12} style={{ color: "var(--success)" }} />}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "var(--sp-3)", display: "flex", justifyContent: "flex-end" }}>
                    <button 
                      className="btn-workspace"
                      style={{ borderColor: "var(--teal)", color: "var(--teal)", display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px", fontSize: "0.75rem" }}
                      onClick={() => fetchExplanation(mcq.id)}
                    >
                      <GraduationCap size={12} />
                      Clinical Explanation
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {renderExplanationPanel()}
        </div>
      </div>
    );
  };

  // Bookmarks page renderer
  const renderBookmarks = () => {
    return (
      <div className="dashboard-view" role="region" aria-label="Bookmarks">
        <div className="dashboard-header">
          <div className="dashboard-eyebrow">
            <Bookmark size={12} style={{ marginRight: 6 }} />
            Saved Study Materials
          </div>
          <h1 className="dashboard-title">Bookmarks</h1>
        </div>

        <div style={{ display: "flex", gap: "var(--sp-4)", borderBottom: "1px solid var(--border-light)", marginBottom: "var(--sp-6)", paddingBottom: "var(--sp-2)" }}>
          <button 
            className={`btn-workspace-nav ${bookmarksActiveTab === "mcq" ? "active" : ""}`}
            style={{ borderBottom: bookmarksActiveTab === "mcq" ? "2px solid var(--sky)" : "none", borderRadius: 0, background: "transparent", padding: "6px 12px", width: "auto" }}
            onClick={() => setBookmarksActiveTab("mcq")}
          >
            Bookmarked MCQs ({bookmarkedMcqs.length})
          </button>
          <button 
            className={`btn-workspace-nav ${bookmarksActiveTab === "concept" ? "active" : ""}`}
            style={{ borderBottom: bookmarksActiveTab === "concept" ? "2px solid var(--sky)" : "none", borderRadius: 0, background: "transparent", padding: "6px 12px", width: "auto" }}
            onClick={() => setBookmarksActiveTab("concept")}
          >
            Concept Extracts ({bookmarkedConcepts.length})
          </button>
        </div>

        {isLoadingBookmarks ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "var(--sp-12)" }}>Loading bookmarks...</div>
        ) : bookmarksActiveTab === "mcq" ? (
          <div className={`quiz-split-layout ${explanationMCQId !== null ? "has-explanation" : ""}`}>
            <div className="quiz-question-col" style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)", maxHeight: "calc(100vh - 250px)", overflowY: "auto", paddingRight: "4px" }}>
              {bookmarkedMcqs.length === 0 ? (
                <div className="empty-state-card">
                  <Bookmark size={24} className="empty-icon" />
                  <span className="empty-title">No bookmarked questions yet</span>
                  <span className="empty-desc">Bookmark questions during practice exams or inside the MCQ Bank to review them here.</span>
                </div>
              ) : (
                bookmarkedMcqs.map((mcq) => (
                  <div 
                    key={mcq.id} 
                    style={{ 
                      background: "var(--surface-2)", 
                      border: "1px solid var(--border)", 
                      borderRadius: "var(--r-xl)", 
                      padding: "var(--sp-5)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "var(--sp-3)"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.72rem", color: "var(--sky)", background: "var(--sky-dim)", padding: "2px 8px", borderRadius: "10px", fontWeight: 600 }}>
                        {mcq.main_category}
                      </span>
                      <button 
                        className="chat-delete-btn" 
                        style={{ position: "static", opacity: 1, color: "var(--teal)" }}
                        onClick={() => toggleBookmarkMCQ(mcq.id)}
                        title="Remove Bookmark"
                      >
                        <Bookmark size={14} fill="currentColor" />
                      </button>
                    </div>
                    <p style={{ fontWeight: 500, lineHeight: 1.5, color: "var(--text-primary)", fontFamily: "var(--font-serif)" }}>{mcq.question_text}</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                      {Object.keys(mcq.options).sort().map((key) => {
                        const isCorrect = key === mcq.correct_option;
                        return (
                          <div 
                            key={key} 
                            className={`option-button ${isCorrect ? "correct" : ""}`}
                            style={{ cursor: "default", opacity: 0.9, display: "flex", alignItems: "center", gap: "10px" }}
                          >
                            <span className="option-badge">{key}</span>
                            <span style={{ textAlign: "left", flex: 1 }}>{mcq.options[key]}</span>
                            {isCorrect && <Check size={12} style={{ color: "var(--success)" }} />}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "var(--sp-3)", display: "flex", justifyContent: "flex-end" }}>
                      <button 
                        className="btn-workspace"
                        style={{ borderColor: "var(--teal)", color: "var(--teal)", display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px", fontSize: "0.75rem" }}
                        onClick={() => fetchExplanation(mcq.id)}
                      >
                        <GraduationCap size={12} />
                        Clinical Explanation
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {renderExplanationPanel()}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "var(--sp-4)", maxHeight: "calc(100vh - 250px)", overflowY: "auto", paddingRight: "4px" }}>
            {bookmarkedConcepts.length === 0 ? (
              <div className="empty-state-card">
                <BookOpen size={24} className="empty-icon" />
                <span className="empty-title">No textbook concepts saved yet</span>
                <span className="empty-desc">Click the "Save" icon on clinical chatbot answers to pin key reference extracts here.</span>
              </div>
            ) : (
              bookmarkedConcepts.map((item) => (
                <div 
                  key={item.id} 
                  style={{ 
                    background: "var(--surface-2)", 
                    border: "1px solid var(--border)", 
                    borderRadius: "var(--r-xl)", 
                    padding: "var(--sp-5)",
                    position: "relative"
                  }}
                >
                  <button 
                    className="chat-delete-btn" 
                    style={{ position: "absolute", right: "var(--sp-4)", top: "var(--sp-4)", opacity: 1 }}
                    onClick={() => handleDeleteConceptBookmark(item.id)}
                    title="Remove Bookmark"
                  >
                    <Trash2 size={14} />
                  </button>

                  <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", marginBottom: "var(--sp-3)" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--sky)", background: "var(--sky-dim)", padding: "2px 8px", borderRadius: "10px", fontWeight: 600 }}>
                      {item.source_context || "Saved Concept"}
                    </span>
                    {item.book_title && (
                      <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontFamily: "var(--font-serif)" }}>
                        {item.book_title} {item.page_number ? `p. ${item.page_number}` : ""}
                      </span>
                    )}
                  </div>

                  <div 
                    className="prose" 
                    dangerouslySetInnerHTML={{ __html: parseMarkdown(item.content) }} 
                    style={{ paddingRight: "30px", fontSize: "0.92rem", lineHeight: 1.6 }}
                  />
                  <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "12px", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                    Saved on {item.created_at}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  // Stats page renderer
  const renderStats = () => {
    return (
      <div className="dashboard-view" role="region" aria-label="Detailed Analytics" style={{ maxHeight: "calc(100vh - 100px)", overflowY: "auto", paddingBottom: "var(--sp-8)" }}>
        <div className="dashboard-header">
          <div className="dashboard-eyebrow">
            <TrendingUp size={12} style={{ marginRight: 6 }} />
            Performance Telemetry
          </div>
          <h1 className="dashboard-title">Detailed Analytics</h1>
        </div>

        {isLoadingDetailedStats ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "var(--sp-12)" }}>Calculating metrics...</div>
        ) : !detailedStats || detailedStats.total_attempts === 0 ? (
          <div className="empty-state-card">
            <TrendingUp size={24} className="empty-icon" />
            <span className="empty-title">No completed quizzes yet</span>
            <span className="empty-desc">Take mock board exams in the Mock Builder tab to generate performance statistics.</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-6)" }}>
            <div className="dashboard-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              <div className="stat-card">
                <div className="stat-icon">
                  <GraduationCap size={20} />
                </div>
                <div className="stat-details">
                  <span className="stat-value">{detailedStats.total_attempts}</span>
                  <span className="stat-label">Attempts Taken</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon teal">
                  <TrendingUp size={20} />
                </div>
                <div className="stat-details">
                  <span className="stat-value">{detailedStats.avg_accuracy}%</span>
                  <span className="stat-label">Average Accuracy</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">
                  <BookMarked size={20} />
                </div>
                <div className="stat-details">
                  <span className="stat-value">{detailedStats.total_questions}</span>
                  <span className="stat-label">Questions Solved</span>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: "var(--sp-6)", marginTop: "var(--sp-2)" }}>
              <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "var(--sp-5)", display: "flex", flexDirection: "column", gap: "10px" }}>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>Accuracy Trend (Last 15 Sessions)</h3>
                <div style={{ position: "relative", height: "240px", width: "100%" }}>
                  <canvas id="accuracyTrendChart" />
                </div>
              </div>

              <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "var(--sp-5)", display: "flex", flexDirection: "column", gap: "10px" }}>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>Subject Mastery (Accuracy %)</h3>
                <div style={{ position: "relative", height: "240px", width: "100%" }}>
                  <canvas id="categoryBreakdownChart" />
                </div>
              </div>
            </div>

            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "var(--sp-5)", marginTop: "var(--sp-2)" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "var(--sp-4)" }}>Mock Session Logs</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>
                      <th style={{ padding: "10px var(--sp-2)" }}>Date</th>
                      <th style={{ padding: "10px var(--sp-2)" }}>Score</th>
                      <th style={{ padding: "10px var(--sp-2)" }}>Accuracy</th>
                      <th style={{ padding: "10px var(--sp-2)" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailedStats.history_trend.slice().reverse().map((item: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: "1px solid var(--border-light)" }}>
                        <td style={{ padding: "12px var(--sp-2)", color: "var(--text-primary)", fontWeight: 500 }}>{item.date}</td>
                        <td style={{ padding: "12px var(--sp-2)" }}>{item.score} / {item.total}</td>
                        <td style={{ padding: "12px var(--sp-2)", color: "var(--teal)", fontWeight: 600 }}>{item.accuracy}%</td>
                        <td style={{ padding: "12px var(--sp-2)" }}>
                          <button 
                            className="btn-workspace"
                            style={{ padding: "4px 8px", fontSize: "0.7rem", borderColor: "var(--border)" }}
                            onClick={() => {
                              fetch(`${API}/api/quizzes/${item.attempt_id}`, {
                                headers: getHeaders(),
                                credentials: "include"
                              })
                                .then(res => res.json())
                                .then(data => {
                                  setQuizAttemptId(data.id);
                                  setQuizMCQs(data.questions);
                                  setQuizSelectedAnswers(data.selected_answers);
                                  setQuizStep("summary");
                                  setActiveView("quiz");
                                });
                            }}
                          >
                            Review Attempt
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDashboard = () => {
    return (
      <div className="dashboard-view" role="region" aria-label="Dashboard metrics">
        <div className="dashboard-header">
          <div className="dashboard-eyebrow">
            <Stethoscope size={12} style={{ marginRight: 6 }} />
            Clinical Intelligence Hub
          </div>
          <h1 className="dashboard-title">
            Welcome back, <span>Dr. {username}</span>
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: 4 }}>
            Access textbook grounding and board exam practice modules.
          </p>
        </div>

        {/* Bento Grid Stats */}
        <div className="dashboard-grid">
          <div className="stat-card">
            <div className="stat-icon">
              <BookOpen size={20} />
            </div>
            <div className="stat-details">
              <span className="stat-value">{stats ? stats.total_books : "..."}</span>
              <span className="stat-label">Textbooks</span>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon teal">
              <GraduationCap size={20} />
            </div>
            <div className="stat-details">
              <span className="stat-value">{stats ? stats.total_mcqs.toLocaleString() : "..."}</span>
              <span className="stat-label">Board MCQs</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon green">
              <Stethoscope size={20} />
            </div>
            <div className="stat-details">
              <span className="stat-value">{stats ? stats.average_score + "%" : "0%"}</span>
              <span className="stat-label">Avg Accuracy</span>
            </div>
          </div>
        </div>

        {/* Workspace Cards */}
        <div className="workspace-section">
          <div className="workspace-card">
            <div className="workspace-badge">
              <MessageSquare size={10} style={{ marginRight: 4 }} />
              Diagnostic Search
            </div>
            <h3 className="workspace-title">Textbook Q&A Engine</h3>
            <p className="workspace-desc">
              Ask complex clinical questions and retrieve grounded answers verified by cross-referencing all loaded textbooks. Features inline citations and image extraction.
            </p>
            <button className="btn-workspace" onClick={() => setActiveView("chat")}>
              Open Workspace
            </button>
          </div>

          <div className="workspace-card quiz-card">
            <div className="workspace-badge">
              <GraduationCap size={10} style={{ marginRight: 4 }} />
              Adaptive Practice
            </div>
            <h3 className="workspace-title">Practice Exam Center</h3>
            <p className="workspace-desc">
              Self-assess your clinical knowledge across our database of 12,000+ board exam questions. Access instant results and detailed on-demand RAG explanations.
            </p>
            <button className="btn-workspace" onClick={() => {
              setSelectedTopic(null);
              setActiveView("quiz");
            }}>
              Start Practice
            </button>
          </div>
        </div>

        {/* Recent Practice History */}
        {stats && stats.recent_attempts && stats.recent_attempts.length > 0 && (
          <div className="recent-attempts-container">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 className="practice-title" style={{ fontSize: "1rem" }}>Recent Practice History</h3>
                <p className="practice-subtitle">Review your previous quiz submissions and RAG grounding</p>
              </div>
              <span className="topic-count" style={{ fontSize: "0.75rem" }}>{stats.recent_attempts.length} attempts logged</span>
            </div>
            
            <div className="attempts-list">
              {stats.recent_attempts.map((att: any, idx: number) => {
                const dateObj = new Date(att.completed_at || att.started_at);
                const dateStr = dateObj.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                });
                
                const accuracy = att.total_questions > 0 ? Math.round((att.score / att.total_questions) * 100) : 0;
                
                return (
                  <div key={idx} className="attempt-row-card">
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.9rem" }}>
                        {att.category}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {dateStr}
                      </span>
                    </div>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-4)" }}>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ display: "block", fontSize: "0.95rem", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                          {att.score} / {att.total_questions}
                        </span>
                        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: accuracy >= 70 ? "var(--sea-green)" : "var(--teal)" }}>
                          {accuracy}% Accuracy
                        </span>
                      </div>
                      
                      <button
                        className="btn-workspace"
                        style={{ padding: "6px 14px", fontSize: "0.78rem" }}
                        onClick={() => handleReviewPreviousQuiz(att.id)}
                      >
                        Review
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Topics Practice Explorer Accordion */}
        <div className="practice-section" style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
          <div className="practice-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 className="practice-title">Practice Explorer</h3>
              <p className="practice-subtitle">Select a subject category to launch a custom board practice quiz</p>
            </div>
            
            <button
              className="btn-workspace"
              style={{ padding: "6px 14px", fontSize: "0.78rem" }}
              onClick={() => {
                setOpenAccordionCategory(openAccordionCategory ? null : (stats?.categories?.[0]?.main_category || null));
              }}
            >
              {openAccordionCategory ? "Collapse All" : "Quick Expand"}
            </button>
          </div>
          
          {isLoadingStats ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
              <Loader2 size={20} style={{ margin: "0 auto 8px", display: "inline-block", animation: "spin 1s linear infinite" }} />
              <span style={{ display: "block", fontSize: "0.8rem", marginTop: 8 }}>Loading categories...</span>
            </div>
          ) : !stats || !stats.categories || stats.categories.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center", padding: "40px" }}>
              No practice categories found.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              {stats.categories.map((cat: any, idx: number) => {
                const isOpen = openAccordionCategory === cat.main_category;
                const totalCategoryMCQs = cat.sub_categories.reduce((sum: number, s: any) => sum + s.count, 0);
                
                return (
                  <div key={idx} style={{ display: "flex", flexDirection: "column" }}>
                    <button
                      className={`accordion-header ${isOpen ? "active" : ""}`}
                      onClick={() => setOpenAccordionCategory(isOpen ? null : cat.main_category)}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "0.88rem", fontWeight: 600, color: isOpen ? "var(--teal)" : "var(--text-primary)" }}>
                          {cat.main_category}
                        </span>
                        <span className="topic-count" style={{ background: "var(--surface-1)", padding: "2px 8px", borderRadius: "10px", fontSize: "0.72rem" }}>
                          {totalCategoryMCQs} MCQs
                        </span>
                      </div>
                      {isOpen ? <ChevronUp size={16} style={{ color: "var(--teal)" }} /> : <ChevronDown size={16} style={{ color: "var(--text-muted)" }} />}
                    </button>
                    
                    {isOpen && (
                      <div className="accordion-content">
                        <div className="topics-grid" role="list">
                          {cat.sub_categories.map((sub: any, subIdx: number) => (
                            <button
                              key={subIdx}
                              className="topic-item-card"
                              role="listitem"
                              onClick={() => {
                                setSelectedTopic({ name: sub.name, count: sub.count, main_category: cat.main_category });
                                setActiveView("quiz");
                              }}
                            >
                              <span className="topic-name" title={sub.name}>{sub.name}</span>
                              <span className="topic-count">{sub.count} MCQs</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Inline explanation panel renderer (sits next to question, no overlay)
  const renderExplanationPanel = () => {
    if (explanationMCQId === null) return null;
    return (
      <div className="explanation-inline-panel">
        <div className="explanation-inline-header">
          <h3 className="explanation-inline-title">
            <GraduationCap size={16} style={{ color: "var(--teal)" }} />
            RAG Explanation
          </h3>
          <button 
            className="close-btn" 
            onClick={() => setExplanationMCQId(null)}
            aria-label="Close explanation panel"
          >
            <X size={16} />
          </button>
        </div>
        <div className="explanation-inline-body">
          {explanationLoading ? (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-muted)" }}>
              <Loader2 size={22} className="spinner" style={{ margin: "0 auto 10px", display: "inline-block", animation: "spin 1s linear infinite" }} />
              <span style={{ display: "block", fontSize: "0.82rem" }}>Generating RAG Explanation...</span>
            </div>
          ) : explanationError ? (
            <div style={{ color: "var(--danger)", padding: "16px", fontSize: "0.82rem", textAlign: "center" }}>
              {explanationError}
            </div>
          ) : explanationData ? (
            <>
              <div 
                className="prose" 
                dangerouslySetInnerHTML={{ __html: parseMarkdown(explanationData.answer_markdown) }} 
              />
              
              {explanationData.citations.length > 0 && (
                <div style={{ marginTop: "12px" }}>
                  <h4 style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
                    Textbook References
                  </h4>
                  <CitationsDrawer citations={explanationData.citations} token={token} />
                </div>
              )}
              
              {explanationData.figures.length > 0 && (
                <div style={{ marginTop: "12px" }}>
                  <h4 style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
                    Extracted Figures
                  </h4>
                  <FiguresDrawer figures={explanationData.figures} token={token} onFigureClick={setLightboxFig} />
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    );
  };

  // Render Practice Exam Center UI
  const renderQuizScaffold = () => {
    // Stage 1: Configure practice session properties
    if (quizStep === "config") {
      const mainCategories = stats?.categories || [];
      const selectedMainCatObj = mainCategories.find((c: any) => c.main_category === quizConfigCategory);
      const subCategories = selectedMainCatObj?.sub_categories || [];

      let subCategoryOptions: any[] = [];
      if (quizConfigCategory === "all") {
        const allSubs = mainCategories.reduce((acc: any[], cat: any) => {
          cat.sub_categories.forEach((sub: any) => {
            if (!acc.some((s: any) => s.name === sub.name)) {
              acc.push(sub);
            }
          });
          return acc;
        }, []);
        subCategoryOptions = allSubs;
      } else {
        subCategoryOptions = subCategories;
      }

      return (
        <div className="dashboard-view" role="region" aria-label="Practice Settings">
          <div className="dashboard-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="dashboard-eyebrow">
                <GraduationCap size={12} style={{ marginRight: 6 }} />
                Practice Exam Center
              </div>
              <h1 className="dashboard-title">Configure Practice Session</h1>
            </div>
            <button className="btn-workspace" onClick={() => setActiveView("dashboard")}>
              Back to Dashboard
            </button>
          </div>

          <div className="practice-section" style={{ padding: "var(--sp-4) 0" }}>
            <div className="practice-config-card">
              <div>
                <h3 className="practice-title" style={{ fontSize: "1.15rem", fontWeight: 600 }}>Practice Parameters</h3>
                <p className="practice-subtitle">Select a subject area and adjust session properties</p>
              </div>

              {/* Select Category */}
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Main Subject Category
                </label>
                <select
                  style={{
                    background: "var(--surface-3)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    padding: "10px",
                    borderRadius: "var(--r-md)",
                    outline: "none",
                    fontSize: "0.85rem"
                  }}
                  value={quizConfigCategory}
                  onChange={(e) => {
                    setQuizConfigCategory(e.target.value);
                    setQuizConfigSubCategory("all");
                  }}
                >
                  <option value="all">All Subjects (Mixed Practice)</option>
                  {mainCategories.map((c: any, i: number) => (
                    <option key={i} value={c.main_category}>{c.main_category}</option>
                  ))}
                </select>
              </div>

              {/* Select Topic */}
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Sub-Category Topic
                </label>
                <select
                  style={{
                    background: "var(--surface-3)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    padding: "10px",
                    borderRadius: "var(--r-md)",
                    outline: "none",
                    fontSize: "0.85rem"
                  }}
                  value={quizConfigSubCategory}
                  onChange={(e) => setQuizConfigSubCategory(e.target.value)}
                >
                  <option value="all">All Sub-Categories</option>
                  {subCategoryOptions.map((s: any, i: number) => (
                    <option key={i} value={s.name}>{s.name} ({s.count} MCQs)</option>
                  ))}
                </select>
              </div>

              {/* Preset Length */}
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Number of Questions
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {[5, 10, 20, 50].map((num) => (
                    <button
                      key={num}
                      type="button"
                      style={{
                        flex: 1,
                        padding: "10px",
                        borderRadius: "var(--r-md)",
                        border: "1px solid",
                        borderColor: quizConfigNumQuestions === num ? "var(--teal)" : "var(--border-light)",
                        background: quizConfigNumQuestions === num ? "rgba(48, 197, 255, 0.08)" : "var(--surface-3)",
                        color: quizConfigNumQuestions === num ? "var(--teal)" : "var(--text-secondary)",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        transition: "all var(--dur-fast)"
                      }}
                      onClick={() => setQuizConfigNumQuestions(num)}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              <button
                className="btn-primary"
                disabled={quizIsLoading}
                onClick={handleStartQuiz}
                style={{ width: "100%", padding: "12px", marginTop: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                {quizIsLoading ? (
                  <Loader2 size={16} className="spinner" style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  "Generate Practice Exam"
                )}
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Stage 2: Active Exam Taker Session
    if (quizStep === "taker") {
      const currentMCQ = quizMCQs[quizCurrentIdx];
      if (!currentMCQ) return null;

      const isAnswered = quizSelectedAnswers[currentMCQ.id] !== undefined;
      const selectedChoice = quizSelectedAnswers[currentMCQ.id];
      const optionKeys = Object.keys(currentMCQ.options).sort();

      // Live Telemetry Calculations
      const currentCorrectCount = quizMCQs.slice(0, quizCurrentIdx + 1).reduce((acc, q) => {
        const choice = quizSelectedAnswers[q.id];
        if (choice === undefined) return acc;
        return acc + (choice === q.correct_option ? 1 : 0);
      }, 0);
      const answeredCount = Object.keys(quizSelectedAnswers).length;
      const liveAccuracy = answeredCount > 0 ? Math.round((currentCorrectCount / answeredCount) * 100) : 100;

      const handleQuitQuiz = () => {
        const confirmQuit = window.confirm(
          "Are you sure you want to quit this practice session? Your progress will not be saved."
        );
        if (confirmQuit) {
          setActiveView("dashboard");
        }
      };

      // Local option selector is removed since it's lifted to component level

      return (
        <div className="dashboard-view" role="region" aria-label="Practice Mode">
          <div className="dashboard-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="dashboard-eyebrow">
                <GraduationCap size={12} style={{ marginRight: 6 }} />
                Practice Session
              </div>
              <h1 className="dashboard-title">
                {currentMCQ.sub_category || currentMCQ.main_category || "Board Exam Practice"}
              </h1>
            </div>
            <button className="btn-workspace" style={{ borderColor: "#ef4444", color: "#ef4444" }} onClick={handleQuitQuiz}>
              Quit Session
            </button>
          </div>

          {/* Telemetry Bar */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--surface-2)",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--r-lg)",
            padding: "var(--sp-3) var(--sp-4)",
            fontSize: "0.82rem",
            color: "var(--text-secondary)",
            marginBottom: "var(--sp-4)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Clock size={14} style={{ color: "var(--teal)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                {formatTime(quizSecondsElapsed)}
              </span>
            </div>
            <div style={{ display: "flex", gap: "var(--sp-4)", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <svg width="18" height="18" viewBox="0 0 20 20" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="10" cy="10" r="8" fill="transparent" stroke="var(--border)" strokeWidth="2" />
                  <circle cx="10" cy="10" r="8" fill="transparent" stroke="var(--teal)" strokeWidth="2"
                    strokeDasharray={2 * Math.PI * 8}
                    strokeDashoffset={2 * Math.PI * 8 * (1 - (quizCurrentIdx + 1) / quizMCQs.length)}
                    style={{ transition: "stroke-dashoffset 0.3s ease" }}
                  />
                </svg>
                <span>Progress: <strong>{quizCurrentIdx + 1} / {quizMCQs.length}</strong></span>
              </div>
              <span>Accuracy: <strong style={{ color: "var(--teal)" }}>{liveAccuracy}%</strong></span>
            </div>
          </div>

          {/* Progress Bar Visual */}
          <div style={{
            width: "100%",
            height: "4px",
            background: "var(--border)",
            borderRadius: "2px",
            overflow: "hidden",
            marginBottom: "var(--sp-6)"
          }}>
            <div style={{
              width: `${((quizCurrentIdx + 1) / quizMCQs.length) * 100}%`,
              height: "100%",
              background: "var(--teal)",
              transition: "width 0.3s ease"
            }} />
          </div>

          {/* Split Layout: Question + Inline Explanation */}
          <div className={`quiz-split-layout ${explanationMCQId !== null ? "has-explanation" : ""}`}>
            {/* Question Column */}
            <div className="quiz-question-col">
              <div style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-xl)",
                padding: "var(--sp-6)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--sp-4)"
              }}>
                <p style={{
                  fontSize: "1.05rem",
                  fontWeight: 500,
                  lineHeight: 1.6,
                  color: "var(--text-primary)"
                }}>
                  {currentMCQ.question_text}
                </p>

                <div className="quiz-options-list" role="radiogroup">
                  {optionKeys.map((key) => {
                    const isCorrect = key === currentMCQ.correct_option;
                    const isSelected = key === selectedChoice;
                    let optClass = "option-button";
                    if (isAnswered) {
                      if (isCorrect) {
                        optClass += " correct";
                        if (lastSelectedChoice === key && isCorrectSelection) {
                          optClass += " pop-correct";
                        }
                      } else if (isSelected) {
                        optClass += " selected-wrong";
                        if (lastSelectedChoice === key && !isCorrectSelection) {
                          optClass += " shake-incorrect";
                        }
                      }
                    }

                    return (
                      <button
                        key={key}
                        className={optClass}
                        role="radio"
                        aria-checked={isSelected}
                        disabled={isAnswered}
                        onClick={() => handleSelectOption(key)}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textAlign: "left" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
                          <span className="option-badge">{key}</span>
                          <span style={{ lineHeight: 1.4 }}>{currentMCQ.options[key]}</span>
                        </div>
                        {isAnswered && isCorrect && (
                          <Check size={14} style={{ color: "var(--success)", flexShrink: 0, marginLeft: "8px" }} />
                        )}
                        {isAnswered && isSelected && !isCorrect && (
                          <X size={14} style={{ color: "var(--error)", flexShrink: 0, marginLeft: "8px" }} />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Action Bar */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "var(--sp-4)",
                  borderTop: "1px solid var(--border-light)",
                  paddingTop: "var(--sp-4)"
                }}>
                  <div>
                    {isAnswered && (
                      <button
                        className="btn-workspace"
                        style={{ borderColor: "var(--teal)", color: "var(--teal)", display: "flex", alignItems: "center", gap: "6px" }}
                        onClick={() => fetchExplanation(currentMCQ.id)}
                      >
                        <GraduationCap size={14} />
                        Explain Question
                      </button>
                    )}
                  </div>

                  <div>
                    {isAnswered && (
                      quizCurrentIdx < quizMCQs.length - 1 ? (
                        <button
                          className="btn-primary"
                          onClick={() => {
                            setQuizCurrentIdx((prev) => prev + 1);
                            setExplanationMCQId(null);
                            setLastSelectedChoice(null);
                            setIsCorrectSelection(null);
                          }}
                          style={{ padding: "8px 24px" }}
                        >
                          Next Question
                        </button>
                      ) : (
                        <button
                          className="btn-primary"
                          disabled={quizIsSubmitting}
                          onClick={handleSubmitQuiz}
                          style={{ padding: "8px 24px", display: "flex", alignItems: "center", gap: "6px" }}
                        >
                          {quizIsSubmitting ? (
                            <Loader2 size={14} className="spinner" style={{ animation: "spin 1s linear infinite" }} />
                          ) : (
                            "Finish Practice"
                          )}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Inline Explanation Panel (appears next to question) */}
            {renderExplanationPanel()}
          </div>
        </div>
      );
    }

    // Stage 3: Summary / Review Screen
    if (quizStep === "summary") {
      const correctCount = quizMCQs.reduce((acc, q) => {
        const choice = quizSelectedAnswers[q.id];
        return acc + (choice === q.correct_option ? 1 : 0);
      }, 0);
      const totalCount = quizMCQs.length;
      const finalAccuracy = Math.round((correctCount / totalCount) * 100);

      // Question loaded for focused review
      const reviewIdx = summaryReviewIdx !== null ? summaryReviewIdx : 0;
      const reviewMCQ = quizMCQs[reviewIdx];

      return (
        <div className="dashboard-view" role="region" aria-label="Practice Results">
          <div className="dashboard-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="dashboard-eyebrow">
                <GraduationCap size={12} style={{ marginRight: 6 }} />
                Practice Scoreboard
              </div>
              <h1 className="dashboard-title">Practice Results Summary</h1>
            </div>
            <button className="btn-workspace" onClick={() => setActiveView("dashboard")}>
              Return to Dashboard
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-6)" }}>
            {/* Telemetry Metric Cards */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "var(--sp-4)"
            }}>
              {/* Score card */}
              <div className="stat-card" style={{ textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center", padding: "var(--sp-5)" }}>
                <div className="score-badge-circle" style={{ borderColor: finalAccuracy >= 70 ? "var(--sea-green)" : "var(--teal)" }}>
                  <span style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {finalAccuracy}%
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>
                    Accuracy
                  </span>
                </div>
              </div>

              {/* Count card */}
              <div className="stat-card" style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                <span className="stat-label">Score Metrics</span>
                <span className="stat-value" style={{ fontSize: "2rem" }}>
                  {correctCount} <span style={{ fontSize: "1rem", color: "var(--text-muted)", fontWeight: 400 }}>/ {totalCount} Correct</span>
                </span>
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                  Completed in {formatTime(quizSecondsElapsed)}
                </span>
              </div>

              {/* Next Action card */}
              <div className="stat-card" style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: "var(--sp-3)" }}>
                <button className="btn-primary" onClick={() => setQuizStep("config")} style={{ width: "100%" }}>
                  Start New Session
                </button>
                <button className="btn-workspace" onClick={() => setActiveView("dashboard")} style={{ width: "100%" }}>
                  Back to Dashboard
                </button>
              </div>
            </div>

            {/* Review Grid & Focused Display split */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: "var(--sp-5)",
              marginTop: "var(--sp-2)"
            }}>
              {/* Grid Selector */}
              <div style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-lg)",
                padding: "var(--sp-5)"
              }}>
                <h3 className="practice-title" style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "var(--sp-2)" }}>
                  Clinical Review Grid
                </h3>
                <p className="practice-subtitle" style={{ marginBottom: "var(--sp-4)" }}>
                  Click a question number to review your choices and load citations
                </p>

                <div className="review-grid" role="list">
                  {quizMCQs.map((q, idx) => {
                    const ans = quizSelectedAnswers[q.id];
                    const isRight = ans === q.correct_option;
                    const isActive = idx === reviewIdx;

                    return (
                      <button
                        key={idx}
                        className={`review-circle-btn ${isRight ? "correct" : "incorrect"} ${isActive ? "active" : ""}`}
                        role="listitem"
                        onClick={() => setSummaryReviewIdx(idx)}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Focused Review Detail Card + Inline Explanation */}
              {reviewMCQ && (
                <div className={`quiz-split-layout ${explanationMCQId !== null ? "has-explanation" : ""}`}>
                  <div className="quiz-question-col">
                    <div style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--r-xl)",
                      padding: "var(--sp-6)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "var(--sp-4)"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--teal)", textTransform: "uppercase" }}>
                          Review Question {reviewIdx + 1}
                        </span>
                        <span style={{
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          color: quizSelectedAnswers[reviewMCQ.id] === reviewMCQ.correct_option ? "var(--sea-green)" : "#ef4444"
                        }}>
                          {quizSelectedAnswers[reviewMCQ.id] === reviewMCQ.correct_option ? "[Correct]" : "[Incorrect]"}
                        </span>
                      </div>

                      <p style={{ fontSize: "1rem", lineHeight: 1.6, color: "var(--text-primary)", fontWeight: 500 }}>
                        {reviewMCQ.question_text}
                      </p>

                      <div className="quiz-options-list">
                        {Object.keys(reviewMCQ.options).sort().map((key) => {
                          const isCorrect = key === reviewMCQ.correct_option;
                          const isSelected = key === quizSelectedAnswers[reviewMCQ.id];
                          let optClass = "option-button";
                          if (isCorrect) {
                            optClass += " correct";
                          } else if (isSelected) {
                            optClass += " selected-wrong";
                          }

                          return (
                            <button
                              key={key}
                              className={optClass}
                              disabled={true}
                              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textAlign: "left" }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
                                <span className="option-badge">{key}</span>
                                <span style={{ lineHeight: 1.4 }}>{reviewMCQ.options[key]}</span>
                              </div>
                              {isCorrect && (
                                <Check size={14} style={{ color: "var(--success)", flexShrink: 0, marginLeft: "8px" }} />
                              )}
                              {isSelected && !isCorrect && (
                                <X size={14} style={{ color: "var(--error)", flexShrink: 0, marginLeft: "8px" }} />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div style={{
                        display: "flex",
                        justifyContent: "flex-start",
                        borderTop: "1px solid var(--border-light)",
                        paddingTop: "var(--sp-4)",
                        marginTop: "var(--sp-2)"
                      }}>
                        <button
                          className="btn-workspace"
                          style={{ borderColor: "var(--teal)", color: "var(--teal)", display: "flex", alignItems: "center", gap: "6px" }}
                          onClick={() => fetchExplanation(reviewMCQ.id)}
                        >
                          <GraduationCap size={14} />
                          Clinical Explanation
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Inline Explanation Panel (appears next to review card) */}
                  {renderExplanationPanel()}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderMainContent = () => {
    if (activeView === "dashboard") {
      return renderDashboard();
    }
    if (activeView === "quiz") {
      return renderQuizScaffold();
    }
    if (activeView === "mcq-bank") {
      return renderMCQBank();
    }
    if (activeView === "bookmarks") {
      return renderBookmarks();
    }
    if (activeView === "stats") {
      return renderStats();
    }
    
    // Default RAG Q&A Chat
    return (
      <div className="chat-view-container">
        {/* Chat Mini-Sidebar (Left) */}
        <div 
          className={`chat-history-sidebar ${(isSidebarHovered || isSidebarResizing) ? "expanded" : "collapsed"} ${isSidebarResizing ? "resizing" : ""}`}
          style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
          onMouseEnter={() => setIsSidebarHovered(true)}
          onMouseLeave={() => setIsSidebarHovered(false)}
        >
          {/* Collapsed view handle (visual affordance) */}
          <div className="chat-sidebar-collapsed-handle" aria-hidden="true">
            <div className="chat-sidebar-collapsed-button">
              <ChevronRight size={14} className="expand-arrow-icon" />
            </div>
          </div>

          {/* Expanded view content */}
          <div className="chat-sidebar-expanded-content">
            <button className="new-chat-btn" onClick={handleNewChat}>
              <Plus size={14} />
              New Chat
            </button>
            
            <div className="chat-history-list">
              {isLoadingConversations ? (
                <div className="chat-history-loading">Loading chats...</div>
              ) : conversations.length === 0 ? (
                <div className="chat-history-empty" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", padding: "32px 16px", color: "var(--text-muted)", fontSize: "0.8rem", textAlign: "center" }}>
                  <MessageSquare size={20} style={{ opacity: 0.3 }} />
                  <span>No recent discussions</span>
                </div>
              ) : (
                (() => {
                  const grouped = groupConversations(conversations);
                  const renderGroupSection = (title: string, list: any[]) => {
                    if (list.length === 0) return null;
                    return (
                      <div className="chat-history-group" key={title} style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "12px" }}>
                        <div className="chat-history-group-title" style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", padding: "4px var(--sp-3)", fontWeight: 600 }}>
                          {title}
                        </div>
                        {list.map((conv) => (
                          <div 
                            key={conv.id} 
                            className={`chat-history-item ${activeConversationId === conv.id ? "active" : ""}`}
                            onClick={() => handleSelectConversation(conv.id)}
                          >
                            <MessageSquare size={13} className="chat-icon" />
                            <span className="chat-title" title={conv.title}>{conv.title}</span>
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
                    renderGroupSection("Older", grouped.older)
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
        <div className="chat-active-panel">
          {/* Conversation area */}
          <div
            className="conversation"
            role="log"
            aria-label="Conversation"
            aria-live="polite"
          >
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
                  Ask any medical question and receive a grounded, evidence-based answer
                  drawn strictly from textbooks — with inline citations and diagrams.
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
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--sp-6)",
                  maxWidth: "800px",
                  margin: "0 auto",
                  width: "100%",
                }}
              >
                {messages.map((msg) =>
                  msg.type === "user" ? (
                    <div key={msg.id} className="user-message">
                      <div className="user-bubble">
                        <div>{msg.content}</div>
                        {msg.timestamp && (
                          <div style={{ fontSize: "0.68rem", opacity: 0.7, marginTop: "4px", textAlign: "right", fontFamily: "var(--font-mono)" }}>
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
                      onFigureClick={setLightboxFig}
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
            <div className="input-inner">
              {isAdmin && (
                <button
                  className="chat-attach-btn"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading || isSearching}
                  title="Upload PDF Textbook"
                  aria-label="Upload PDF textbook"
                >
                  {uploading ? (
                    <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  ) : (
                    <Upload size={16} />
                  )}
                </button>
              )}
              <textarea
                ref={inputRef}
                className="input-box"
                placeholder={
                  isSearching
                    ? "Consulting reference library…"
                    : "Ask a clinical question based on textbooks…"
                }
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  // Auto-resize
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                }}
                onKeyDown={handleKeyDown}
                disabled={isSearching}
                rows={1}
                aria-label="Ask a medical question"
                aria-multiline
              />
              <button
                className="send-btn"
                onClick={() => sendQuery(inputValue)}
                disabled={isSearching || !inputValue.trim()}
                aria-label="Send question"
              >
                {isSearching ? (
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
            <p className="input-hint">
              Answers are grounded strictly in uploaded textbooks · Press Enter to send
            </p>
          </div>
        </div>
      </div>
    );
  };

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
        <div 
          className="mobile-sidebar-backdrop" 
          onClick={() => setMobileMenuOpen(false)} 
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={`sidebar ${mobileMenuOpen ? "mobile-open" : ""}`} aria-label="Navigation & Library">
        {/* Brand */}
        <div 
          className="sidebar-brand" 
          style={{ cursor: "pointer" }} 
          onClick={() => {
            setActiveView("dashboard");
            setMobileMenuOpen(false);
          }}
        >
          <div className="brand-mark" aria-hidden>
            <Stethoscope size={18} />
          </div>
          <span className="brand-name">
            med<span>NAMA</span>
          </span>
        </div>

        {/* Profile */}
        <div className="sidebar-profile">
          <div className="avatar" aria-hidden>{initials}</div>
          <div className="profile-meta">
            <div className="profile-name">{username}</div>
            <div className={`profile-badge ${role === "student" ? "role-student" : ""}`}>
              {role}
            </div>
          </div>
          <button className="btn-logout" onClick={handleLogout} aria-label="Sign out">
            <LogOut size={12} style={{ display: "inline", marginRight: 4 }} />
            Sign out
          </button>
        </div>

        {/* Workspace Navigation Links */}
        <div style={{ padding: "var(--sp-2) var(--sp-3)", display: "flex", flexDirection: "column", gap: "2px", borderBottom: "1px solid var(--border)" }}>
          <button 
            className={`btn-workspace-nav ${activeView === "dashboard" ? "active" : ""}`}
            onClick={() => {
              setActiveView("dashboard");
              setMobileMenuOpen(false);
            }}
          >
            <LayoutDashboard size={14} />
            Dashboard
          </button>
          <button 
            className={`btn-workspace-nav ${activeView === "chat" ? "active" : ""}`}
            onClick={() => {
              setActiveView("chat");
              setMobileMenuOpen(false);
            }}
          >
            <Stethoscope size={14} style={{ color: "var(--sky)" }} />
            Discuss with Dr MedNama
          </button>
          <button 
            className={`btn-workspace-nav ${activeView === "mcq-bank" ? "active" : ""}`}
            onClick={() => {
              setActiveView("mcq-bank");
              setMobileMenuOpen(false);
              fetchMcqs(mcqFilterCategory, mcqSearchText);
            }}
          >
            <BookMarked size={14} />
            MCQ Bank
          </button>
          <button 
            className={`btn-workspace-nav ${activeView === "bookmarks" ? "active" : ""}`}
            onClick={() => {
              setActiveView("bookmarks");
              setMobileMenuOpen(false);
              fetchBookmarks();
            }}
          >
            <Bookmark size={14} />
            Bookmarks
          </button>
          <button 
            className={`btn-workspace-nav ${activeView === "quiz" ? "active" : ""}`}
            onClick={() => {
              setSelectedTopic(null);
              setActiveView("quiz");
              setMobileMenuOpen(false);
            }}
          >
            <GraduationCap size={14} />
            Mock Builder
          </button>
          <button 
            className={`btn-workspace-nav ${activeView === "stats" ? "active" : ""}`}
            onClick={() => {
              setActiveView("stats");
              setMobileMenuOpen(false);
              fetchDetailedStats();
            }}
          >
            <TrendingUp size={14} />
            Stats
          </button>
        </div>

        {/* Library */}
        <div className="sidebar-section-label" aria-label="Library section">
          Reference Library
        </div>
        <div className="book-list" role="list" aria-label="Uploaded textbooks">
          {isLoadingBooks ? (
            <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--text-muted)" }}>
              <Loader2 size={20} style={{ margin: "0 auto 8px", display: "block", animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: "0.75rem" }}>Loading library…</span>
            </div>
          ) : books.length === 0 ? (
            <div className="books-empty">
              <BookOpen size={32} />
              <p>
                {isAdmin
                  ? "Upload your first PDF textbook below."
                  : "No textbooks available. Ask your administrator to add books."}
              </p>
            </div>
          ) : (
            books.map((b) => (
              <BookItem
                key={b.id}
                book={b}
                isAdmin={isAdmin}
                onDelete={handleDeleteBook}
              />
            ))
          )}
        </div>

        {/* Upload — admin only */}
        {isAdmin && (
          <div className="sidebar-upload">
            <input
              type="file"
              accept=".pdf"
              style={{ display: "none" }}
              ref={fileRef}
              onChange={handleFileUpload}
              aria-hidden
            />
            <button
              className="upload-btn"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label="Upload PDF textbook"
            >
              {uploading ? (
                <>
                  <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
                  Ingesting…
                </>
              ) : (
                <>
                  <Upload size={15} />
                  Upload Textbook
                </>
              )}
            </button>
            {uploadError && <div className="upload-error" role="alert">{uploadError}</div>}
          </div>
        )}

        {/* Sidebar Theme Switcher Footer */}
        <div style={{
          padding: "var(--sp-3) var(--sp-4)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "8px",
          background: "var(--surface-1)",
          flexShrink: 0
        }}>
          <button 
            className="btn-workspace"
            style={{ 
              flex: 1, 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              gap: "8px", 
              padding: "8px 12px", 
              fontSize: "0.78rem" 
            }}
            onClick={() => {
              const themes: Array<"dark" | "light" | "balanced" | "warm"> = ["dark", "light", "balanced", "warm"];
              const nextIdx = (themes.indexOf(theme) + 1) % themes.length;
              setTheme(themes[nextIdx]);
            }}
            aria-label="Cycle theme mode"
          >
            {theme === "dark" && <Moon size={13} style={{ color: "var(--teal)" }} />}
            {theme === "light" && <Sun size={13} style={{ color: "var(--teal)" }} />}
            {theme === "balanced" && <Compass size={13} style={{ color: "var(--teal)" }} />}
            {theme === "warm" && <Sunset size={13} style={{ color: "var(--teal)" }} />}
            <span style={{ textTransform: "capitalize", fontWeight: 500 }}>{theme} Mode</span>
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="main" aria-label="Medical knowledge assistant">
        {renderMainContent()}
      </main>

      {/* ── Figure lightbox ── */}
      {lightboxFig && (
        <div
          className="modal-backdrop"
          onClick={() => setLightboxFig(null)}
          role="dialog"
          aria-modal
          aria-label={`Figure: ${lightboxFig.figure_label}`}
        >
          <div
            className="modal-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <span className="modal-title">
                {lightboxFig.figure_label}
                {lightboxFig.page_number && (
                  <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
                    · p. {lightboxFig.page_number}
                  </span>
                )}
              </span>
              <button
                className="modal-close-btn"
                onClick={() => setLightboxFig(null)}
                aria-label="Close figure"
              >
                <X size={14} />
              </button>
            </div>
            <div className="modal-img-area">
              <img
                src={`${API}/api/figures/${lightboxFig.id}?token=${token ?? ""}`}
                alt={lightboxFig.figure_label}
              />
            </div>
            {(lightboxFig.caption || lightboxFig.reason_to_include) && (
              <div className="modal-caption-area">
                {lightboxFig.caption || lightboxFig.reason_to_include}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
