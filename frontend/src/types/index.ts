export interface Book {
  id: number;
  title: string;
  filename: string;
  status: "pending" | "processing" | "ready" | "failed";
  total_pages: number | null;
  error_message: string | null;
  created_at: string;
}

export interface Citation {
  book_title: string;
  page_number: number;
  excerpt: string;
}

export interface Figure {
  id: number;
  figure_label: string;
  reason_to_include?: string;
  caption?: string | null;
  page_number?: number;
}

export interface AnswerResponse {
  answer_markdown: string;
  citations: Citation[];
  figures: Figure[];
}

export interface Message {
  id: string;
  type: "user" | "ai" | "thinking" | "error";
  content?: string;
  answer?: AnswerResponse;
  errorMsg?: string;
  query?: string;
  timestamp?: string;
}

export type ActiveView = "chat" | "dashboard" | "mcq-bank" | "bookmarks" | "quiz" | "stats" | "reader";
