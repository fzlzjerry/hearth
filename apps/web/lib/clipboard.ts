'use client'

/**
 * Write text to the user's local clipboard. Prefers the async Clipboard API (needs a secure context —
 * HTTPS or localhost, which Hearth's production deploy satisfies) and falls back to a hidden-textarea
 * execCommand for plain-HTTP dev. Best-effort: never throws.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (!text) return
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  } catch {
    /* give up silently — copy is a convenience, not a hard requirement */
  }
}

/** Decode a base64 payload (e.g. the body of an OSC 52 set-clipboard sequence) as UTF-8 text. */
export function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
