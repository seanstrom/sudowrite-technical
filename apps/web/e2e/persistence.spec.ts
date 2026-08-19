import { expect, test } from "@playwright/test";

test("persists JSON content without replacing the editor or losing undo", async ({ page }) => {
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
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(editor).not.toContainText(sentence);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(editor).toContainText(sentence);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.locator('[contenteditable="true"][aria-label="Document editor"]')).toContainText(sentence);
});

test("reviews and explicitly applies one server-proposed editor command", async ({ page }) => {
  await page.goto("/");
  const editor = page.locator('[contenteditable="true"][aria-label="Document editor"]');
  await expect(editor).toBeVisible({ timeout: 10_000 });
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByLabel("Editing instruction").fill("replace the selection with A reviewed proposal");
  await page.getByRole("button", { name: "Review command" }).click();
  await expect(page.getByRole("region", { name: "Proposed edit" })).toBeVisible();
  await expect(editor).not.toContainText("A reviewed proposal");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(editor).toContainText("A reviewed proposal");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(editor).not.toContainText("A reviewed proposal");
});
