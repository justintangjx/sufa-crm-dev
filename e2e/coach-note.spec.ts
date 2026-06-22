import { expect, test } from "@playwright/test";

test("coach structures grounded notes without an automatic recommendation", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("coach@sufa.test");
  await page.getByRole("button", { name: "Send magic link" }).click();

  await expect(page.getByRole("heading", { name: "Coach Dashboard" })).toBeVisible();
  await page.goto("/coach/evaluations/c-sea/a-alice");

  await expect(page.getByRole("heading", { name: "Evaluation copilot" })).toBeVisible();
  await page
    .getByLabel("Paste rough notes")
    .fill("Strong hucks and accurate throws. Needs tighter reset defense. Selected for the squad.");
  await page.getByRole("button", { name: "Structure notes" }).click();

  await expect(
    page.getByText("Notes structured into a draft. Review before saving."),
  ).toBeVisible();
  await expect(page.getByLabel("Strengths")).toHaveValue("Strong hucks and accurate throws");
  await expect(page.getByLabel("Development areas")).toHaveValue("Needs tighter reset defense");
  await expect(page.getByLabel("Recommendation")).toHaveValue("");

  await expect(page.getByText("Your prior evaluations for this athlete")).toBeVisible();
  await expect(page.getByText("U24 Nationals 2025")).toBeVisible();

  await page.getByText("Review grounding evidence").click();
  await expect(page.getByText(/Evidence: "Strong hucks and accurate throws"/)).toBeVisible();
  await expect(page.getByText("Needs coach clarification")).toBeVisible();

  await page.getByRole("button", { name: "Useful" }).click();
  await expect(page.getByRole("button", { name: "Useful" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
