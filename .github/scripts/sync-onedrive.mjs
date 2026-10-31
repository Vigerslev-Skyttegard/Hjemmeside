
import { chromium } from "playwright";
import {
  mkdir,
  writeFile,
  readFile,
  rename,
  unlink
} from "node:fs/promises";
import { dirname } from "node:path";

const SHARE_URL =
  "https://1drv.ms/x/c/4560751afe576670/IQBwZlf-GnVgIIBFLAMAAAAAAacgNjZehh4H7Nvmzuz5pZA?e=VpDpPb";

const DESTINATION = "data/venteliste.xlsx";
const AUTH_FILE = "playwright/.auth/onedrive.json";

async function clickOneOf(locators, description) {
  for (const locator of locators) {
    try {
      await locator.first().click({ timeout: 7000 });
      console.log(`Selected ${description}`);
      return;
    } catch {
      // Try the next possible label.
    }
  }

  throw new Error(`Could not find ${description}.`);
}

async function main() {
  const encodedAuth = process.env.ONEDRIVE_AUTH_BASE64;

  if (!encodedAuth) {
    throw new Error("Missing GitHub secret ONEDRIVE_AUTH_BASE64.");
  }

  const authState = Buffer.from(encodedAuth, "base64").toString("utf8");

  // Validate the authentication JSON.
  JSON.parse(authState);

  await mkdir(dirname(AUTH_FILE), { recursive: true });
  await writeFile(AUTH_FILE, authState, { mode: 0o600 });

  const browser = await chromium.launch({ headless: true });

  let context;

  try {
    context = await browser.newContext({
      storageState: AUTH_FILE,
      acceptDownloads: true
    });

    const page = await context.newPage();
    page.setDefaultTimeout(20000);

    console.log("Opening OneDrive workbook...");

    await page.goto(SHARE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 90000
    });

    await page.waitForTimeout(10000);

    if (/login\.live\.com|login\.microsoftonline\.com/i.test(page.url())) {
      throw new Error("Microsoft requires a new login. Authentication has expired.");
    }

    // Detect common login and access-denied messages.
    const pageText = await page.locator("body").innerText().catch(() => "");

    if (/sign in to your account|you don't have access|access denied/i.test(pageText)) {
      throw new Error("OneDrive is requesting authentication or denying access.");
    }

    console.log("Looking for Excel's File menu...");

    await clickOneOf([
      page.getByRole("tab", { name: /^file$/i }),
      page.getByRole("button", { name: /^file$/i }),
      page.getByText(/^file$/i),
      page.getByRole("tab", { name: /^filer$/i }),
      page.getByRole("button", { name: /^filer$/i }),
      page.getByText(/^filer$/i)
    ], "File menu");

    await clickOneOf([
      page.getByRole("menuitem", { name: /save as/i }),
      page.getByText(/^save as$/i),
      page.getByRole("menuitem", { name: /gem som/i }),
      page.getByText(/^gem som$/i)
    ], "Save As");

    console.log("Looking for Download a Copy...");

    let download;

    const downloadLocators = [
      page.getByRole("menuitem", { name: /download a copy/i }),
      page.getByText(/download a copy/i),
      page.getByRole("menuitem", { name: /download en kopi/i }),
      page.getByText(/download en kopi/i)
    ];

    for (const locator of downloadLocators) {
      try {
        const downloadPromise = page.waitForEvent("download", {
          timeout: 15000
        });

        await locator.first().click({ timeout: 7000 });
        download = await downloadPromise;
        break;
      } catch {
        // Try another matching control.
      }
    }

    if (!download) {
      throw new Error("Excel did not offer a Download a Copy action.");
    }

    await mkdir(dirname(DESTINATION), { recursive: true });

    const temporary = `${DESTINATION}.tmp`;

    await download.saveAs(temporary);

    const buffer = await readFile(temporary);

    // An XLSX file is a ZIP archive.
    if (
      buffer.length < 1000 ||
      buffer[0] !== 0x50 ||
      buffer[1] !== 0x4b
    ) {
      await unlink(temporary).catch(() => {});
      throw new Error("Downloaded content is not a valid XLSX file.");
    }

    // Only replace the existing workbook after validation.
    await rename(temporary, DESTINATION);

    console.log(`Workbook downloaded successfully: ${buffer.length} bytes.`);
  } finally {
    if (context) await context.close();
    await browser.close();
  }
}

main().catch(error => {
  console.error("OneDrive synchronization failed:", error.message);
  process.exitCode = 1;
});
