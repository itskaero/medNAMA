import React, { useState, useEffect } from "react";
import { Stethoscope, AlertCircle, Check, Copy, Bookmark } from "lucide-react";
import { Message, Figure } from "../types";
import { CitationsDrawer } from "./CitationsDrawer";
import { FiguresDrawer } from "./FiguresDrawer";
import { SourcesPanel } from "./SourcesPanel";
import { parseMarkdown } from "../utils/markdown";

export function AIMessage({
  msg,
  token,
  onFigureClick,
  onBookmarkConcept,
}: {
  msg: Message;
  token: string | null;
  onFigureClick: (f: Figure) => void;
  onBookmarkConcept?: (content: string) => void;
}) {
  const [thinkingStage, setThinkingStage] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (msg.type !== "thinking") return;
    const interval = setInterval(() => {
      setThinkingStage((prev) => (prev < 3 ? prev + 1 : prev));
    }, 2500);
    return () => clearInterval(interval);
  }, [msg.type]);

  const handleCopy = () => {
    if (!msg.answer) return;
    navigator.clipboard.writeText(msg.answer.answer_markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const stagesText = [
    "Consulting medical reference library...",
    "Cross-referencing textbook chapters...",
    "Reranking candidate passages with Cross-Encoder...",
    "Synthesizing RAG-grounded clinical explanation..."
  ];

  return (
    <div className="ai-message" role="article" aria-label="AI response">
      <div className="ai-body">
        {/* Editorial Brand Header */}
        <div className="ai-editorial-header">
          <Stethoscope size={13} className="ai-editorial-icon" />
          <span className="ai-editorial-name">Dr. MedNama</span>
        </div>
        
        {msg.type === "thinking" ? (
          <div className="thinking" aria-live="polite" aria-label="Generating answer">
            <div className="thinking-dots" aria-hidden>
              <span className="thinking-dot" />
              <span className="thinking-dot" />
              <span className="thinking-dot" />
            </div>
            <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              {stagesText[thinkingStage]}
            </span>
          </div>
        ) : null}
        {msg.type === "error" ? (
          <div className="error-banner" role="alert">
            <AlertCircle size={16} />
            <span>{msg.errorMsg}</span>
          </div>
        ) : null}
        {msg.type === "ai" && msg.answer ? (
          <>
            <div
              className="prose"
              dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.answer.answer_markdown) }}
            />
            
            <FiguresDrawer
              figures={msg.answer.figures}
              token={token}
              onFigureClick={onFigureClick}
            />

            {/* F1 — hybrid sources panel (reranked candidates before merge) */}
            <SourcesPanel sources={msg.answer.sources || []} token={token} />

            <div className="answer-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginTop: "var(--sp-4)" }}>
              <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                <CitationsDrawer citations={msg.answer.citations} token={token} />
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
                {msg.timestamp ? (
                  <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {msg.timestamp}
                  </span>
                ) : null}
                <button 
                  className="btn-workspace" 
                  style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 10px", fontSize: "0.72rem" }}
                  onClick={handleCopy}
                  title="Copy answer to clipboard"
                >
                  {copied ? <Check size={10} style={{ color: "var(--sea-green)" }} /> : <Copy size={10} />}
                  <span>{copied ? "Copied!" : "Copy"}</span>
                </button>
                {onBookmarkConcept ? (
                  <button 
                    className="btn-workspace" 
                    style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 10px", fontSize: "0.72rem" }}
                    onClick={() => msg.answer && onBookmarkConcept(msg.answer.answer_markdown)}
                    title="Bookmark this concept to Bookmarks tab"
                  >
                    <Bookmark size={10} />
                    <span>Save</span>
                  </button>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
