export function $<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Required element is missing from the page: ${selector}`);
  }
  return element;
}

/** For elements that legitimately may not exist on the page. */
export function $maybe<T extends HTMLElement>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

export function $all<T extends HTMLElement>(selector: string): T[] {
  return Array.from(document.querySelectorAll<T>(selector));
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char]!
  );
}
