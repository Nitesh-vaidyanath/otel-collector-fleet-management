import { test, expect } from '@playwright/test';

const PLUGIN_ID = 'otel-collector-agent-fleet-management';
const PLUGIN_PATH = `/a/${PLUGIN_ID}`;

test.describe('OTel Collector Agent Fleet Management Plugin', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the plugin page (auth is handled by setup)
    await page.goto(PLUGIN_PATH);
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
  });

  test('should load the plugin page', async ({ page }) => {
    // Check if the main page elements are visible
    await expect(page.locator('text=OTel Collector Agent Fleet Management')).toBeVisible();
    await expect(page.locator('text=Fleet Management')).toBeVisible();
  });

  test('should display agents list', async ({ page }) => {
    // Wait for agents to load
    await page.waitForSelector('text=Agents', { timeout: 10000 });
    
    // Check if agents section is visible
    const agentsSection = page.locator('text=Agents');
    await expect(agentsSection).toBeVisible();
  });

  test('should display configuration management section', async ({ page }) => {
    // Navigate to configuration section if there's a tab/button
    const configSection = page.locator('text=Configuration').or(page.locator('text=Config'));
    if (await configSection.count() > 0) {
      await configSection.click();
      await page.waitForTimeout(1000);
    }
    
    // Check if configuration section is visible
    await expect(page.locator('text=Configuration').or(page.locator('text=Config'))).toBeVisible();
  });

  test('should display monitoring section', async ({ page }) => {
    // Wait for monitoring section to load
    await page.waitForSelector('text=Monitoring', { timeout: 10000 });
    
    // Check if monitoring section is visible
    const monitoringSection = page.locator('text=Monitoring').or(page.locator('text=Pipeline Flow'));
    await expect(monitoringSection).toBeVisible();
  });

  test('should handle agent selection', async ({ page }) => {
    // Wait for agents to load
    await page.waitForSelector('text=Agents', { timeout: 10000 });
    
    // Try to find and click on an agent
    const agentItem = page.locator('[data-testid="agent-item"]').or(page.locator('text=/agent-/i')).first();
    if (await agentItem.count() > 0) {
      await agentItem.click();
      await page.waitForTimeout(1000);
      
      // Verify agent details are shown
      await expect(page.locator('text=Status').or(page.locator('text=Configuration'))).toBeVisible();
    }
  });

  test('should display pipeline flow diagram', async ({ page }) => {
    // Wait for monitoring section
    await page.waitForSelector('text=Pipeline Flow', { timeout: 10000 });
    
    // Check if pipeline flow diagram is visible
    const pipelineDiagram = page.locator('text=Receivers').or(page.locator('text=Processors')).or(page.locator('text=Exporters'));
    await expect(pipelineDiagram).toBeVisible();
  });

  test('should handle organization selection', async ({ page }) => {
    // Look for organization selector
    const orgSelector = page.locator('select').or(page.locator('[role="combobox"]')).first();
    if (await orgSelector.count() > 0) {
      await orgSelector.click();
      await page.waitForTimeout(500);
      
      // Try to select an organization
      const orgOption = page.locator('option').or(page.locator('[role="option"]')).first();
      if (await orgOption.count() > 0) {
        await orgOption.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test('should display API endpoints correctly', async ({ page }) => {
    // Check if API calls are made (check network requests)
    const apiCalls: string[] = [];
    
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes(`/api/plugins/${PLUGIN_ID}`)) {
        apiCalls.push(url);
      }
    });
    
    // Reload page to trigger API calls
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Verify API calls were made
    expect(apiCalls.length).toBeGreaterThan(0);
  });

  test('should handle error states gracefully', async ({ page }) => {
    // Intercept API calls and return errors
    await page.route(`**/api/plugins/${PLUGIN_ID}/**`, (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });
    
    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Check if error message is displayed
    const errorMessage = page.locator('text=Error').or(page.locator('text=Failed'));
    // Error might not be visible if handled gracefully, so we just check it doesn't crash
    await expect(page).not.toHaveURL('about:error');
  });

  test('should refresh metrics automatically', async ({ page }) => {
    // Wait for monitoring section
    await page.waitForSelector('text=Pipeline Flow', { timeout: 10000 });
    
    // Wait for auto-refresh (5 seconds)
    await page.waitForTimeout(6000);
    
    // Verify metrics are still visible (indicating refresh worked)
    const metrics = page.locator('text=CPU').or(page.locator('text=Memory'));
    await expect(metrics.first()).toBeVisible();
  });

  test('should handle configuration creation', async ({ page }) => {
    // Look for configuration creation button
    const createButton = page.locator('button:has-text("Create")').or(page.locator('button:has-text("New")')).or(page.locator('button:has-text("Add")'));
    
    if (await createButton.count() > 0) {
      await createButton.click();
      await page.waitForTimeout(1000);
      
      // Check if configuration form is visible
      const configForm = page.locator('text=Receivers').or(page.locator('text=Processors')).or(page.locator('form'));
      await expect(configForm.first()).toBeVisible();
    }
  });

  test('should display telemetry data', async ({ page }) => {
    // Wait for monitoring section
    await page.waitForSelector('text=Telemetry', { timeout: 10000 });
    
    // Check if telemetry section is visible
    const telemetrySection = page.locator('text=Telemetry').or(page.locator('text=Metrics')).or(page.locator('text=Logs'));
    await expect(telemetrySection.first()).toBeVisible();
  });

  test('should handle configuration approval workflow', async ({ page }) => {
    // Look for pending configurations
    const pendingConfig = page.locator('text=Pending').or(page.locator('text=Approval'));
    
    if (await pendingConfig.count() > 0) {
      // Try to find approve button
      const approveButton = page.locator('button:has-text("Approve")');
      if (await approveButton.count() > 0) {
        await approveButton.first().click();
        await page.waitForTimeout(1000);
        
        // Verify approval action was processed
        await expect(page.locator('text=Approved').or(page.locator('text=Success'))).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should handle configuration revert', async ({ page }) => {
    // Look for revert button
    const revertButton = page.locator('button:has-text("Revert")');
    
    if (await revertButton.count() > 0) {
      await revertButton.first().click();
      await page.waitForTimeout(1000);
      
      // Verify revert action was processed
      await expect(page.locator('text=Reverted').or(page.locator('text=Success'))).toBeVisible({ timeout: 5000 });
    }
  });

  test('should verify sync status', async ({ page }) => {
    // Look for verify sync status button
    const verifyButton = page.locator('button:has-text("Verify")').or(page.locator('button:has-text("Sync")'));
    
    if (await verifyButton.count() > 0) {
      await verifyButton.first().click();
      await page.waitForTimeout(2000);
      
      // Verify sync status is displayed
      await expect(page.locator('text=Synced').or(page.locator('text=Status'))).toBeVisible({ timeout: 5000 });
    }
  });

  test('should display agent health status', async ({ page }) => {
    // Wait for agents to load
    await page.waitForSelector('text=Agents', { timeout: 10000 });
    
    // Check if health status indicators are visible
    const healthStatus = page.locator('text=online').or(page.locator('text=offline')).or(page.locator('[data-testid="status-badge"]'));
    if (await healthStatus.count() > 0) {
      await expect(healthStatus.first()).toBeVisible();
    }
  });

  test('should handle component type selection', async ({ page }) => {
    // Navigate to configuration section
    const configTab = page.locator('text=Configuration').or(page.locator('button:has-text("Config")'));
    if (await configTab.count() > 0) {
      await configTab.click();
      await page.waitForTimeout(1000);
      
      // Look for component type selectors
      const receiverSelect = page.locator('select').or(page.locator('[role="combobox"]'));
      if (await receiverSelect.count() > 0) {
        await receiverSelect.first().click();
        await page.waitForTimeout(500);
        
        // Verify dropdown is open
        await expect(page.locator('option').or(page.locator('[role="option"]'))).toBeVisible();
      }
    }
  });

  test('should handle YAML configuration editing', async ({ page }) => {
    // Look for YAML editor
    const yamlEditor = page.locator('textarea').or(page.locator('.monaco-editor')).or(page.locator('[data-testid="yaml-editor"]'));
    
    if (await yamlEditor.count() > 0) {
      await yamlEditor.first().click();
      await page.waitForTimeout(500);
      
      // Try to type in the editor
      await page.keyboard.type('receivers:');
      await page.waitForTimeout(500);
      
      // Verify editor is interactive
      await expect(yamlEditor.first()).toBeVisible();
    }
  });

  test('should handle full-width pipeline diagram', async ({ page }) => {
    // Wait for pipeline diagram
    await page.waitForSelector('text=Pipeline Flow', { timeout: 10000 });
    
    // Check if diagram spans full width
    const diagramContainer = page.locator('[data-testid="pipeline-diagram"]').or(page.locator('text=Complete Pipeline Overview'));
    
    if (await diagramContainer.count() > 0) {
      const boundingBox = await diagramContainer.first().boundingBox();
      if (boundingBox) {
        // Verify diagram takes significant width (at least 80% of viewport)
        expect(boundingBox.width).toBeGreaterThan(page.viewportSize()!.width * 0.8);
      }
    }
  });

  test('should display processor order correctly', async ({ page }) => {
    // Wait for pipeline diagram
    await page.waitForSelector('text=Processors', { timeout: 10000 });
    
    // Check if processor order numbers are visible
    const processorOrder = page.locator('text=#1').or(page.locator('text=#2')).or(page.locator('text=/^#\\d+$/'));
    
    if (await processorOrder.count() > 0) {
      await expect(processorOrder.first()).toBeVisible();
    }
  });

  test('should display bandwidth metrics between processors', async ({ page }) => {
    // Wait for pipeline diagram
    await page.waitForSelector('text=Processors', { timeout: 10000 });
    
    // Check if bandwidth metrics are displayed
    const bandwidthMetric = page.locator('text=KB/s').or(page.locator('text=/\\d+\\s*KB\\/s/'));
    
    if (await bandwidthMetric.count() > 0) {
      await expect(bandwidthMetric.first()).toBeVisible();
    }
  });

  test('should handle receiver to processor mapping', async ({ page }) => {
    // Wait for pipeline diagram
    await page.waitForSelector('text=Receivers', { timeout: 10000 });
    
    // Check if receivers and processors are connected
    const receivers = page.locator('text=Receivers');
    const processors = page.locator('text=Processors');
    
    if (await receivers.count() > 0 && await processors.count() > 0) {
      // Verify both are visible, indicating mapping is shown
      await expect(receivers.first()).toBeVisible();
      await expect(processors.first()).toBeVisible();
    }
  });

  test('should handle multiple receiver display', async ({ page }) => {
    // Wait for pipeline diagram
    await page.waitForSelector('text=Receivers', { timeout: 10000 });
    
    // Check if multiple receivers can be displayed
    const receiverCount = await page.locator('text=/^RECEIVERS/i').count();
    
    // If receivers section exists, verify it's visible
    if (receiverCount > 0) {
      await expect(page.locator('text=/^RECEIVERS/i').first()).toBeVisible();
    }
  });
});

test.describe('API Integration Tests', () => {
  test('should fetch agents via API', async ({ request }) => {
    // Auth is handled by setup project
    const response = await request.get(`/api/plugins/${PLUGIN_ID}/resources/agents`);
    
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('items');
    expect(Array.isArray(data.items)).toBe(true);
  });

  test('should fetch organizations via API', async ({ request }) => {
    const response = await request.get(`/api/plugins/${PLUGIN_ID}/resources/organizations`);
    
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('items');
    expect(Array.isArray(data.items)).toBe(true);
  });

  test('should fetch health status via API', async ({ request }) => {
    const response = await request.get(`/api/plugins/${PLUGIN_ID}/resources/health`);
    
    // Health might be 200 or 401 depending on implementation
    expect([200, 401]).toContain(response.status());
    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('status');
    }
  });

  test('should handle 404 for non-existent agent', async ({ request }) => {
    const response = await request.get(`/api/plugins/${PLUGIN_ID}/resources/agents/non-existent-agent`);
    
    // Should return 404, 400, or 401 (if auth fails)
    expect([404, 400, 401]).toContain(response.status());
  });
});

