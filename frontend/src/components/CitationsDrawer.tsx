import React, { useState } from "react";
import { ChevronDown, BookOpen } from "lucide-react";
import { Citation } from "../types";

export const CitationsDrawer = React.memo(({ citations, token }: { citations: Citation[]; token: string | null }) => {
  const [open, setOpen] = useState(false);
  if (!citations.length) return null;
  return (
    <div>
      <button
        className={`section-toggle-btn ${open ? "open" : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <ChevronDown className="chevron" aria-hidden />
        <BookOpen size={12} />
        Verified Citations
        <span className="section-count">{citations.length}</span>
      </button>
      {open ? (
        <div className="citations-drawer" role="list">
          {citations.map((c, i) => (
            <div className="citation-card" role="listitem" key={i}>
              <span className="citation-num">{i + 1}</span>
              <div className="citation-body">
                <div className="citation-source">
                  {c.book_title}
                  <span className="citation-page">p. {c.page_number}</span>
                </div>
                <div className="citation-excerpt">"{c.excerpt}"</div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
});

CitationsDrawer.displayName = "CitationsDrawer";
