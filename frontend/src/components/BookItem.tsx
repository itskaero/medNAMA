import React from "react";
import { BookOpen, Trash2 } from "lucide-react";
import { Book } from "../types";

export function BookItem({
  book,
  isAdmin,
  onDelete,
}: {
  book: Book;
  isAdmin: boolean;
  onDelete: (id: number, title: string) => void;
}) {
  return (
    <div className="book-item">
      <div className="book-item-header">
        <div className="book-icon" aria-hidden>
          <BookOpen size={14} />
        </div>
        <div className="book-details">
          <div className="book-title" title={book.title}>{book.title}</div>
          <div className="book-footer">
            <span className={`status-pill ${book.status}`}>
              <span
                className={`status-dot ${book.status === "processing" || book.status === "pending" ? "pulsing" : ""}`}
                aria-hidden
              />
              {book.status}
            </span>
            {book.total_pages ? (
              <span className="book-pages">{book.total_pages}p</span>
            ) : null}
          </div>
        </div>
      </div>
      {isAdmin ? (
        <button
          className="book-delete-btn"
          onClick={() => onDelete(book.id, book.title)}
          aria-label={`Remove ${book.title}`}
          title="Remove book"
        >
          <Trash2 size={12} />
        </button>
      ) : null}
    </div>
  );
}
