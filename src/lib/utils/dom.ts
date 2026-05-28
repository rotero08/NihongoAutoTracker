/**
 * ── DOM Utilities ────────────────────────────────────────────────────────────
 *
 * Reusable, safe DOM helpers that bypass AMO innerHTML warnings.
 */

/**
 * Securely inserts an HTML string into a target DOM element.
 * Parses the HTML string using DOMParser and appends the parsed nodes.
 *
 * @param el - The target element to receive the parsed HTML nodes
 * @param html - The HTML string to parse and insert
 */
export function setSafeHTML(el: Element, html: string): void {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    el.textContent = '';
    while (doc.body.firstChild) {
        el.appendChild(doc.body.firstChild);
    }
}
