"use client";

import React, { useEffect } from "react";
import { TrendingUp, GraduationCap, BookMarked } from "lucide-react";
import { API } from "@/lib/constants";

interface StatsViewProps {
  detailedStats: any;
  isLoadingDetailedStats: boolean;
  getHeaders: () => HeadersInit;
  handleReviewPreviousQuiz: (attemptId: number) => void;
  setActiveView: (view: any) => void;
  setQuizAttemptId: (id: number) => void;
  setQuizMCQs: (mcqs: any[]) => void;
  setQuizSelectedAnswers: (answers: any) => void;
  setQuizStep: (step: "config" | "taker" | "summary") => void;
}

export default function StatsView({
  detailedStats,
  isLoadingDetailedStats,
  getHeaders,
  handleReviewPreviousQuiz,
  setActiveView,
  setQuizAttemptId,
  setQuizMCQs,
  setQuizSelectedAnswers,
  setQuizStep,
}: StatsViewProps) {
  // Chart.js initialization effect (moved here from page.tsx E13)
  useEffect(() => {
    let active = true;
    if (detailedStats) {
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
          type: "line",
          data: {
            labels: trendLabels,
            datasets: [
              {
                label: "Accuracy %",
                data: trendData,
                borderColor: "#30c5ff",
                backgroundColor: "rgba(48, 197, 255, 0.1)",
                tension: 0.3,
                fill: true,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 500, easing: "easeOutQuart" },
            plugins: { legend: { labels: { color: "#b0c4de" } } },
            scales: {
              x: { ticks: { color: "#b0c4de" }, grid: { color: "rgba(255, 255, 255, 0.05)" } },
              y: {
                min: 0,
                max: 100,
                ticks: { color: "#b0c4de" },
                grid: { color: "rgba(255, 255, 255, 0.05)" },
              },
            },
          },
        });

        (window as any).catChartInstance = new (window as any).Chart(catCtx, {
          type: "bar",
          data: {
            labels: catLabels,
            datasets: [
              {
                label: "Accuracy %",
                data: catData,
                backgroundColor: "rgba(92, 148, 110, 0.7)",
                borderColor: "#5c946e",
                borderWidth: 1,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 500, easing: "easeOutQuart" },
            plugins: { legend: { labels: { color: "#b0c4de" } } },
            scales: {
              x: { ticks: { color: "#b0c4de" }, grid: { color: "rgba(255, 255, 255, 0.05)" } },
              y: {
                min: 0,
                max: 100,
                ticks: { color: "#b0c4de" },
                grid: { color: "rgba(255, 255, 255, 0.05)" },
              },
            },
          },
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
  }, [detailedStats]);

  return (
    <div
      className="dashboard-view"
      role="region"
      aria-label="Detailed Analytics"
      style={{ maxHeight: "calc(100vh - 100px)", overflowY: "auto", paddingBottom: "var(--sp-8)" }}
    >
      <div className="dashboard-header">
        <div className="dashboard-eyebrow">
          <TrendingUp size={12} style={{ marginRight: 6 }} />
          Performance Telemetry
        </div>
        <h1 className="dashboard-title">Detailed Analytics</h1>
      </div>

      {isLoadingDetailedStats ? (
        <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "var(--sp-12)" }}>
          Calculating metrics...
        </div>
      ) : !detailedStats || detailedStats.total_attempts === 0 ? (
        <div className="empty-state-card">
          <TrendingUp size={24} className="empty-icon" />
          <span className="empty-title">No completed quizzes yet</span>
          <span className="empty-desc">
            Take mock board exams in the Mock Builder tab to generate performance statistics.
          </span>
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

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
              gap: "var(--sp-6)",
              marginTop: "var(--sp-2)",
            }}
          >
            <div
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-xl)",
                padding: "var(--sp-5)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>
                Accuracy Trend (Last 15 Sessions)
              </h3>
              <div style={{ position: "relative", height: "240px", width: "100%" }}>
                <canvas id="accuracyTrendChart" />
              </div>
            </div>

            <div
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-xl)",
                padding: "var(--sp-5)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>
                Subject Mastery (Accuracy %)
              </h3>
              <div style={{ position: "relative", height: "240px", width: "100%" }}>
                <canvas id="categoryBreakdownChart" />
              </div>
            </div>
          </div>

          <div
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-xl)",
              padding: "var(--sp-5)",
              marginTop: "var(--sp-2)",
            }}
          >
            <h3
              style={{
                fontSize: "0.95rem",
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: "var(--sp-4)",
              }}
            >
              Mock Session Logs
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.85rem",
                  textAlign: "left",
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>
                    <th style={{ padding: "10px var(--sp-2)" }}>Date</th>
                    <th style={{ padding: "10px var(--sp-2)" }}>Score</th>
                    <th style={{ padding: "10px var(--sp-2)" }}>Accuracy</th>
                    <th style={{ padding: "10px var(--sp-2)" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {detailedStats.history_trend
                    .slice()
                    .reverse()
                    .map((item: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: "1px solid var(--border-light)" }}>
                        <td
                          style={{
                            padding: "12px var(--sp-2)",
                            color: "var(--text-primary)",
                            fontWeight: 500,
                          }}
                        >
                          {item.date}
                        </td>
                        <td style={{ padding: "12px var(--sp-2)" }}>
                          {item.score} / {item.total}
                        </td>
                        <td
                          style={{ padding: "12px var(--sp-2)", color: "var(--teal)", fontWeight: 600 }}
                        >
                          {item.accuracy}%
                        </td>
                        <td style={{ padding: "12px var(--sp-2)" }}>
                          <button
                            className="btn-workspace"
                            style={{ padding: "4px 8px", fontSize: "0.7rem", borderColor: "var(--border)" }}
                            onClick={() => {
                              fetch(`${API}/api/quizzes/${item.attempt_id}`, {
                                headers: getHeaders(),
                                credentials: "include",
                              })
                                .then((res) => res.json())
                                .then((data) => {
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
}
