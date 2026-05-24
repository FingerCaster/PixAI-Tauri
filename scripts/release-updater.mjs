#!/usr/bin/env node

import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const srcTauriDir = join(rootDir, 'src-tauri')
const targetBundleDir = join(srcTauriDir, 'target', 'release', 'bundle')
const tauriConfigPath = join(srcTauriDir, 'tauri.conf.json')
const releaseUpdaterDir = join(rootDir, 'artifacts', 'release-updater')
const keysDir = join(releaseUpdaterDir, 'keys')
const stagingDir = join(releaseUpdaterDir, 'staging')
const tempConfigPath = join(releaseUpdaterDir, 'tauri.release-updater.runtime.json')
const defaultKeyPath = join(keysDir, 'updater.key')
const keyPath = resolveKeyPath()
const pubKeyPath = `${keyPath}.pub`
const githubRepo = 'FingerCaster/PixAI-Tauri'
const githubReleaseBaseUrl = `https://github.com/${githubRepo}/releases/download`
const windowsMsiTarget = 'windows-x86_64-msi'
const windowsNsisTarget = 'windows-x86_64-nsis'
const onePasswordVault = readStringOption(process.env.PIXAI_1PASSWORD_VAULT) || 'PixAI Release'
const onePasswordPrivateKeyTitle = readStringOption(process.env.PIXAI_1PASSWORD_UPDATER_KEY_TITLE) || 'PixAI updater.key'
const onePasswordPublicKeyTitle = readStringOption(process.env.PIXAI_1PASSWORD_UPDATER_PUBKEY_TITLE) || 'PixAI updater.key.pub'

const command = process.argv[2] || 'help'
const options = parseArgs(process.argv.slice(3))

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

async function main() {
  switch (command) {
    case 'keygen':
      await ensureKeypair({ force: options.force === true })
      return
    case 'build':
      await buildReleaseUpdater()
      return
    case 'pull-key':
      await pullReleaseUpdaterKey()
      return
    case 'manifest':
      await stageReleaseUpdater()
      return
    case 'publish':
      await publishReleaseUpdater()
      return
    case 'help':
    case '--help':
    case '-h':
    default:
      printHelp()
  }
}

async function buildReleaseUpdater() {
  await ensureKeypair({ force: false })
  await assertConfiguredPubkey()
  const version = await resolveVersion()
  const tempConfig = {
    version,
    bundle: {
      createUpdaterArtifacts: true
    }
  }

  await ensureDir(releaseUpdaterDir)
  await writeFile(tempConfigPath, JSON.stringify(tempConfig, null, 2))

  console.log(`Building signed production updater package ${version}`)
  console.log(`Signing key: ${relative(rootDir, keyPath)}`)

  await runCommand('pnpm', [
    'tauri',
    'build',
    '--config',
    tempConfigPath,
    '--ci'
  ], {
    cwd: rootDir,
    env: {
      ...process.env,
      ...(process.env.TAURI_SIGNING_PRIVATE_KEY || process.env.TAURI_SIGNING_PRIVATE_KEY_PATH
        ? {}
        : { TAURI_SIGNING_PRIVATE_KEY_PATH: keyPath })
    }
  })

  console.log('Signed production build finished.')
}

async function pullReleaseUpdaterKey() {
  const outputKeyPath = keyPath
  const outputPubKeyPath = pubKeyPath

  await ensureDir(dirname(outputKeyPath))
  const privateKeyDocumentId = await resolveOnePasswordDocumentId(onePasswordPrivateKeyTitle)
  const publicKeyDocumentId = await resolveOnePasswordDocumentId(onePasswordPublicKeyTitle)

  console.log(`Pulling updater key from 1Password vault "${onePasswordVault}"`)
  await runCommand('op', [
    'document',
    'get',
    privateKeyDocumentId,
    '--vault',
    onePasswordVault,
    '--force',
    '--out-file',
    outputKeyPath
  ], { cwd: rootDir, env: process.env, shell: false })

  await runCommand('op', [
    'document',
    'get',
    publicKeyDocumentId,
    '--vault',
    onePasswordVault,
    '--force',
    '--out-file',
    outputPubKeyPath
  ], { cwd: rootDir, env: process.env, shell: false })

  console.log(`Private key: ${relative(rootDir, outputKeyPath)}`)
  console.log(`Public key: ${relative(rootDir, outputPubKeyPath)}`)
}

async function resolveOnePasswordDocumentId(title) {
  const raw = await runCommandCapture('op', [
    'item',
    'list',
    '--vault',
    onePasswordVault,
    '--categories',
    'DOCUMENT'
  ], {
    cwd: rootDir,
    env: {
      ...process.env,
      OP_FORMAT: 'json'
    },
    shell: false
  })
  const items = JSON.parse(raw || '[]')
  const match = items.find((item) => item?.title === title)
  if (!match?.id) {
    throw new Error(`1Password document "${title}" was not found in vault "${onePasswordVault}".`)
  }
  return match.id
}

async function stageReleaseUpdater() {
  await ensureKeypair({ force: false })
  await assertConfiguredPubkey()

  const version = await resolveVersion()
  const tag = resolveTag(version)
  const artifacts = await findUpdaterArtifacts(version)
  if (!artifacts.msi && !artifacts.nsis) {
    throw new Error(
      `No signed updater bundle found for version ${version}. Run "pnpm updater:release:build -- --version ${version}" first.`
    )
  }

  const releaseMetadata = await readReleaseMetadata(tag)
  const notes = readStringOption(options.notes)
    || releaseMetadata?.body?.trim()
    || `PixAI ${version}`
  const pubDate = readStringOption(options.pubDate)
    || releaseMetadata?.publishedAt
    || new Date().toISOString()

  const releaseDir = join(stagingDir, version)
  await rm(releaseDir, { recursive: true, force: true })
  await mkdir(releaseDir, { recursive: true })

  const platforms = {}
  const copiedAssets = []

  for (const [target, artifact] of [
    [windowsMsiTarget, artifacts.msi],
    [windowsNsisTarget, artifacts.nsis]
  ]) {
    if (!artifact) continue
    const destinationArtifact = join(releaseDir, artifact.filename)
    await cp(artifact.path, destinationArtifact)
    copiedAssets.push(destinationArtifact)
    const signature = (await readFile(artifact.signaturePath, 'utf8')).trim()
    platforms[target] = {
      url: `${githubReleaseBaseUrl}/${encodeURIComponent(tag)}/${artifact.filename}`,
      signature
    }
  }

  const manifestPath = join(releaseDir, 'latest.json')
  const latestJson = {
    version,
    notes,
    pub_date: pubDate,
    platforms
  }

  await writeFile(manifestPath, JSON.stringify(latestJson, null, 2))

  console.log(`Staged production updater manifest for ${version}`)
  console.log(`Manifest: ${relative(rootDir, manifestPath)}`)
  for (const assetPath of copiedAssets) {
    console.log(`Asset: ${relative(rootDir, assetPath)}`)
  }
  if (!releaseMetadata) {
    console.log(`Release metadata fallback: notes/pub_date were generated locally for tag ${tag}`)
  }

  return {
    tag,
    version,
    manifestPath,
    assetPaths: copiedAssets
  }
}

async function publishReleaseUpdater() {
  const { tag, version, manifestPath, assetPaths } = await stageReleaseUpdater()
  await requireGithubRelease(tag)

  console.log(`Uploading production updater assets to GitHub release ${tag}`)
  await runCommand('gh', [
    'release',
    'upload',
    tag,
    manifestPath,
    ...assetPaths,
    '--clobber'
  ], { cwd: rootDir, env: process.env })

  console.log(`Release ${tag} now includes latest.json for signed updater checks.`)
  console.log(`Endpoint: https://github.com/${githubRepo}/releases/latest/download/latest.json`)
  console.log(`Version: ${version}`)
}

async function assertConfiguredPubkey() {
  const tauriConfig = JSON.parse(await readFile(tauriConfigPath, 'utf8'))
  const configuredPubkey = tauriConfig?.plugins?.updater?.pubkey?.trim?.() || ''
  const configuredEndpoints = tauriConfig?.plugins?.updater?.endpoints || []
  const actualPubkey = (await readFile(pubKeyPath, 'utf8')).trim()

  if (!configuredPubkey) {
    throw new Error(
      `Missing plugins.updater.pubkey in src-tauri/tauri.conf.json. Expected ${actualPubkey}`
    )
  }
  if (configuredPubkey !== actualPubkey) {
    throw new Error(
      `Configured updater pubkey does not match ${relative(rootDir, pubKeyPath)}. Update src-tauri/tauri.conf.json before publishing.`
    )
  }
  if (!Array.isArray(configuredEndpoints) || !configuredEndpoints.some((value) => typeof value === 'string' && value.includes('latest.json'))) {
    throw new Error('src-tauri/tauri.conf.json must point updater endpoints at a latest.json release feed.')
  }
}

async function ensureKeypair({ force }) {
  if (!force && await pathExists(keyPath) && await pathExists(pubKeyPath)) {
    return
  }

  await ensureDir(keysDir)
  if (force) {
    await rm(keyPath, { force: true })
    await rm(pubKeyPath, { force: true })
  }

  console.log('Generating production updater signing key...')
  await runCommand('pnpm', [
    'tauri',
    'signer',
    'generate',
    '--write-keys',
    keyPath,
    '--ci'
  ], { cwd: rootDir, env: process.env })
}

async function resolveVersion() {
  const rawVersion = readStringOption(options.version)
  if (rawVersion) return normalizeVersion(rawVersion)
  const tauriConfig = JSON.parse(await readFile(tauriConfigPath, 'utf8'))
  return normalizeVersion(String(tauriConfig.version || '0.0.0'))
}

function resolveTag(version) {
  return readStringOption(options.tag) || version
}

async function readReleaseMetadata(tag) {
  try {
    const raw = await runCommandCapture('gh', [
      'release',
      'view',
      tag,
      '--json',
      'body,publishedAt,url'
    ], { cwd: rootDir, env: process.env, shell: false })
    const parsed = JSON.parse(raw || '{}')
    return {
      body: typeof parsed.body === 'string' ? parsed.body : '',
      publishedAt: typeof parsed.publishedAt === 'string' ? parsed.publishedAt : null,
      url: typeof parsed.url === 'string' ? parsed.url : null
    }
  } catch {
    return null
  }
}

async function requireGithubRelease(tag) {
  try {
    await runCommandCapture('gh', [
      'release',
      'view',
      tag,
      '--json',
      'tagName'
    ], { cwd: rootDir, env: process.env, shell: false })
  } catch {
    throw new Error(
      `GitHub release ${tag} does not exist yet. Create it first, then rerun "pnpm updater:release:publish -- --version ${tag} --tag ${tag}".`
    )
  }
}

async function findUpdaterArtifacts(version) {
  return {
    msi: await findMsiUpdaterArtifact(version),
    nsis: await findNsisUpdaterArtifact(version)
  }
}

async function findNsisUpdaterArtifact(version) {
  const nsisDir = join(targetBundleDir, 'nsis')
  const entries = await safeReaddir(nsisDir)
  const expectedPrefix = `PixAI_${version}_`

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!entry.name.startsWith(expectedPrefix)) continue
    if (!entry.name.endsWith('-setup.exe')) continue
    const artifactPath = join(nsisDir, entry.name)
    const signaturePath = `${artifactPath}.sig`
    if (!await pathExists(signaturePath)) continue
    return {
      filename: entry.name,
      path: artifactPath,
      signaturePath
    }
  }

  return null
}

async function findMsiUpdaterArtifact(version) {
  const msiDir = join(targetBundleDir, 'msi')
  const entries = await safeReaddir(msiDir)
  const expectedPrefix = `PixAI_${version}_`

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!entry.name.startsWith(expectedPrefix)) continue
    if (extname(entry.name).toLowerCase() !== '.msi') continue
    const artifactPath = join(msiDir, entry.name)
    const signaturePath = `${artifactPath}.sig`
    if (!await pathExists(signaturePath)) continue
    return {
      filename: entry.name,
      path: artifactPath,
      signaturePath
    }
  }

  return null
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true })
}

async function pathExists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function safeReaddir(path) {
  try {
    return await readdir(path, { withFileTypes: true })
  } catch {
    return []
  }
}

function normalizeVersion(version) {
  return String(version).trim().replace(/^v/i, '')
}

function resolveKeyPath() {
  const configuredPath = readStringOption(process.env.PIXAI_RELEASE_UPDATER_KEY_PATH)
    || readStringOption(process.env.TAURI_SIGNING_PRIVATE_KEY_PATH)
    || defaultKeyPath
  return resolve(rootDir, configuredPath)
}

function parseArgs(args) {
  const parsed = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument "${arg}". Use --name value.`)
    const eqIndex = arg.indexOf('=')
    const key = eqIndex >= 0 ? arg.slice(2, eqIndex) : arg.slice(2)
    const inlineValue = eqIndex >= 0 ? arg.slice(eqIndex + 1) : undefined
    const nextValue = inlineValue ?? args[index + 1]
    if (nextValue === undefined || nextValue.startsWith('--')) {
      parsed[key] = true
      continue
    }
    if (inlineValue === undefined) index += 1
    parsed[key] = nextValue
  }
  return parsed
}

function readStringOption(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function runCommand(command, args, { cwd, env, shell = true }) {
  const commandLine = [command, ...args].join(' ')
  await new Promise((resolvePromise, rejectPromise) => {
    const child = shell
      ? spawn(commandLine, [], {
        cwd,
        env,
        shell: true,
        stdio: 'inherit'
      })
      : spawn(command, args, {
      cwd,
      env,
      shell: false,
      stdio: 'inherit'
    })
    child.on('error', rejectPromise)
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise()
      } else {
        rejectPromise(new Error(`Command failed: ${commandLine}`))
      }
    })
  })
}

async function runCommandCapture(command, args, { cwd, env, shell = true }) {
  const commandLine = [command, ...args].join(' ')
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = shell
      ? spawn(commandLine, [], {
        cwd,
        env,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      : spawn(command, args, {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', rejectPromise)
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise(stdout.trim())
      } else {
        rejectPromise(new Error(stderr.trim() || `Command failed: ${commandLine}`))
      }
    })
  })
}

function printHelp() {
  console.log(`Production updater helper

Commands:
  pnpm updater:release:keygen
  pnpm updater:release:pull-key
  pnpm updater:release:build -- --version 0.0.3
  pnpm updater:release:manifest -- --version 0.0.3 --tag 0.0.3
  pnpm updater:release:publish -- --version 0.0.3 --tag 0.0.3

Notes:
  - Keep artifacts/release-updater/keys/updater.key private and stable across releases.
  - pull-key reads "PixAI updater.key" and "PixAI updater.key.pub" from the "PixAI Release" vault by default.
  - src-tauri/tauri.conf.json must contain the matching updater public key.
  - publish uploads latest.json plus the matching MSI / NSIS installers to an existing GitHub release.
`)
}
