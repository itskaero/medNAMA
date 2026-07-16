import { marked } from "marked";

const CITATION_PILL_REGEX = /\[([^\]\n]+)\]/g;

// Custom marked renderer for premium warm code blocks with filename and copy buttons
marked.use({
  renderer: {
    code({ text, lang }) {
      const filename = lang || "code";
      return `
        <div class="code-block-wrapper">
          <div class="code-block-header">
            <span class="code-block-filename">${filename}</span>
            <button class="code-block-copy-btn" onclick="navigator.clipboard.writeText(this.closest('.code-block-wrapper').querySelector('pre').innerText.trim() || ''); this.innerText='Copied!'; const btn=this; setTimeout(() => btn.innerText='Copy', 2000);">Copy</button>
          </div>
          <pre><code>${text}</code></pre>
        </div>
      `;
    }
  }
});

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
