export function normalizeCodexProjectPath(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  let next = value.trim()
  if (!next) return null
  const windowsStyle = /^[a-zA-Z]:[\\/]/.test(next) || next.startsWith('\\\\')
  const windowsDriveRoot = /^[a-zA-Z]:[\\/]+$/.test(next)
  next = next.replace(/\\/g, '/')
  if (windowsStyle) next = next.toLowerCase()
  if (windowsDriveRoot) return `${next.slice(0, 2)}/`
  if (next.length > 1 && next.endsWith('/')) next = next.replace(/\/+$/, '')
  return next
}
