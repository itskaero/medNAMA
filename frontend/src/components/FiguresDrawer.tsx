import React from "react";
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
  if (!figures.length) return null;
  return (
    <div className="message-figures-attachment">
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
            {/* Optional label if we want it, but iMessage style usually just has images */}
          </button>
        ))}
      </div>
    </div>
  );
});

FiguresDrawer.displayName = "FiguresDrawer";
