import { expect, test } from "@playwright/test";

test("persists JSON content without replacing the editor or losing undo", async ({ page }) => {
  const sentence = `A persisted voice-ready draft ${Date.now()}.`;
  const unsafeHeaderWarnings: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes('Refused to set unsafe header "content-length"')) {
      unsafeHeaderWarnings.push(message.text());
    }
  });
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
  expect(unsafeHeaderWarnings).toEqual([]);
});

test("records through the browser microphone and leaves the transcript reviewable", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  const editor = page.locator('[contenteditable="true"][aria-label="Document editor"]');
  await expect(editor).toBeVisible({ timeout: 10_000 });
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  const before = await editor.textContent();

  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByText(/Recording…/)).toBeVisible();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("Transcript ready to review")).toBeVisible({
    timeout: 10_000,
  });
  await expect(editor).toHaveText(before ?? "");

  await expect(page.getByRole("region", { name: "Proposed edit" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByText(/Heard:.*Replace the selection with clearer prose/),
  ).toBeVisible();
  await expect(editor).toHaveText(before ?? "");

  await page.getByRole("button", { name: "Apply" }).click();
  await expect(editor).toContainText("clearer prose");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(editor).toHaveText(before ?? "");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByText(/Recording…/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Ready to record")).toBeVisible();
  expect(errors).toEqual([]);
});
