import { expect, test } from "@playwright/test";

test("persists a rich-text edit through the real server", async ({ page }) => {
  const sentence = `A persisted voice-ready draft ${Date.now()}.`;
  await page.goto("/");
  const retry = page.getByRole("button", { name: "Try again" });
  const editor = page.locator('[contenteditable="true"][aria-label="Document editor"]');
  await expect(editor.or(retry)).toBeVisible({ timeout: 10_000 });
  if (await retry.isVisible()) await retry.click();
  await expect(editor).toBeVisible({ timeout: 10_000 });
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(sentence);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.locator('[contenteditable="true"][aria-label="Document editor"]')).toContainText(sentence);
});
