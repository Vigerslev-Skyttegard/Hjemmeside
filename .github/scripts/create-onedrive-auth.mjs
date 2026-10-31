
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const SHARE_URL =
  "https://1drv.ms/x/c/4560751afe576670/IQBwZlf-GnVgIIBFLAMAAAAAAacgNjZehh4H7Nvmzuz5pZA?e=VpDpPb";

const AUTH_FILE = "playwright/.auth/onedrive.json";

async function ask(question) {
  const terminal = createInterface({ input: stdin, output: stdout });
  const answer = await terminal.question(question);
  terminal.close();
  return answer;
}

async function main() {
  const email = process.env.ONEDRIVE_EMAIL;
  const password = process.env.ONEDRIVE_PASSWORD;

  if (!email || !password) {
    throw new Error("Set ONEDRIVE_EMAIL and ONEDRIVE_PASSWORD first.");
  }

  await mkdir("playwright/.auth", { recursive: true });

  const browser = await chromium.launch({ headless: false });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log("Opening Microsoft sign-in...");
    await page.goto(SHARE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 90000
    });

    // Email step, if Microsoft presents it.
    const emailField = page.locator(
      'input[type="email"], input[name="loginfmt"]'
    ).first();

    if (await emailField.isVisible().catch(() => false)) {
      await emailField.fill(email);

      const next = page.locator(
        'input[type="submit"], button[type="submit"], #idSIButton9'
      ).first();

      await next.click();
    }

    // Password step, if Microsoft presents it.
    const passwordField = page.locator(
      'input[type="password"], input[name="passwd"]'
    ).first();

    if (await passwordField.waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false)) {
      await passwordField.fill(password);

      const signIn = page.locator(
        'input[type="submit"], button[type="submit"], #idSIButton9'
      ).first();

      await signIn.click();
    }

    console.log("\nComplete any Microsoft security checks now.");
    console.log("Approve Authenticator, enter your code, or complete other MFA.");
    console.log("Wait until your Excel workbook is visible.");

    await ask("\nWhen the workbook is open, press ENTER here: ");

    if (/login\.live\.com|login\.microsoftonline\.com/i.test(page.url())) {
      throw new Error("You are still on a Microsoft sign-in page.");
    }

    await context.storageState({
      path: AUTH_FILE,
      indexedDB: true
    });

    console.log("\nAuthentication session saved to:");
    console.log(AUTH_FILE);
    console.log("Keep this file private.");

    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error("Authentication setup failed:", error.message);
  process.exitCode = 1;
});
