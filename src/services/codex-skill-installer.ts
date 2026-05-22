import { getCodexSkillStatus, installCodexSkill } from '../lib/platform'
import type { CodexSkillInstallRequest, CodexSkillStatus } from '../shared/types'

export const PIXAI_CODEX_SKILL_NAME = 'pixai-image-workbench'

export async function getPixaiCodexSkillStatus(): Promise<CodexSkillStatus> {
  return getCodexSkillStatus(PIXAI_CODEX_SKILL_NAME)
}

export async function installPixaiCodexSkill(): Promise<CodexSkillStatus> {
  return installCodexSkill(buildPixaiCodexSkill())
}

export function buildPixaiCodexSkill(): CodexSkillInstallRequest {
  return {
    name: PIXAI_CODEX_SKILL_NAME,
    files: [
      {
        relativePath: 'SKILL.md',
        content: `${PIXAI_SKILL_MD.trim()}\n`
      },
      {
        relativePath: 'scripts/pixai-codex.mjs',
        content: `${PIXAI_CODEX_SCRIPT.trim()}\n`
      },
      {
        relativePath: 'agents/openai.yaml',
        content: `${PIXAI_OPENAI_YAML.trim()}\n`
      }
    ]
  }
}

const PIXAI_OPENAI_YAML = String.raw`
interface:
  display_name: "PixAI Image Workbench"
  short_description: "Route Codex image tasks through PixAI"
  default_prompt: "Use $pixai-image-workbench to generate one image through the local PixAI desktop workbench."

policy:
  allow_implicit_invocation: true
`

const PIXAI_SKILL_MD = String.raw`
---
name: pixai-image-workbench
description: Route image generation, image editing, prompt inspiration, prompt enrichment, gallery lookup, and image export through the local PixAI desktop workbench via PixAI Codex Bridge. Use when the user asks Codex to generate or edit images with PixAI, use the PixAI workbench, call PixAI Bridge, manage PixAI generated images, or avoid the default image-generation tool in favor of the local desktop app.
---

# PixAI Image Workbench

Use the running PixAI desktop app as Codex's image workbench through its local Codex Bridge.

## Bridge

- Default bridge URL: http://127.0.0.1:43117.
- Override with PIXAI_CODEX_URL when the app is launched on another local port.
- The PixAI desktop app must be running before using this skill.
- Make one bridge request at a time. Wait for a response before issuing the next generation, prompt, or gallery operation.
- Start every task with a health check:
  node "$CODEX_HOME/skills/pixai-image-workbench/scripts/pixai-codex.mjs" health

## Commands

Prefer the bundled client:

    node "$CODEX_HOME/skills/pixai-image-workbench/scripts/pixai-codex.mjs" health
    node "$CODEX_HOME/skills/pixai-image-workbench/scripts/pixai-codex.mjs" generate --prompt "a clean product photo" --ratio 1:1 --n 1
    node "$CODEX_HOME/skills/pixai-image-workbench/scripts/pixai-codex.mjs" inspire
    node "$CODEX_HOME/skills/pixai-image-workbench/scripts/pixai-codex.mjs" enrich --prompt "short prompt"
    node "$CODEX_HOME/skills/pixai-image-workbench/scripts/pixai-codex.mjs" history --limit 5
    node "$CODEX_HOME/skills/pixai-image-workbench/scripts/pixai-codex.mjs" image --id <historyId>
    node "$CODEX_HOME/skills/pixai-image-workbench/scripts/pixai-codex.mjs" reedit --id <historyId> --prompt "make it dusk"

If CODEX_HOME is unset, use the equivalent path under ~/.codex/skills/pixai-image-workbench/scripts/pixai-codex.mjs.

## Workflow

1. Run health. If it fails, tell the user to open PixAI desktop and keep the bridge enabled.
2. For text-to-image, call generate with --prompt, --ratio, --n, and optional --model, --quality, --size, --outputFormat, --background, or --moderation.
3. For image editing, use reedit --id <historyId> for an existing PixAI image, or generate --referenceImagePaths "C:\path\image.png" --prompt "..." for local references.
4. For prompt help, call inspire for a fresh prompt or enrich --prompt "..." to expand a draft.
5. Report the returned items[].id and items[].bridgeFileUrl so the image can be inspected or reused.
6. Use history, image, favorite, delete, or export when the user asks to manage generated images.

Do not use external image-generation tools for PixAI-routed tasks unless the bridge is unavailable and the user explicitly chooses a fallback.
`

const PIXAI_CODEX_SCRIPT = String.raw`
#!/usr/bin/env node

const DEFAULT_BASE_URL = process.env.PIXAI_CODEX_URL || 'http://127.0.0.1:43117'

const commands = new Map([
  ['health', { method: 'GET', path: '/health' }],
  ['settings', { method: 'GET', path: '/settings' }],
  ['conversations', { method: 'GET', path: '/conversations' }],
  ['history', { method: 'GET', path: '/history', query: true }],
  ['generate', { method: 'POST', path: '/generate', body: true }],
  ['reedit', { method: 'POST', path: ({ id }) => '/images/' + encodeURIComponent(id) + '/reedit', id: true, body: true }],
  ['image', { method: 'GET', path: ({ id }) => '/images/' + encodeURIComponent(id), id: true }],
  ['delete', { method: 'DELETE', path: ({ id }) => '/images/' + encodeURIComponent(id), id: true }],
  ['favorite', { method: 'PATCH', path: ({ id }) => '/images/' + encodeURIComponent(id) + '/favorite', id: true, body: true }],
  ['export', { method: 'POST', path: '/images/export', body: true }],
  ['inspire', { method: 'POST', path: '/prompt/inspire', body: true, optionalBody: true }],
  ['enrich', { method: 'POST', path: '/prompt/enrich', body: true }]
])

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

async function main() {
  const [commandName, ...args] = process.argv.slice(2)
  if (!commandName || commandName === 'help' || commandName === '--help' || commandName === '-h') {
    printHelp()
    return
  }

  const command = commands.get(commandName)
  if (!command) throw new Error('Unknown command "' + commandName + '". Run: node scripts/pixai-codex.mjs help')

  const options = parseArgs(args)
  const baseUrl = String(options.url || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const id = command.id ? readRequiredOption(options, 'id') : undefined
  const path = typeof command.path === 'function' ? command.path({ id }) : command.path
  const url = new URL(baseUrl + path)

  if (command.query) {
    for (const key of ['query', 'sort', 'favoritesOnly', 'status', 'limit', 'offset', 'model', 'ratio', 'quality']) {
      if (options[key] !== undefined) url.searchParams.set(key, String(options[key]))
    }
  }

  const init = { method: command.method, headers: {} }
  if (command.body) {
    const body = await buildBody(options, command.optionalBody)
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
  }

  const response = await fetch(url, init)
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'PixAI Codex Bridge returned HTTP ' + response.status + '.')
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  const text = await response.text()
  if (!response.ok) throw new Error(text || 'PixAI Codex Bridge returned HTTP ' + response.status + '.')
  process.stdout.write(text)
}

function parseArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('--')) throw new Error('Unexpected argument "' + arg + '". Options must use --name value.')
    const eqIndex = arg.indexOf('=')
    const key = eqIndex >= 0 ? arg.slice(2, eqIndex) : arg.slice(2)
    const inlineValue = eqIndex >= 0 ? arg.slice(eqIndex + 1) : undefined
    const rawValue = inlineValue ?? args[index + 1]
    if (rawValue === undefined || rawValue.startsWith('--')) {
      options[key] = true
      continue
    }
    if (inlineValue === undefined) index += 1
    options[key] = parseOptionValue(rawValue)
  }
  return options
}

function parseOptionValue(value) {
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null') return null
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value)
  return value
}

async function buildBody(options, optionalBody = false) {
  if (options.json !== undefined) return JSON.parse(String(options.json))
  if (options.file !== undefined) {
    const { readFile } = await import('node:fs/promises')
    return JSON.parse(await readFile(String(options.file), 'utf8'))
  }

  const body = {}
  for (const [key, value] of Object.entries(options)) {
    if (key === 'url' || key === 'id') continue
    body[key] = normalizeBodyValue(key, value)
  }

  if (Object.keys(body).length === 0) {
    if (optionalBody) return {}
    throw new Error("This command needs a JSON body. Use --json '" + JSON.stringify({ prompt: '...' }) + "' or --file request.json.")
  }
  return body
}

function normalizeBodyValue(key, value) {
  if (['referenceImageIds', 'referenceHistoryIds', 'referenceImagePaths', 'ids'].includes(key)) {
    if (Array.isArray(value)) return value
    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return value
}

function readRequiredOption(options, key) {
  const value = options[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error('Missing required option --' + key + '.')
  return value
}

function printHelp() {
  console.log([
    'PixAI Codex Bridge client',
    '',
    'The PixAI desktop app must be running. Default bridge URL: ' + DEFAULT_BASE_URL,
    '',
    'Commands:',
    '  health',
    '  settings',
    '  conversations',
    '  history [--query text] [--sort newest|oldest] [--favoritesOnly true] [--status succeeded|failed]',
    '  generate --json ' + JSON.stringify({ prompt: 'a glass greenhouse', ratio: '1:1', n: 1 }),
    '  generate --prompt "a glass greenhouse" --ratio 1:1 --n 1',
    '  reedit --id <historyId> --json ' + JSON.stringify({ prompt: 'make it dusk' }),
    '  image --id <historyId>',
    '  favorite --id <historyId> --favorite true',
    '  delete --id <historyId>',
    '  export --ids id1,id2 --directory C:\\Temp\\PixAI',
    '  inspire',
    '  enrich --prompt "short prompt"',
    '',
    'Global:',
    '  --url http://127.0.0.1:43117'
  ].join('\n'))
}
`
