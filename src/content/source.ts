/** Original DOM signature, excluding extension UI and unwrapping translation-only backups.
 * Kept only in memory; never sent to a provider or logged. Includes inline markup
 * so a changed link/placeholder cannot reuse the result for the previous DOM.
 */
export function sourceSignature(element: Element): string {
  const parts: unknown[] = []
  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(['text', node.textContent])
      return
    }
    if (!(node instanceof Element)) return
    if (node.hasAttribute('data-tv-owned')) {
      const backup = node.tagName === 'TV-TRANSLATION'
        ? node.querySelector<HTMLTemplateElement>(':scope > template.tv-backup') : null
      if (backup) for (const original of Array.from(backup.content.childNodes)) visit(original)
      return
    }
    parts.push(['open', node.tagName, Array.from(node.attributes)
      .filter(attr => !attr.name.startsWith('data-tv-'))
      .map(attr => [attr.name, attr.value]).sort(([a], [b]) => a.localeCompare(b))])
    for (const child of Array.from(node.childNodes)) visit(child)
    parts.push(['close', node.tagName])
  }
  for (const child of Array.from(element.childNodes)) visit(child)
  return JSON.stringify(parts)
}
