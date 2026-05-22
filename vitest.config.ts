import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    exclude: ['**/node_modules/**', '**/dist/**', '**/src-tauri/target/**', '**/.omx/**'],
    globals: true,
    restoreMocks: true,
    setupFiles: ['./src/test/setup.ts']
  }
})
