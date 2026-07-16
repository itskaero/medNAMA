"use client";

import React from "react";
import {
  GraduationCap,
  Clock,
  Loader2,
  Check,
  X,
  Bookmark,
} from "lucide-react";
import { AnswerResponse, Figure } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import ExplanationPanel from "@/components/ExplanationPanel";

interface QuizViewProps {
  // quiz flow
  quizStep: "config" | "taker" | "summary";
  setQuizStep: (s: "config" | "taker" | "summary") => void;
  quizMCQs: any[];
  quizCurrentIdx: number;
  setQuizCurrentIdx: (idx: number | ((prev: number) => number)) => void;
  quizSelectedAnswers: { [key: number]: string };
  quizAttemptId: number | null;
  quizIsLoading: boolean;
  quizIsSubmitting: boolean;
  // config
  quizConfigCategories: string[];
  setQuizConfigCategories: React.Dispatch<React.SetStateAction<string[]>>;
  quizConfigSubCategories: string[];
  setQuizConfigSubCategories: React.Dispatch<React.SetStateAction<string[]>>;
  quizConfigNumQuestions: number;
  setQuizConfigNumQuestions: (n: number) => void;
  quizConfigTimerMode: "none" | "session" | "per_question";
  setQuizConfigTimerMode: (m: "none" | "session" | "per_question") => void;
  quizConfigTimerValue: number;
  setQuizConfigTimerValue: (n: number) => void;
  quizConfigExcludeMastered: boolean;
  setQuizConfigExcludeMastered: (v: boolean) => void;
  quizConfigFeedbackMode: "tutor" | "board";
  setQuizConfigFeedbackMode: (m: "tutor" | "board") => void;
  quizConfigStep: 1 | 2 | 3;
  setQuizConfigStep: (s: 1 | 2 | 3) => void;
  quizTimerCountdown: number;
  setQuizTimerCountdown: (n: number) => void;
  // timer / summary
  summaryReviewIdx: number | null;
  setSummaryReviewIdx: (idx: number | null) => void;
  quizSecondsElapsed: number;
  quizTimerActive: boolean;
  // ux animation
  lastSelectedChoice: string | null;
  setLastSelectedChoice: (v: string | null) => void;
  isCorrectSelection: boolean | null;
  setIsCorrectSelection: (v: boolean | null) => void;
  // explanation
  explanationMCQId: number | null;
  setExplanationMCQId: (id: number | null) => void;
  explanationData: AnswerResponse | null;
  explanationLoading: boolean;
  explanationError: string | null;
  // handlers
  handleStartQuiz: () => void;
  handleSubmitQuiz: () => void;
  handleSelectOption: (key: string) => void;
  fetchExplanation: (mcqId: number) => void;
  formatTime: (totalSec: number) => string;
  // other
  stats: any;
  bookmarkedMcqs: any[];
  token: string | null;
  toggleBookmarkMCQ: (mcqId: number) => void;
  setActiveView: (view: any) => void;
  onFigureClick: (fig: Figure) => void;
}

export default function QuizView({
  quizStep,
  setQuizStep,
  quizMCQs,
  quizCurrentIdx,
  setQuizCurrentIdx,
  quizSelectedAnswers,
  quizIsLoading,
  quizIsSubmitting,
  quizConfigCategories,
  setQuizConfigCategories,
  quizConfigSubCategories,
  setQuizConfigSubCategories,
  quizConfigNumQuestions,
  setQuizConfigNumQuestions,
  quizConfigTimerMode,
  setQuizConfigTimerMode,
  quizConfigTimerValue,
  setQuizConfigTimerValue,
  quizConfigExcludeMastered,
  setQuizConfigExcludeMastered,
  quizConfigFeedbackMode,
  setQuizConfigFeedbackMode,
  quizConfigStep,
  setQuizConfigStep,
  quizTimerCountdown,
  setQuizTimerCountdown,
  summaryReviewIdx,
  setSummaryReviewIdx,
  quizSecondsElapsed,
  lastSelectedChoice,
  setLastSelectedChoice,
  isCorrectSelection,
  setIsCorrectSelection,
  explanationMCQId,
  setExplanationMCQId,
  explanationData,
  explanationLoading,
  explanationError,
  handleStartQuiz,
  handleSubmitQuiz,
  handleSelectOption,
  fetchExplanation,
  formatTime,
  stats,
  bookmarkedMcqs,
  token,
  toggleBookmarkMCQ,
  setActiveView,
  onFigureClick,
}: QuizViewProps) {
  // ─── Stage 1: Configure ───────────────────────────────────────────────────
  if (quizStep === "config") {
    const mainCategories = stats?.categories || [];

    const toggleCategory = (catName: string) => {
      setQuizConfigCategories((prev) => {
        const isSelected = prev.includes(catName);
        let newCats = [];
        if (isSelected) {
          newCats = prev.filter((c) => c !== catName);
        } else {
          newCats = [...prev, catName];
        }
        const targetCatObj = mainCategories.find((c: any) => c.main_category === catName);
        if (targetCatObj) {
          const subNames = targetCatObj.sub_categories.map((s: any) => s.name);
          setQuizConfigSubCategories((subPrev) => {
            if (isSelected) {
              return subPrev.filter((s) => !subNames.includes(s));
            } else {
              return Array.from(new Set([...subPrev, ...subNames]));
            }
          });
        }
        return newCats;
      });
    };

    const subCategoryOptions = mainCategories.reduce((acc: any[], cat: any) => {
      if (quizConfigCategories.length === 0 || quizConfigCategories.includes(cat.main_category)) {
        cat.sub_categories.forEach((sub: any) => {
          if (!acc.some((s: any) => s.name === sub.name)) {
            acc.push({ ...sub, main_category: cat.main_category });
          }
        });
      }
      return acc;
    }, []);

    const toggleSubCategory = (subName: string) => {
      setQuizConfigSubCategories((prev) => {
        const isSelected = prev.includes(subName);
        let newSubs = [];
        if (isSelected) {
          newSubs = prev.filter((s) => s !== subName);
        } else {
          newSubs = [...prev, subName];
        }
        const targetSub = subCategoryOptions.find((s: any) => s.name === subName);
        if (targetSub && !isSelected) {
          setQuizConfigCategories((catPrev) => {
            if (!catPrev.includes(targetSub.main_category)) {
              return [...catPrev, targetSub.main_category];
            }
            return catPrev;
          });
        }
        return newSubs;
      });
    };

    const totalSystemMCQs = mainCategories.reduce(
      (sum: number, c: any) =>
        sum + c.sub_categories.reduce((s: number, sub: any) => s + sub.count, 0),
      0
    );

    let activeSubMCQs = 0;
    if (quizConfigSubCategories.length > 0) {
      activeSubMCQs = subCategoryOptions
        .filter((s: any) => quizConfigSubCategories.includes(s.name))
        .reduce((sum: number, s: any) => sum + s.count, 0);
    } else {
      if (quizConfigCategories.length > 0) {
        activeSubMCQs = mainCategories
          .filter((c: any) => quizConfigCategories.includes(c.main_category))
          .reduce(
            (sum: number, c: any) =>
              sum + c.sub_categories.reduce((s: number, sub: any) => s + sub.count, 0),
            0
          );
      } else {
        activeSubMCQs = totalSystemMCQs;
      }
    }

    const coveragePercent = totalSystemMCQs > 0 ? Math.round((activeSubMCQs / totalSystemMCQs) * 100) : 0;
    const strokeDashoffset = 314.16 - (coveragePercent / 100) * 314.16;

    const handleNextStep = () => {
      if (quizConfigStep === 1) {
        const activeSubCount =
          quizConfigSubCategories.length > 0
            ? quizConfigSubCategories.length
            : quizConfigCategories.length > 0
            ? subCategoryOptions.length
            : totalSystemMCQs;
        if (activeSubCount === 0) {
          alert("Please select at least one category or subtopic to proceed.");
          return;
        }
        setQuizConfigStep(2);
      } else if (quizConfigStep === 2) {
        setQuizConfigStep(3);
      }
    };

    const handlePrevStep = () => {
      if (quizConfigStep === 2) {
        setQuizConfigStep(1);
      } else if (quizConfigStep === 3) {
        setQuizConfigStep(2);
      }
    };

    return (
      <div className="dashboard-view" role="region" aria-label="Practice Settings">
        <div
          className="dashboard-header"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
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

        {/* Horizontal Stepper Indicator */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "var(--sp-4)",
            margin: "var(--sp-4) 0 var(--sp-6)",
            padding: "var(--sp-3) var(--sp-4)",
            background: "var(--surface-2)",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--r-xl)",
          }}
        >
          {[1, 2, 3].map((step, i) => (
            <React.Fragment key={step}>
              {i > 0 && <div style={{ width: "40px", height: "1px", background: "var(--border-light)" }} />}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    background: quizConfigStep === step ? "var(--sky)" : "var(--surface-3)",
                    color: quizConfigStep === step ? "#000" : "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 600,
                    fontSize: "0.75rem",
                  }}
                >
                  {quizConfigStep > step ? "✓" : step}
                </span>
                <span
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: quizConfigStep === step ? 600 : 500,
                    color: quizConfigStep === step ? "var(--text-primary)" : "var(--text-muted)",
                  }}
                >
                  {["Topics", "Rules", "Review"][i]}
                </span>
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Topics */}
        {quizConfigStep === 1 && (
          <div key="step-1" className="step-transition-wrapper quiz-config-form-col">
            <div>
              <h3 className="practice-title" style={{ fontSize: "1.15rem", fontWeight: 600 }}>
                Select Practice Topics
              </h3>
              <p className="practice-subtitle" style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>
                Choose main subject categories and subtopics to customize your question mix.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
              <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Main Categories
              </label>
              <div className="config-category-grid" role="group">
                <button
                  type="button"
                  className={`config-category-card ${quizConfigCategories.length === 0 ? "active" : ""}`}
                  onClick={() => { setQuizConfigCategories([]); setQuizConfigSubCategories([]); }}
                >
                  <span className="config-category-title">Mixed Practice (All)</span>
                  <span className="config-category-subtitle">Select all ingested subjects</span>
                </button>
                {mainCategories.map((c: any, i: number) => {
                  const count = c.sub_categories.reduce((sum: number, s: any) => sum + s.count, 0);
                  const isSelected = quizConfigCategories.includes(c.main_category);
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`config-category-card ${isSelected ? "active" : ""}`}
                      onClick={() => toggleCategory(c.main_category)}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                        <span className="config-category-title" title={c.main_category}>{c.main_category}</span>
                        <Checkbox checked={isSelected} readOnly />
                      </div>
                      <span className="config-category-subtitle">{c.sub_categories.length} subtopics · {count} MCQs</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
              <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Sub-Category Topics
              </label>
              <div className="config-sub-pills-list">
                <button
                  type="button"
                  className={`config-sub-pill ${quizConfigSubCategories.length === 0 ? "active" : ""}`}
                  onClick={() => setQuizConfigSubCategories([])}
                >
                  All Subtopics
                </button>
                {subCategoryOptions.map((s: any, i: number) => {
                  const isSelected = quizConfigSubCategories.includes(s.name);
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`config-sub-pill ${isSelected ? "active" : ""}`}
                      onClick={() => toggleSubCategory(s.name)}
                    >
                      {isSelected ? "✓ " : ""}{s.name} ({s.count})
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "var(--sp-4)" }}>
              <button className="btn-primary" onClick={handleNextStep} style={{ padding: "8px 24px" }}>
                Configure Session Rules →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Rules */}
        {quizConfigStep === 2 && (
          <div key="step-2" className="step-transition-wrapper quiz-config-form-col">
            <div>
              <h3 className="practice-title" style={{ fontSize: "1.15rem", fontWeight: 600 }}>Set Practice Rules</h3>
              <p className="practice-subtitle" style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>
                Customize count, timer countdowns, feedback style, and content filtering.
              </p>
            </div>

            {/* Question count */}
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
              <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Number of Questions
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "4px" }}>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  {[5, 10, 20, 50].map((num) => (
                    <button
                      key={num}
                      type="button"
                      style={{
                        flex: 1, padding: "10px", borderRadius: "var(--r-md)", border: "1px solid",
                        borderColor: quizConfigNumQuestions === num ? "var(--teal)" : "var(--border-light)",
                        background: quizConfigNumQuestions === num ? "rgba(48, 197, 255, 0.08)" : "var(--surface-3)",
                        color: quizConfigNumQuestions === num ? "var(--teal)" : "var(--text-secondary)",
                        cursor: "pointer", fontWeight: 600, fontSize: "0.85rem", transition: "all var(--dur-fast)"
                      }}
                      onClick={() => setQuizConfigNumQuestions(Math.min(num, activeSubMCQs || 10))}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "var(--surface-3)", padding: "16px", borderRadius: "var(--r-md)", border: "1px solid var(--border-light)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    <span>Selected Count: <strong style={{ color: "var(--sky)", fontSize: "0.9rem" }}>{quizConfigNumQuestions}</strong></span>
                    <span>Max Pool: <strong>{activeSubMCQs}</strong></span>
                  </div>
                  <Slider
                    min={1}
                    max={activeSubMCQs || 10}
                    value={[quizConfigNumQuestions]}
                    onValueChange={(val) => {
                      if (Array.isArray(val)) setQuizConfigNumQuestions(val[0]);
                      else if (typeof val === "number") setQuizConfigNumQuestions(val);
                    }}
                    style={{ marginTop: "6px" }}
                  />
                </div>
              </div>
            </div>

            {/* Timer */}
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
              <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Timer Mode
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                {[{ mode: "none", label: "No Timer" }, { mode: "session", label: "Session Limit" }, { mode: "per_question", label: "Per-Question Limit" }].map((t) => (
                  <button
                    key={t.mode}
                    type="button"
                    style={{
                      flex: 1, padding: "10px", borderRadius: "var(--r-md)", border: "1px solid",
                      borderColor: quizConfigTimerMode === t.mode ? "var(--sky)" : "var(--border-light)",
                      background: quizConfigTimerMode === t.mode ? "rgba(48, 197, 255, 0.08)" : "var(--surface-3)",
                      color: quizConfigTimerMode === t.mode ? "var(--sky)" : "var(--text-secondary)",
                      cursor: "pointer", fontWeight: 600, fontSize: "0.8rem", transition: "all var(--dur-fast)"
                    }}
                    onClick={() => { setQuizConfigTimerMode(t.mode as any); setQuizConfigTimerValue(t.mode === "session" ? 30 : 60); }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {quizConfigTimerMode === "session" && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Session duration (minutes):</span>
                  <input type="number" min={1} value={quizConfigTimerValue} onChange={(e) => setQuizConfigTimerValue(parseInt(e.target.value) || 30)}
                    style={{ width: "80px", background: "var(--surface-3)", border: "1px solid var(--border)", color: "var(--text-primary)", padding: "8px 12px", borderRadius: "var(--r-md)", fontSize: "0.85rem", outline: "none" }} />
                </div>
              )}
              {quizConfigTimerMode === "per_question" && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Seconds per question:</span>
                  <input type="number" min={5} value={quizConfigTimerValue} onChange={(e) => setQuizConfigTimerValue(parseInt(e.target.value) || 60)}
                    style={{ width: "80px", background: "var(--surface-3)", border: "1px solid var(--border)", color: "var(--text-primary)", padding: "8px 12px", borderRadius: "var(--r-md)", fontSize: "0.85rem", outline: "none" }} />
                </div>
              )}
            </div>

            {/* Feedback Mode */}
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
              <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Feedback Style
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                {[{ mode: "tutor", label: "Tutor Mode (Instant Explanations)" }, { mode: "board", label: "Board Exam Mode (No Explanations until end)" }].map((f) => (
                  <button
                    key={f.mode}
                    type="button"
                    style={{
                      flex: 1, padding: "10px", borderRadius: "var(--r-md)", border: "1px solid",
                      borderColor: quizConfigFeedbackMode === f.mode ? "var(--sky)" : "var(--border-light)",
                      background: quizConfigFeedbackMode === f.mode ? "rgba(48, 197, 255, 0.08)" : "var(--surface-3)",
                      color: quizConfigFeedbackMode === f.mode ? "var(--sky)" : "var(--text-secondary)",
                      cursor: "pointer", fontWeight: 600, fontSize: "0.8rem", transition: "all var(--dur-fast)"
                    }}
                    onClick={() => setQuizConfigFeedbackMode(f.mode as any)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Skip Mastered */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px", background: "var(--surface-3)", borderRadius: "var(--r-md)", border: "1px solid var(--border-light)" }}>
              <label htmlFor="excludeMastered" style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--text-secondary)", cursor: "pointer", flex: 1 }}>
                Skip questions I've already answered correctly in past sessions
              </label>
              <Switch id="excludeMastered" checked={quizConfigExcludeMastered} onCheckedChange={setQuizConfigExcludeMastered} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--sp-4)" }}>
              <button className="btn-workspace" onClick={handlePrevStep}>← Back to Topics</button>
              <button className="btn-primary" onClick={handleNextStep} style={{ padding: "8px 24px" }}>Review Configuration →</button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Launch */}
        {quizConfigStep === 3 && (
          <div key="step-3" className="step-transition-wrapper quiz-config-split-layout">
            <div className="quiz-config-form-col">
              <div>
                <h3 className="practice-title" style={{ fontSize: "1.15rem", fontWeight: 600 }}>Confirm Practice Exam</h3>
                <p className="practice-subtitle" style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>
                  Review your setup parameters before initiating the session.
                </p>
              </div>

              <div className="diagnostics-details" style={{ borderTop: "none", paddingTop: 0 }}>
                {[
                  ["Active Subjects", quizConfigCategories.length === 0 ? "Mixed Practice (All)" : quizConfigCategories.join(", ")],
                  ["Subtopics Checked", quizConfigSubCategories.length === 0 ? "All Available Topics" : `${quizConfigSubCategories.length} Topics`],
                  ["Question Count", `${quizConfigNumQuestions} questions`],
                  ["Timer Mode", quizConfigTimerMode === "none" ? "Un-timed (Stopwatch)" : quizConfigTimerMode === "session" ? `Session Countdown (${quizConfigTimerValue}m)` : `Per-Question Limit (${quizConfigTimerValue}s)`],
                  ["Feedback Style", quizConfigFeedbackMode === "tutor" ? "Tutor Mode (Instant Explanations)" : "Board Exam Mode (Delayed Feedback)"],
                  ["Skip Mastered Qs", quizConfigExcludeMastered ? "Enabled" : "Disabled"],
                ].map(([label, value]) => (
                  <div key={label} className="diagnostics-detail-row" style={{ padding: "10px 0", borderBottom: "1px solid var(--border-light)" }}>
                    <span className="diagnostics-detail-label">{label}</span>
                    <span className="diagnostics-detail-value" style={{ textAlign: "right", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--sp-4)" }}>
                <button className="btn-workspace" onClick={() => setQuizConfigStep(2)}>← Back to Rules</button>
                <button className="btn-primary" disabled={quizIsLoading} onClick={handleStartQuiz} style={{ padding: "10px 32px", display: "flex", alignItems: "center", gap: "8px" }}>
                  {quizIsLoading ? <Loader2 size={16} className="spinner" style={{ animation: "spin 1s linear infinite" }} /> : "Start Practice Exam"}
                </button>
              </div>
            </div>

            {/* Diagnostics */}
            <div className="config-diagnostics-col">
              <div className="config-diagnostics-card">
                <div style={{ textAlign: "center" }}>
                  <h4 style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>Clinical Ingestion Status</h4>
                  <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "2px" }}>Diagnostics for selected config</p>
                </div>
                <div className="diagnostics-gauge-container">
                  <svg className="diagnostics-gauge-svg" width="120" height="120" viewBox="0 0 120 120">
                    <circle className="diagnostics-gauge-bg" cx="60" cy="60" r="50" />
                    <circle className="diagnostics-gauge-fill" cx="60" cy="60" r="50" strokeDasharray="314.16" strokeDashoffset={strokeDashoffset} />
                  </svg>
                  <div className="diagnostics-gauge-text">
                    <span className="diagnostics-gauge-val">{coveragePercent}%</span>
                    <span className="diagnostics-gauge-lbl">Coverage</span>
                  </div>
                </div>
                <div className="diagnostics-details">
                  {[
                    ["Config Scope", quizConfigCategories.length === 0 ? "Full Library" : "Category"],
                    ["Subtopics Active", `${subCategoryOptions.length > 0 ? (quizConfigSubCategories.length === 0 ? subCategoryOptions.length : quizConfigSubCategories.length) : 0} Topics`],
                    ["Pool Question Count", `${activeSubMCQs} MCQs`],
                    ["Est. Session Duration", `${Math.round(quizConfigNumQuestions * 1.5)} mins`],
                  ].map(([label, value]) => (
                    <div key={label} className="diagnostics-detail-row">
                      <span className="diagnostics-detail-label">{label}</span>
                      <span className="diagnostics-detail-value" style={{ textTransform: "capitalize" }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Stage 2: Active Taker ────────────────────────────────────────────────
  if (quizStep === "taker") {
    const currentMCQ = quizMCQs[quizCurrentIdx];
    if (!currentMCQ) return null;

    const isAnswered = quizSelectedAnswers[currentMCQ.id] !== undefined;
    const selectedChoice = quizSelectedAnswers[currentMCQ.id];
    const optionKeys = Object.keys(currentMCQ.options).sort();

    const currentCorrectCount = quizMCQs.slice(0, quizCurrentIdx + 1).reduce((acc, q) => {
      const choice = quizSelectedAnswers[q.id];
      if (choice === undefined) return acc;
      return acc + (choice === q.correct_option ? 1 : 0);
    }, 0);
    const answeredCount = Object.keys(quizSelectedAnswers).length;
    const liveAccuracy = answeredCount > 0 ? Math.round((currentCorrectCount / answeredCount) * 100) : 100;

    const handleQuitQuiz = () => {
      const confirmQuit = window.confirm("Are you sure you want to quit this practice session? Your progress will not be saved.");
      if (confirmQuit) setActiveView("dashboard");
    };

    return (
      <div className="dashboard-view" role="region" aria-label="Practice Mode">
        <div className="dashboard-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="dashboard-eyebrow">
              <GraduationCap size={12} style={{ marginRight: 6 }} />
              Practice Session
            </div>
            <h1 className="dashboard-title">{currentMCQ.sub_category || currentMCQ.main_category || "Board Exam Practice"}</h1>
          </div>
          <button className="btn-workspace" style={{ borderColor: "#ef4444", color: "#ef4444" }} onClick={handleQuitQuiz}>
            Quit Session
          </button>
        </div>

        {/* Telemetry Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface-2)", border: "1px solid var(--border-light)", borderRadius: "var(--r-lg)", padding: "var(--sp-3) var(--sp-4)", fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "var(--sp-4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {quizConfigTimerMode === "none" ? (
              <><Clock size={14} style={{ color: "var(--teal)" }} /><span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{formatTime(quizSecondsElapsed)}</span></>
            ) : quizConfigTimerMode === "session" ? (
              <><Clock size={14} style={{ color: "var(--sky)" }} /><span style={{ fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--sky)" }}>Time Remaining: {formatTime(quizTimerCountdown)}</span></>
            ) : (
              <><Clock size={14} style={{ color: "var(--teal)" }} /><span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>Question Timer: {quizTimerCountdown}s</span></>
            )}
          </div>
          <div style={{ display: "flex", gap: "var(--sp-4)", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <svg width="18" height="18" viewBox="0 0 20 20" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="10" cy="10" r="8" fill="transparent" stroke="var(--border)" strokeWidth="2" />
                <circle cx="10" cy="10" r="8" fill="transparent" stroke="var(--teal)" strokeWidth="2"
                  strokeDasharray={2 * Math.PI * 8}
                  strokeDashoffset={2 * Math.PI * 8 * (1 - (quizCurrentIdx + 1) / quizMCQs.length)}
                  style={{ transition: "stroke-dashoffset 0.3s ease" }} />
              </svg>
              <span>Progress: <strong>{quizCurrentIdx + 1} / {quizMCQs.length}</strong></span>
            </div>
            {quizConfigFeedbackMode !== "board" && (
              <span>Accuracy: <strong style={{ color: "var(--teal)" }}>{liveAccuracy}%</strong></span>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ width: "100%", height: "4px", background: "var(--border)", borderRadius: "2px", overflow: "hidden", marginBottom: "var(--sp-6)" }}>
          <div style={{ width: `${((quizCurrentIdx + 1) / quizMCQs.length) * 100}%`, height: "100%", background: "var(--teal)", transition: "width 0.4s var(--ease-out-expo)" }} />
        </div>

        {/* Split Layout */}
        <div className={`quiz-split-layout ${explanationMCQId !== null ? "has-explanation" : ""}`}>
          <div className="quiz-question-col">
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "var(--sp-6)", display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-light)", paddingBottom: "12px" }}>
                <span style={{ fontSize: "0.72rem", color: "var(--sky)", background: "var(--sky-dim)", padding: "2px 8px", borderRadius: "10px", fontWeight: 600 }}>
                  {currentMCQ.sub_category || currentMCQ.main_category || "Board MCQ"}
                </span>
                <button type="button" className="chat-delete-btn"
                  style={{ position: "static", opacity: 1, color: bookmarkedMcqs.some(b => b.id === currentMCQ.id) ? "var(--teal)" : "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
                  onClick={() => toggleBookmarkMCQ(currentMCQ.id)} title="Bookmark Question">
                  <Bookmark size={14} fill={bookmarkedMcqs.some(b => b.id === currentMCQ.id) ? "currentColor" : "none"} />
                </button>
              </div>

              <p style={{ fontSize: "1.05rem", fontWeight: 500, lineHeight: 1.6, color: "var(--text-primary)" }}>
                {currentMCQ.question_text}
              </p>

              <div className="quiz-options-list" role="radiogroup">
                {optionKeys.map((key, index) => {
                  const isCorrect = key === currentMCQ.correct_option;
                  const isSelected = key === selectedChoice;
                  let optClass = "option-button option-cascade-item";
                  if (isAnswered) {
                    if (quizConfigFeedbackMode === "board") {
                      if (isSelected) optClass += " selected-board-mode";
                    } else {
                      if (isCorrect) {
                        optClass += " correct";
                        if (lastSelectedChoice === key && isCorrectSelection) optClass += " pop-correct";
                      } else if (isSelected) {
                        optClass += " selected-wrong";
                        if (lastSelectedChoice === key && !isCorrectSelection) optClass += " shake-incorrect";
                      }
                    }
                  }
                  return (
                    <button key={`${quizCurrentIdx}-${key}`} className={optClass} role="radio" aria-checked={isSelected} disabled={isAnswered}
                      onClick={() => handleSelectOption(key)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textAlign: "left", animationDelay: `${index * 50}ms` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
                        <span className="option-badge">{key}</span>
                        <span style={{ lineHeight: 1.4 }}>{currentMCQ.options[key]}</span>
                      </div>
                      {isAnswered && isCorrect && quizConfigFeedbackMode !== "board" && <Check size={14} style={{ color: "var(--success)", flexShrink: 0, marginLeft: "8px" }} />}
                      {isAnswered && isSelected && !isCorrect && quizConfigFeedbackMode !== "board" && <X size={14} style={{ color: "var(--error)", flexShrink: 0, marginLeft: "8px" }} />}
                    </button>
                  );
                })}
              </div>

              {/* Action Bar */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "var(--sp-4)", borderTop: "1px solid var(--border-light)", paddingTop: "var(--sp-4)" }}>
                <div>
                  {isAnswered && quizConfigFeedbackMode !== "board" && (
                    <button className="btn-workspace" style={{ borderColor: "var(--teal)", color: "var(--teal)", display: "flex", alignItems: "center", gap: "6px" }} onClick={() => fetchExplanation(currentMCQ.id)}>
                      <GraduationCap size={14} />
                      Explain Question
                    </button>
                  )}
                </div>
                <div>
                  {isAnswered && (
                    quizCurrentIdx < quizMCQs.length - 1 ? (
                      <button className="btn-primary" onClick={() => { setQuizCurrentIdx((prev) => prev + 1); setExplanationMCQId(null); setLastSelectedChoice(null); setIsCorrectSelection(null); if (quizConfigTimerMode === "per_question") setQuizTimerCountdown(quizConfigTimerValue); }} style={{ padding: "8px 24px" }}>
                        Next Question
                      </button>
                    ) : (
                      <button className="btn-primary" disabled={quizIsSubmitting} onClick={handleSubmitQuiz} style={{ padding: "8px 24px", display: "flex", alignItems: "center", gap: "6px" }}>
                        {quizIsSubmitting ? <Loader2 size={14} className="spinner" style={{ animation: "spin 1s linear infinite" }} /> : "Finish Practice"}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>

          <ExplanationPanel explanationMCQId={explanationMCQId} setExplanationMCQId={setExplanationMCQId} explanationLoading={explanationLoading} explanationError={explanationError} explanationData={explanationData} token={token} onFigureClick={onFigureClick} />
        </div>
      </div>
    );
  }

  // ─── Stage 3: Summary ─────────────────────────────────────────────────────
  if (quizStep === "summary") {
    const correctCount = quizMCQs.reduce((acc, q) => {
      const choice = quizSelectedAnswers[q.id];
      return acc + (choice === q.correct_option ? 1 : 0);
    }, 0);
    const totalCount = quizMCQs.length;
    const finalAccuracy = Math.round((correctCount / totalCount) * 100);
    const reviewIdx = summaryReviewIdx !== null ? summaryReviewIdx : 0;
    const reviewMCQ = quizMCQs[reviewIdx];

    return (
      <div className="dashboard-view" role="region" aria-label="Practice Results">
        <div className="dashboard-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="dashboard-eyebrow"><GraduationCap size={12} style={{ marginRight: 6 }} />Practice Scoreboard</div>
            <h1 className="dashboard-title">Practice Results Summary</h1>
          </div>
          <button className="btn-workspace" onClick={() => setActiveView("dashboard")}>Return to Dashboard</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-6)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--sp-4)" }}>
            <div className="stat-card" style={{ textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center", padding: "var(--sp-5)" }}>
              <div className="score-badge-circle" style={{ borderColor: finalAccuracy >= 70 ? "var(--sea-green)" : "var(--teal)" }}>
                <span style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{finalAccuracy}%</span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>Accuracy</span>
              </div>
            </div>
            <div className="stat-card" style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
              <span className="stat-label">Score Metrics</span>
              <span className="stat-value" style={{ fontSize: "2rem" }}>
                {correctCount} <span style={{ fontSize: "1rem", color: "var(--text-muted)", fontWeight: 400 }}>/ {totalCount} Correct</span>
              </span>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Completed in {formatTime(quizSecondsElapsed)}</span>
            </div>
            <div className="stat-card" style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: "var(--sp-3)" }}>
              <button className="btn-primary" onClick={() => setQuizStep("config")} style={{ width: "100%" }}>Start New Session</button>
              <button className="btn-workspace" onClick={() => setActiveView("dashboard")} style={{ width: "100%" }}>Back to Dashboard</button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "var(--sp-5)", marginTop: "var(--sp-2)" }}>
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "var(--sp-5)" }}>
              <h3 className="practice-title" style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "var(--sp-2)" }}>Clinical Review Grid</h3>
              <p className="practice-subtitle" style={{ marginBottom: "var(--sp-4)" }}>Click a question number to review your choices and load citations</p>
              <div className="review-grid" role="list">
                {quizMCQs.map((q, idx) => {
                  const ans = quizSelectedAnswers[q.id];
                  const isRight = ans === q.correct_option;
                  const isActive = idx === reviewIdx;
                  return (
                    <button key={idx} className={`review-circle-btn ${isRight ? "correct" : "incorrect"} ${isActive ? "active" : ""}`} role="listitem" onClick={() => setSummaryReviewIdx(idx)}>
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {reviewMCQ && (
              <div className={`quiz-split-layout ${explanationMCQId !== null ? "has-explanation" : ""}`}>
                <div className="quiz-question-col">
                  <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "var(--sp-6)", display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-light)", paddingBottom: "12px", marginBottom: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "0.72rem", color: "var(--sky)", background: "var(--sky-dim)", padding: "2px 8px", borderRadius: "10px", fontWeight: 600 }}>
                          {reviewMCQ.sub_category || reviewMCQ.main_category || "Board MCQ"}
                        </span>
                        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: quizSelectedAnswers[reviewMCQ.id] === reviewMCQ.correct_option ? "var(--success)" : "#ef4444", background: quizSelectedAnswers[reviewMCQ.id] === reviewMCQ.correct_option ? "rgba(76, 217, 100, 0.1)" : "rgba(239, 68, 68, 0.1)", padding: "2px 8px", borderRadius: "10px" }}>
                          {quizSelectedAnswers[reviewMCQ.id] === reviewMCQ.correct_option ? "Correct" : "Incorrect"}
                        </span>
                      </div>
                      <button type="button" className="chat-delete-btn"
                        style={{ position: "static", opacity: 1, color: bookmarkedMcqs.some(b => b.id === reviewMCQ.id) ? "var(--teal)" : "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
                        onClick={() => toggleBookmarkMCQ(reviewMCQ.id)} title="Bookmark Question">
                        <Bookmark size={14} fill={bookmarkedMcqs.some(b => b.id === reviewMCQ.id) ? "currentColor" : "none"} />
                      </button>
                    </div>

                    <p style={{ fontSize: "1rem", lineHeight: 1.6, color: "var(--text-primary)", fontWeight: 500 }}>{reviewMCQ.question_text}</p>

                    <div className="quiz-options-list">
                      {Object.keys(reviewMCQ.options).sort().map((key) => {
                        const isCorrect = key === reviewMCQ.correct_option;
                        const isSelected = key === quizSelectedAnswers[reviewMCQ.id];
                        let optClass = "option-button";
                        if (isCorrect) optClass += " correct";
                        else if (isSelected) optClass += " selected-wrong";
                        return (
                          <button key={key} className={optClass} disabled={true} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textAlign: "left" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
                              <span className="option-badge">{key}</span>
                              <span style={{ lineHeight: 1.4 }}>{reviewMCQ.options[key]}</span>
                            </div>
                            {isCorrect && <Check size={14} style={{ color: "var(--success)", flexShrink: 0, marginLeft: "8px" }} />}
                            {isSelected && !isCorrect && <X size={14} style={{ color: "var(--error)", flexShrink: 0, marginLeft: "8px" }} />}
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-start", borderTop: "1px solid var(--border-light)", paddingTop: "var(--sp-4)", marginTop: "var(--sp-2)" }}>
                      <button className="btn-workspace" style={{ borderColor: "var(--teal)", color: "var(--teal)", display: "flex", alignItems: "center", gap: "6px" }} onClick={() => fetchExplanation(reviewMCQ.id)}>
                        <GraduationCap size={14} />
                        Clinical Explanation
                      </button>
                    </div>
                  </div>
                </div>
                <ExplanationPanel explanationMCQId={explanationMCQId} setExplanationMCQId={setExplanationMCQId} explanationLoading={explanationLoading} explanationError={explanationError} explanationData={explanationData} token={token} onFigureClick={onFigureClick} />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
