import path from 'path';
import fs from 'fs';
import { test as setup, expect } from '@playwright/test';

const authFile = path.resolve(__dirname, '../../..', 'tests', 'e2e', 'playwright', '.auth', 'user.json');

setup('authenticate', async ({ page, request }) => {
  // Login via UI
  await page.goto('/login');
  await page.fill('input[name="user"]', process.env.GRAFANA_USER || 'admin');
  await page.fill('input[name="password"]', process.env.GRAFANA_PASS || 'admin');
  await page.click('button[type="submit"]');
  
  // Wait for login to complete
  await page.waitForURL('**/dashboard**', { timeout: 10000 }).catch(() => {
    // If redirect doesn't happen, check if already logged in
  });
  
  // Ensure storage directory exists
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  // Save authentication state
  await page.context().storageState({ path: authFile });
  
  // Verify authentication works
  const response = await request.get('/api/user');
  expect(response.status()).toBe(200);
});

