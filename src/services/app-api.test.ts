import { invoke } from '@tauri-apps/api/core'
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPixaiApi } from './app-api'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: vi.fn(),
  revealItemInDir: vi.fn()
}))

describe('pixaiApi shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to the native directory opener when the Tauri opener plugin rejects a path', async () => {
    vi.mocked(openPath).mockRejectedValue(new Error('opener denied'))
    vi.mocked(invoke).mockResolvedValue(undefined)

    await expect(createPixaiApi().shell.openPath('E:\\SingleExports')).resolves.toBeUndefined()

    expect(openPath).toHaveBeenCalledWith('E:\\SingleExports')
    expect(invoke).toHaveBeenCalledWith('open_directory', { path: 'E:\\SingleExports' })
  })

  it('reports the original opener error when the native directory fallback also fails', async () => {
    vi.mocked(openPath).mockRejectedValue(new Error('opener denied'))
    vi.mocked(invoke).mockRejectedValue(new Error('missing folder'))

    await expect(createPixaiApi().shell.openPath('E:\\Missing')).rejects.toThrow('opener denied')
  })

  it('falls back to the native reveal command when the Tauri opener plugin rejects paths', async () => {
    vi.mocked(revealItemInDir).mockRejectedValue(new Error('reveal denied'))
    vi.mocked(invoke).mockResolvedValue(undefined)

    await expect(createPixaiApi().shell.revealPaths(['E:\\SingleExports\\image.png'])).resolves.toBeUndefined()

    expect(revealItemInDir).toHaveBeenCalledWith(['E:\\SingleExports\\image.png'])
    expect(invoke).toHaveBeenCalledWith('reveal_paths', { paths: ['E:\\SingleExports\\image.png'] })
  })

  it('ignores empty reveal paths', async () => {
    await expect(createPixaiApi().shell.revealPaths(['', '  '])).resolves.toBeUndefined()

    expect(revealItemInDir).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })
})
