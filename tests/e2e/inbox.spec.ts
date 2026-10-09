import { test, expect } from '@playwright/test';

test('adds a task from the week planner without AI', async ({ page }) => {
  const text = `测试任务 ${Date.now()}`;
  await page.goto('/?view=week');
  await page.getByPlaceholder('输入一个任务……').fill(text);
  await page.getByRole('button', { name: '添加', exact: true }).click();
  await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
});
