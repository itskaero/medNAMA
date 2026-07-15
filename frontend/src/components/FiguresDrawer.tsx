import React, { useState } from "react";
import { ChevronDown, ImageIcon } from "lucide-react";
import { Figure } from "../types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const FiguresDrawer = React.memo(({
  figures,
  token,
  onFigureClick,
}: {
  figures: Figure[];
  token: string | null;
  onFigureClick: (f: Figure) => void;
}) => {
  const [open, setOpen] = useState(false);
  if (!figures.length) return null;
  return (
    <div>
      <button
        className={`section-toggle-btn ${open ? "open" : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <ChevronDown className="chevron" aria-hidden />
        <ImageIcon size={12} />
        Extracted Figures
        <span className="section-count">{figures.length}</span>
      </button>
      {open ? (
        <div className="figures-drawer">
          <div className="figures-grid">
            {figures.map((fig) => (
              <button
                key={fig.id}
                className="figure-thumb"
                onClick={() => onFigureClick(fig)}
                aria-label={`View ${fig.figure_label}`}
              >
                <div className="figure-img-wrapper">
                  <img
                    src={`${API}/api/figures/${fig.id}?token=${token ?? ""}`}
                    alt={fig.figure_label}
                    loading="lazy"
                  />
                </div>
                <div className="figure-label-bar">{fig.figure_label}</div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
});

FiguresDrawer.displayName = "FiguresDrawer";
