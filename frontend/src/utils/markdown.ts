import { marked } from "marked";

const CITATION_PILL_REGEX = /\[([^\]\n]+)\]/g;

export function parseMarkdown(text: string): string {
  if (!text) return "";
  try {
    const rawHtml = marked.parse(text, { async: false }) as string;
    // Post-process to wrap brackets [1] or [Pelczar] in clinical citation pills
    return rawHtml.replace(CITATION_PILL_REGEX, (match) => {
      return `<span class="prose-citation">${match}</span>`;
    });
  } catch (err) {
    console.error("Failed parsing markdown:", err);
    return text;
  }
}
