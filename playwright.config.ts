import { defineConfig } from '@playwright/test';

/**
 * 默认通过 `vite preview` 在本地启动被测页面；
 * 在 Docker 的 verify 服务中设置 E2E_BASE_URL=http://web 直接访问 web 容器。
 */
const externalBaseURL = process.env.E2E_BASE_URL;
const baseURL = externalBaseURL ?? 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL,
  },
  webServer: externalBaseURL
    ? undefined
    : {
        command: 'npm run preview -- --port 4173 --strictPort --host 127.0.0.1',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
