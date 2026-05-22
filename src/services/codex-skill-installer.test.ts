import { describe, expect, it } from 'vitest'
import { buildPixaiCodexSkill, PIXAI_CODEX_SKILL_NAME } from './codex-skill-installer'

describe('codex skill installer payload', () => {
  it('builds a valid PixAI image workbench skill bundle', () => {
    const bundle = buildPixaiCodexSkill()
    const files = new Map(bundle.files.map((file) => [file.relativePath, file.content]))

    expect(bundle.name).toBe(PIXAI_CODEX_SKILL_NAME)
    expect(files.get('SKILL.md')).toContain('name: pixai-image-workbench')
    expect(files.get('SKILL.md')).toContain('PixAI Codex Bridge')
    expect(files.get('scripts/pixai-codex.mjs')).toContain("const DEFAULT_BASE_URL = process.env.PIXAI_CODEX_URL")
    expect(files.get('scripts/pixai-codex.mjs')).toContain("['generate', { method: 'POST', path: '/generate'")
    expect(files.get('agents/openai.yaml')).toContain('display_name: "PixAI Image Workbench"')
  })
})
