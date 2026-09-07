import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  use: {
    baseURL: 'http://localhost:5177',
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: 'npm run dev -- --port 5177',
    url: 'http://localhost:5177',
    reuseExistingServer: true,
  },
})
