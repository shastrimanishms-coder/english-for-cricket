import { Platform } from 'react-native';

// Round 74: "Download PDF" for Smart Reading stories and Speaking
// Practice conversations. The app ships as a static web export, so
// the reliable route is a print-ready HTML document loaded into a
// hidden iframe: printing that frame lets the learner save a
// properly formatted A4 PDF from the browser's print dialog, with
// no PDF library and no server endpoint. On native there is no
// browser print path, so downloadPdf returns false there and the
// buttons are simply not rendered.

export interface PdfDialogueLine {
  speaker: string;
  text: string;
}

export interface PdfQuestion {
  q: string;
  options: string[];
}

export type PdfBlock =
  | { kind: 'paragraphs'; texts: string[] }
  | { kind: 'dialogue'; lines: PdfDialogueLine[] }
  | { kind: 'questions'; items: PdfQuestion[] }
  | { kind: 'answers'; items: string[] };

export interface PdfSection {
  heading?: string;
  blocks: PdfBlock[];
}

export interface PdfDocumentSpec {
  /** Big title under the English for Cricket header. */
  title: string;
  /** Small lines under the title: stage, partner, photo credit… */
  meta?: string[];
  sections: PdfSection[];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function blockHtml(block: PdfBlock): string {
  switch (block.kind) {
    case 'paragraphs':
      return block.texts.map((t) => `<p>${escapeHtml(t)}</p>`).join('\n');
    case 'dialogue':
      return block.lines
        .map(
          (l) =>
            `<p class="turn"><span class="speaker">${escapeHtml(l.speaker)}:</span> ${escapeHtml(l.text)}</p>`
        )
        .join('\n');
    case 'questions':
      return block.items
        .map((item, i) => {
          const opts = item.options
            .map((o, j) => `<li>${LETTERS[j] || `${j + 1}`}. ${escapeHtml(o)}</li>`)
            .join('');
          return `<div class="question"><p class="qtext">${i + 1}. ${escapeHtml(item.q)}</p><ul class="options">${opts}</ul></div>`;
        })
        .join('\n');
    case 'answers':
      return `<ol class="answers">${block.items.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ol>`;
  }
}

function documentHtml(spec: PdfDocumentSpec): string {
  const meta = (spec.meta || [])
    .filter(Boolean)
    .map((m) => `<div class="meta">${escapeHtml(m)}</div>`)
    .join('\n');
  const sections = spec.sections
    .map((s) => {
      const heading = s.heading ? `<h2>${escapeHtml(s.heading)}</h2>` : '';
      return `${heading}\n${s.blocks.map(blockHtml).join('\n')}`;
    })
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(spec.title)} — English for Cricket</title>
<style>
  @page { size: A4; margin: 16mm 15mm 20mm; }
  * { box-sizing: border-box; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 12pt;
    line-height: 1.65;
    color: #26313F;
    margin: 0;
  }
  .brand {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10pt;
    font-weight: bold;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    color: #B8912A;
    border-bottom: 3px solid #0A192F;
    padding-bottom: 6px;
    margin-bottom: 18px;
  }
  h1 {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 23pt;
    line-height: 1.25;
    color: #0A192F;
    margin: 0 0 6px;
  }
  .meta {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10pt;
    color: #6B7686;
    margin: 1px 0;
  }
  h2 {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13pt;
    color: #0A192F;
    border-bottom: 1px solid #E9E2D4;
    padding-bottom: 4px;
    margin: 26px 0 10px;
  }
  p { margin: 0 0 10px; }
  p.turn { margin-bottom: 8px; }
  .speaker {
    font-family: Arial, Helvetica, sans-serif;
    font-weight: bold;
    color: #0A192F;
  }
  .question { margin-bottom: 14px; page-break-inside: avoid; }
  .qtext { font-weight: bold; color: #0A192F; margin-bottom: 4px; }
  ul.options { list-style: none; margin: 0 0 0 14px; padding: 0; }
  ul.options li { margin: 2px 0; }
  ol.answers { margin: 0 0 0 18px; padding: 0; }
  ol.answers li { margin: 3px 0; }
  .footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    text-align: center;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 8.5pt;
    color: #9AA3AF;
  }
</style>
</head>
<body>
  <div class="brand">English for Cricket</div>
  <h1>${escapeHtml(spec.title)}</h1>
  ${meta}
  ${sections}
  <div class="footer">English for Cricket — englishforcricket.com</div>
</body>
</html>`;
}

/**
 * Opens the browser print dialog for a print-ready document the
 * learner can save as PDF. Web only; returns false elsewhere or if
 * the print frame could not be created.
 */
export function downloadPdf(spec: PdfDocumentSpec): boolean {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '0';
    iframe.style.top = '0';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.opacity = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) return;
      try {
        win.focus();
        win.print();
      } catch {
        // Print was blocked or dismissed; nothing more to do.
      }
      setTimeout(() => iframe.remove(), 1500);
    };
    iframe.srcdoc = documentHtml(spec);
    document.body.appendChild(iframe);
    return true;
  } catch {
    return false;
  }
}
