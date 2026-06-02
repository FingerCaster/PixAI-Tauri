export function confirmDestructiveAction(message: string): boolean {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return false
  try {
    return window.confirm(message)
  } catch {
    return false
  }
}
