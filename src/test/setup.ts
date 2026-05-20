import { afterEach } from 'vitest'
import { __resetPlatformStateForTests } from '../lib/platform'

afterEach(() => {
  __resetPlatformStateForTests()
})
