// Content script — injected on demand via chrome.scripting.executeScript()
// Returns extracted page content as an IIFE result.
(() => {
  try {
    const url = window.location.href;
    const isPdf = url.toLowerCase().endsWith('.pdf') ||
      document.contentType === 'application/pdf';

    let content = '';
    let title = document.title || url;

    if (isPdf) {
      // Try selection-based extraction first
      const sel = window.getSelection();
      sel.selectAllChildren(document.body);
      content = sel.toString().trim();
      sel.removeAllRanges();

      // Fallback: try .textLayer span elements (Chrome's built-in PDF viewer)
      if (!content) {
        const spans = document.querySelectorAll('.textLayer span');
        if (spans.length > 0) {
          content = Array.from(spans).map(s => s.textContent).join(' ');
        }
      }

      if (!content) {
        return { error: 'Could not extract text from this PDF. It may be image-based (scanned) without a text layer.' };
      }
    } else {
      // Webpage extraction: article → main → body fallback
      const article = document.querySelector('article');
      const main = document.querySelector('main');
      const source = article || main || document.body;

      // Clone and remove script/style/nav/footer/header elements
      const clone = source.cloneNode(true);
      clone.querySelectorAll('script, style, nav, footer, header, aside, [role="navigation"], [role="banner"], [role="contentinfo"]')
        .forEach(el => el.remove());

      content = clone.textContent.replace(/\s+/g, ' ').trim();
    }

    if (!content || content.length < 50) {
      return { error: 'Page appears to have no readable content.' };
    }

    return {
      title,
      url,
      content,
      isPdf,
      charCount: content.length,
    };
  } catch (e) {
    return { error: `Extraction failed: ${e.message}` };
  }
})();
