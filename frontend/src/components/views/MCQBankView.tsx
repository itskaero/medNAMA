"use client";

import React from "react";
import { BookMarked, GraduationCap, Bookmark, Check, Download } from "lucide-react";
import { AnswerResponse, Figure } from "@/types";
import BasicDropdown from "@/components/ui/basic-dropdown";
import ExplanationPanel from "@/components/ExplanationPanel";
import { API } from "@/lib/constants";
import { downloadAuthenticatedCSV } from "@/lib/downloadCSV";
import { toast } from "sonner";

interface MCQBankViewProps {
  stats: any;
  mcqsList: any[];
  isLoadingMcqs: boolean;
  mcqSearchText: string;
  setMcqSearchText: (v: string) => void;
  mcqFilterCategory: string;
  setMcqFilterCategory: (v: string) => void;
  toggleBookmarkMCQ: (mcqId: number) => void;
  fetchExplanation: (mcqId: number) => void;
  explanationMCQId: number | null;
  setExplanationMCQId: (id: number | null) => void;
  explanationData: AnswerResponse | null;
  explanationLoading: boolean;
  explanationError: string | null;
  token: string | null;
  onFigureClick: (fig: Figure) => void;
}

export default function MCQBankView({
  stats,
  mcqsList,
  isLoadingMcqs,
  mcqSearchText,
  setMcqSearchText,
  mcqFilterCategory,
  setMcqFilterCategory,
  toggleBookmarkMCQ,
  fetchExplanation,
  explanationMCQId,
  setExplanationMCQId,
  explanationData,
  explanationLoading,
  explanationError,
  token,
  onFigureClick,
}: MCQBankViewProps) {
  const categories = stats?.categories || [];

  return (
    <div className="dashboard-view" role="region" aria-label="MCQ Bank">
      <div
        className="dashboard-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "var(--sp-4)",
        }}
      >
        <div>
          <h1 className="dashboard-title">MCQ Bank</h1>
        </div>

        <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap", alignItems: "center" }}>
          <BasicDropdown
            items={[
              { value: "all", label: "All Subjects" },
              ...categories.map((c: any) => ({
                value: c.main_category,
                label: c.main_category,
              })),
            ]}
            value={mcqFilterCategory}
            onChange={(val) => setMcqFilterCategory(val)}
            ariaLabel="Filter MCQs by category"
          />
          <input
            type="text"
            style={{
              width: "200px",
              padding: "8px 12px",
              fontSize: "0.85rem",
              background: "var(--surface-2)",
              border: "1px solid var(--border-light)",
              borderRadius: "8px",
              color: "var(--text-primary)",
              height: "38px",
              margin: 0,
              outline: "none",
              transition: "border-color 0.15s, box-shadow 0.15s",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--sky)";
              e.currentTarget.style.boxShadow = "0 0 0 2px var(--sky-dim)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border-light)";
              e.currentTarget.style.boxShadow = "none";
            }}
            placeholder="Search questions..."
            value={mcqSearchText}
            onChange={(e) => setMcqSearchText(e.target.value)}
          />
          <button
            className="btn-workspace"
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 12px", fontSize: "0.78rem", height: "38px" }}
            onClick={async () => {
              const ok = await downloadAuthenticatedCSV(`${API}/api/export/mcqs`, "mednama_mcq_bank.csv", token);
              if (ok) toast.success("MCQ bank exported to CSV.");
              else toast.error("Failed to export MCQ bank.");
            }}
            title="Download the full shared MCQ bank as a CSV"
          >
            <Download size={13} />
            Export Bank
          </button>
        </div>
      </div>

      <div className={`quiz-split-layout ${explanationMCQId !== null ? "has-explanation" : ""}`}>
        <div
          className="quiz-question-col"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--sp-4)",
            maxHeight: "calc(100vh - 200px)",
            overflowY: "auto",
            paddingRight: "4px",
          }}
        >
          {isLoadingMcqs ? (
            <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "var(--sp-12)" }}>
              Loading question bank...
            </div>
          ) : mcqsList.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "var(--sp-12)" }}>
              No questions matched filters
            </div>
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
                  gap: "var(--sp-3)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      color: "var(--sky)",
                      background: "var(--sky-dim)",
                      padding: "2px 8px",
                      borderRadius: "10px",
                      fontWeight: 600,
                    }}
                  >
                    {mcq.main_category}
                  </span>
                  <button
                    className="chat-delete-btn"
                    style={{
                      position: "static",
                      opacity: 1,
                      color: mcq.bookmarked ? "var(--teal)" : "var(--text-muted)",
                    }}
                    onClick={() => toggleBookmarkMCQ(mcq.id)}
                    title="Bookmark Question"
                  >
                    <Bookmark size={14} fill={mcq.bookmarked ? "currentColor" : "none"} />
                  </button>
                </div>

                <p
                  style={{
                    fontWeight: 500,
                    lineHeight: 1.5,
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-serif)",
                  }}
                >
                  {mcq.question_text}
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                  {Object.keys(mcq.options)
                    .sort()
                    .map((key) => {
                      const isCorrect = key === mcq.correct_option;
                      return (
                        <div
                          key={key}
                          className={`option-button ${isCorrect ? "correct" : ""}`}
                          style={{
                            cursor: "default",
                            opacity: 0.9,
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                          }}
                        >
                          <span className="option-badge">{key}</span>
                          <span style={{ textAlign: "left", flex: 1 }}>{mcq.options[key]}</span>
                          {isCorrect && <Check size={12} style={{ color: "var(--success)" }} />}
                        </div>
                      );
                    })}
                </div>

                <div
                  style={{
                    borderTop: "1px solid var(--border-light)",
                    paddingTop: "var(--sp-3)",
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    className="btn-workspace"
                    style={{
                      borderColor: "var(--teal)",
                      color: "var(--teal)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 10px",
                      fontSize: "0.75rem",
                    }}
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

        <ExplanationPanel
          explanationMCQId={explanationMCQId}
          setExplanationMCQId={setExplanationMCQId}
          explanationLoading={explanationLoading}
          explanationError={explanationError}
          explanationData={explanationData}
          token={token}
          onFigureClick={onFigureClick}
        />
      </div>
    </div>
  );
}
