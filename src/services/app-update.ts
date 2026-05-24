import { getVersion } from '@tauri-apps/api/app'
import { openUrl } from '@tauri-apps/plugin-opener'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { fetchJsonThroughPlatform, getAppInstallerType, isTauriRuntime } from '../lib/platform'
import { getBundledAppVersion } from '../shared/app-version'
import type { AppUpdateCheckResult, AppUpdateInstallResult, AppVersionInfo, AvailableAppUpdate } from '../shared/types'

let pendingUpdate: Update | null = null
let pendingGithubUpdate: AvailableAppUpdate | null = null

const GITHUB_REPO_URL = 'https://github.com/FingerCaster/PixAI-Tauri'
const GITHUB_LATEST_RELEASE_URL = 'https://github.com/FingerCaster/PixAI-Tauri/releases/latest'
const GITHUB_RELEASE_ASSETS_URL = 'https://github.com/FingerCaster/PixAI-Tauri/releases/expanded_assets'

export type AppUpdateDownloadProgress = {
  downloadedBytes: number | null
  contentLength: number | null
}

export class AppUpdateService {
  async getVersionInfo(): Promise<AppVersionInfo> {
    if (!isTauriRuntime()) {
      return {
        version: getBundledAppVersion(),
        platform: 'browser',
        runtime: 'browser'
      }
    }
    return {
      version: await getVersion(),
      platform: 'desktop',
      runtime: 'tauri',
      installerType: await getAppInstallerType()
    }
  }

  async check(): Promise<AppUpdateCheckResult> {
    const versionInfo = await this.getVersionInfo()
    if (!isTauriRuntime()) {
      throw new Error('更新检查仅在桌面应用中可用。')
    }
    const tauriResult = await checkTauriUpdater()
    pendingUpdate = tauriResult.update
    pendingGithubUpdate = null
    if (tauriResult.source === 'github') {
      const githubUpdate = await checkGithubRelease(versionInfo.version, versionInfo.installerType || 'unknown')
      pendingGithubUpdate = githubUpdate
      return {
        currentVersion: versionInfo.version,
        update: githubUpdate
      }
    }
    return {
      currentVersion: tauriResult.update?.currentVersion || versionInfo.version,
      update: tauriResult.update ? toAvailableAppUpdate(tauriResult.update) : null
    }
  }

  async downloadAndInstall(onProgress?: (progress: AppUpdateDownloadProgress) => void): Promise<AppUpdateInstallResult> {
    if (!isTauriRuntime()) throw new Error('更新安装仅在桌面应用中可用。')
    if (pendingGithubUpdate) {
      await openUrl(pendingGithubUpdate.downloadUrl || pendingGithubUpdate.releaseUrl || GITHUB_LATEST_RELEASE_URL)
      return { action: 'openedDownload' }
    }
    if (!pendingUpdate) {
      pendingUpdate = (await checkTauriUpdater()).update
    }
    if (!pendingUpdate) throw new Error('当前没有可安装的更新。')
    let downloadedBytes = 0
    await pendingUpdate.downloadAndInstall((event: DownloadEvent) => {
      if (event.event === 'Started') {
        downloadedBytes = 0
        onProgress?.({
          downloadedBytes,
          contentLength: event.data.contentLength ?? null
        })
      } else if (event.event === 'Progress') {
        downloadedBytes += event.data.chunkLength
        onProgress?.({
          downloadedBytes,
          contentLength: null
        })
      } else if (event.event === 'Finished') {
        onProgress?.({
          downloadedBytes,
          contentLength: null
        })
      }
    })
    return { action: 'installed' }
  }

  async relaunch(): Promise<void> {
    if (!isTauriRuntime()) throw new Error('重启应用仅在桌面应用中可用。')
    await relaunch()
  }
}

async function checkTauriUpdater(): Promise<{ source: 'tauri' | 'github'; update: Update | null }> {
  try {
    return {
      source: 'tauri',
      update: await check()
    }
  } catch (error) {
    const normalizedError = normalizeUpdateError(error)
    if (shouldFallbackToGithubRelease(normalizedError)) {
      return {
        source: 'github',
        update: null
      }
    }
    throw normalizedError
  }
}

async function checkGithubRelease(
  currentVersion: string,
  installerType: AppVersionInfo['installerType'] = 'unknown'
): Promise<AvailableAppUpdate | null> {
  const releaseHtml = await fetchGithubHtml(GITHUB_LATEST_RELEASE_URL, '检查失败')
  const releaseUrl = extractLatestReleaseUrl(releaseHtml) || GITHUB_LATEST_RELEASE_URL
  const releaseTag = extractReleaseTag(releaseUrl)
  if (!releaseTag) throw new Error('GitHub Release 检查失败：无法识别最新版本。')

  const latestVersion = normalizeVersion(releaseTag)
  if (!isVersionNewer(latestVersion, currentVersion)) return null

  const assets = await fetchGithubReleaseAssets(releaseTag)
  const installer = selectInstallerAsset(assets, installerType)
  return {
    version: latestVersion,
    date: extractPublishedDate(releaseHtml),
    notes: extractReleaseDescription(releaseHtml),
    rawJson: {
      source: 'github-release-page',
      releaseTag,
      releaseUrl,
      assets
    },
    installMode: 'github',
    releaseUrl,
    downloadUrl: installer?.browser_download_url || releaseUrl
  }
}

function toAvailableAppUpdate(update: Update): AvailableAppUpdate {
  return {
    version: update.version,
    date: update.date || null,
    notes: update.body || null,
    rawJson: update.rawJson,
    installMode: 'tauri',
    releaseUrl: null,
    downloadUrl: null
  }
}

function shouldFallbackToGithubRelease(error: Error): boolean {
  const message = error.message
  const lowerCaseMessage = message.toLowerCase()
  return message.includes('Updater does not have any endpoints set')
    || message.includes('EmptyEndpoints')
    || message.includes('Could not fetch a valid release JSON from the remote')
    || message.includes('ReleaseNotFound')
    || message.includes('HTTP status client error (404')
    || message.includes('status code: 404')
    || message.includes('latest.json')
    || lowerCaseMessage.includes('pubkey')
    || lowerCaseMessage.includes('public key')
    || lowerCaseMessage.includes('signature')
}

function selectInstallerAsset(
  assets: GithubReleaseAsset[],
  installerType: AppVersionInfo['installerType'] = 'unknown'
): GithubReleaseAsset | null {
  const isNsis = (asset: GithubReleaseAsset) => /_x64-setup\.exe$/i.test(asset.name)
  const isMsi = (asset: GithubReleaseAsset) => /\.msi$/i.test(asset.name)
  if (installerType === 'nsis') {
    return assets.find(isNsis)
      || assets.find(isMsi)
      || assets.find((asset) => /\.exe$/i.test(asset.name))
      || null
  }
  if (installerType === 'msi') {
    return assets.find(isMsi)
      || assets.find(isNsis)
      || assets.find((asset) => /\.exe$/i.test(asset.name))
      || null
  }
  return assets.find(isNsis)
    || assets.find(isMsi)
    || assets.find((asset) => /\.exe$/i.test(asset.name))
    || null
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '')
}

function isVersionNewer(candidate: string, current: string): boolean {
  const candidateParts = normalizeVersion(candidate).split(/[+-]/)[0].split('.').map((part) => Number(part) || 0)
  const currentParts = normalizeVersion(current).split(/[+-]/)[0].split('.').map((part) => Number(part) || 0)
  const length = Math.max(candidateParts.length, currentParts.length)
  for (let index = 0; index < length; index += 1) {
    const left = candidateParts[index] || 0
    const right = currentParts[index] || 0
    if (left > right) return true
    if (left < right) return false
  }
  return false
}

async function fetchGithubHtml(url: string, failureContext: string): Promise<string> {
  const response = await fetchJsonThroughPlatform(url, {
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml'
    }
  }, {
    timeoutMs: 20_000,
    firstByteTimeoutMs: 20_000
  })
  if (!response.ok) throw new Error(`GitHub Release ${failureContext}：HTTP ${response.status}`)
  return response.text()
}

async function fetchGithubReleaseAssets(releaseTag: string): Promise<GithubReleaseAsset[]> {
  try {
    const html = await fetchGithubHtml(
      `${GITHUB_RELEASE_ASSETS_URL}/${encodeURIComponent(releaseTag)}`,
      '安装包列表读取失败'
    )
    return extractReleaseAssets(html)
  } catch {
    return []
  }
}

function extractLatestReleaseUrl(html: string): string | null {
  const metadataUrl = getMetaContent(html, 'og:url') || getCanonicalHref(html)
  if (metadataUrl) return normalizeGithubUrl(metadataUrl)
  const match = /(?:https:\/\/github\.com)?\/FingerCaster\/PixAI-Tauri\/releases\/tag\/([^"'<>\s]+)/i.exec(html)
  if (!match) return null
  return `${GITHUB_REPO_URL}/releases/tag/${decodeHtmlEntities(match[1])}`
}

function extractReleaseTag(releaseUrl: string): string | null {
  const match = /\/FingerCaster\/PixAI-Tauri\/releases\/tag\/([^?#]+)/i.exec(releaseUrl)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function extractReleaseDescription(html: string): string | null {
  return getMetaContent(html, 'og:description') || getMetaContent(html, 'description')
}

function extractPublishedDate(html: string): string | null {
  const match = /<relative-time\b[^>]*datetime=(["'])(.*?)\1/i.exec(html)
  return match?.[2] ? decodeHtmlEntities(match[2]) : null
}

function extractReleaseAssets(html: string): GithubReleaseAsset[] {
  const assets: GithubReleaseAsset[] = []
  const seen = new Set<string>()
  for (const match of html.matchAll(/href=(["'])(.*?)\1/gi)) {
    const href = decodeHtmlEntities(match[2])
    if (!/\/FingerCaster\/PixAI-Tauri\/releases\/download\//i.test(href)) continue
    const browserDownloadUrl = normalizeGithubUrl(href)
    if (!browserDownloadUrl || seen.has(browserDownloadUrl)) continue
    seen.add(browserDownloadUrl)
    assets.push({
      name: decodeURIComponent(browserDownloadUrl.split('/').pop() || ''),
      browser_download_url: browserDownloadUrl
    })
  }
  return assets
}

function getMetaContent(html: string, name: string): string | null {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0]
    const property = getHtmlAttribute(tag, 'property') || getHtmlAttribute(tag, 'name')
    if (property !== name) continue
    const content = getHtmlAttribute(tag, 'content')
    if (content) return decodeHtmlEntities(content)
  }
  return null
}

function getCanonicalHref(html: string): string | null {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0]
    if (getHtmlAttribute(tag, 'rel') !== 'canonical') continue
    const href = getHtmlAttribute(tag, 'href')
    if (href) return decodeHtmlEntities(href)
  }
  return null
}

function getHtmlAttribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(tag)
  return match?.[2] || null
}

function normalizeGithubUrl(value: string): string {
  const decoded = decodeHtmlEntities(value)
  if (/^https?:\/\//i.test(decoded)) return decoded
  if (decoded.startsWith('/')) return `https://github.com${decoded}`
  return new URL(decoded, GITHUB_REPO_URL).toString()
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function normalizeUpdateError(error: unknown): Error {
  if (error instanceof Error && error.message.trim()) return error

  const details = extractErrorDetails(error)
  const message = [
    details.message,
    details.error,
    details.kind,
    details.code,
    details.status
  ].find((value) => typeof value === 'string' && value.trim())

  if (message) return new Error(message)
  return new Error(String(error || '检查更新失败'))
}

function extractErrorDetails(error: unknown): Record<string, string> {
  if (!error || typeof error !== 'object') return {}
  const source = error as Record<string, unknown>
  const details: Record<string, string> = {}
  for (const key of ['message', 'error', 'kind', 'code', 'status']) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) details[key] = value
  }
  return details
}

type GithubReleaseAsset = {
  name: string
  browser_download_url: string
}
