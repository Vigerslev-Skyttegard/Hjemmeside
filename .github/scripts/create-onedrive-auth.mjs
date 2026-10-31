
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const SHARE_URL =
  "https://1drv.ms/x/c/4560751afe576670/IQBwZlf-GnVgIIBFLAMAAAAAAacgNjZehh4H7Nvmzuz5pZA?e=VpDpPb";

const AUTH_FILE = "playwright/.auth/onedrive.json";

async function main() {
  await mkdir("playwright/.auth", { recursive: true });

  const browser = await chromium.launch({
    headless: false
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log("Opening your OneDrive workbook...");

    await page.goto(SHARE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 90000
    });

    console.log("\nPlease complete the following:");
    console.log("1. Sign in to your PERSONAL Microsoft account.");
    console.log("2. Complete MFA or other verification if requested.");
    console.log("3. Wait until the Excel workbook is visible.");
    console.log("4. Return to this terminal and press ENTER.\n");

    const terminal = createInterface({ input: stdin, output: stdout });

    await terminal.question("Press ENTER when the workbook is open: ");
    terminal.close();

    if (/login\.live\.com|login\.microsoftonline\.com/i.test(page.url())) {
      throw new Error("Microsoft login has not completed.");
    }

    await context.storageState({
      path: AUTH_FILE,
      indexedDB: true
    });

    console.log("\nAuthentication state saved:");
    console.log(AUTH_FILE);
    console.log("\nDo not commit or share this file.");

    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error("Authentication setup failed:", error);
  process.exitCode = 1;
});
