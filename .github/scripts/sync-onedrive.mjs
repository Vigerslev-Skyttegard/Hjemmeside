
import { chromium } from "playwright";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

import {
  mkdir,
  readFile,
  rename,
  unlink
} from "node:fs/promises";

import { dirname } from "node:path";

// ==================================================
// CONFIGURATION
// ==================================================

const SHARE_URL =
  "https://1drv.ms/x/c/4560751afe576670/IQBwZlf-GnVgIIBFLAMAAAAAAacgNjZehh4H7Nvmzuz5pZA?e=VpDpPb";

const DESTINATION = "data/venteliste.xlsx";

// DanDomain IMAP settings
const IMAP_HOST = "post.dandomain.dk";
const IMAP_PORT = 993;
const IMAP_FOLDER = "INBOX";

// The same credentials are used for Microsoft and DanDomain.
const EMAIL = process.env.ONEDRIVE_EMAIL;
const PASSWORD = process.env.ONEDRIVE_PASSWORD;

// ==================================================
// VALIDATION
// ==================================================

if (!EMAIL || !PASSWORD) {
  throw new Error(
    "Missing ONEDRIVE_EMAIL or ONEDRIVE_PASSWORD GitHub Secret."
  );
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ==================================================
// PLAYWRIGHT HELPERS
// ==================================================

async function clickFirst(locators, description, timeout = 7000) {
  for (const locator of locators) {
    try {
      await locator.first().click({ timeout });
      console.log(`Selected ${description}.`);
      return true;
    } catch {
      // Try the next possible control.
    }
  }

  return false;
}

async function fillFirst(locators, value, description) {
  for (const locator of locators) {
    try {
      await locator.first().fill(value, { timeout: 7000 });
      console.log(`Filled ${description}.`);
      return true;
    } catch {
      // Try the next possible input.
    }
  }

  return false;
}

async function waitForVisible(locators, timeout = 20000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const locator of locators) {
      if (await locator.first().isVisible().catch(() => false)) {
        return locator.first();
      }
    }

    await sleep(500);
  }

  return null;
}

// ==================================================
// DANDOMAIN IMAP
// ==================================================

async function connectMailbox() {
  console.log("Connecting to DanDomain IMAP...");

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: {
      user: EMAIL,
      pass: PASSWORD
    },
    logger: false
  });

  await client.connect();
  await client.mailboxOpen(IMAP_FOLDER);

  console.log("DanDomain mailbox connected.");

  return client;
}

// ==================================================
// MICROSOFT VERIFICATION EMAIL
// ==================================================

async function getVerificationCode(client, firstUid) {
  console.log("Waiting for Microsoft's email verification code...");

  const deadline = Date.now() + 180000;

  while (Date.now() < deadline) {
    const messages = await client.fetchAll(
      `${firstUid}:*`,
      {
        uid: true,
        envelope: true,
        source: true,
        internalDate: true
      },
      { uid: true }
    );

    for (const message of messages) {
      if (!message.source) continue;

      const parsed = await simpleParser(message.source);

      const sender = parsed.from?.text || "";
      const subject = parsed.subject || "";
      const body = parsed.text || "";

      // Only consider messages that appear to come from Microsoft.
      const isMicrosoft =
        /microsoft|accountprotection/i.test(sender);

      if (!isMicrosoft) continue;

      const received = new Date(
        message.internalDate || parsed.date || 0
      );

      // Only consider recent messages.
      if (
        !Number.isFinite(received.getTime()) ||
        Date.now() - received.getTime() > 5 * 60 * 1000
      ) {
        continue;
      }

      const content = `${subject}\n${body}`;

      // Prefer a code explicitly associated with verification.
      const match =
        content.match(
          /(?:security|verification|verify|sign-in)\s+code[^\d]{0,60}(\d{6})/i
        ) ||
        content.match(/\b(\d{6})\b/);

      if (match) {
        console.log("Microsoft verification email received.");
        return match[1];
      }
    }

    await sleep(5000);
  }

  throw new Error(
    "No suitable Microsoft verification code arrived within three minutes."
  );
}

// ==================================================
// MICROSOFT LOGIN
// ==================================================

async function loginToMicrosoft(page, client, firstUid) {
  console.log("Opening Microsoft sign-in...");

  await page.goto(SHARE_URL, {
    waitUntil: "domcontentloaded",
    timeout: 90000
  });

  await page.waitForTimeout(3000);

  const emailInput = await waitForVisible([
    page.locator('input[name="loginfmt"]'),
    page.locator('input[type="email"]')
  ], 15000);

  if (emailInput) {
    await emailInput.fill(EMAIL);

    await clickFirst([
      page.locator("#idSIButton9"),
      page.getByRole("button", { name: /next|næste/i }),
      page.locator('input[type="submit"]')
    ], "Microsoft email continuation");

    await page.waitForTimeout(2500);
  }

  const passwordInput = await waitForVisible([
    page.locator('input[name="passwd"]'),
    page.locator('input[type="password"]')
  ], 15000);

  if (passwordInput) {
    await passwordInput.fill(PASSWORD);

    await clickFirst([
      page.locator("#idSIButton9"),
      page.getByRole("button", { name: /sign in|log ind/i }),
      page.locator('input[type="submit"]')
    ], "Microsoft password submission");

    await page.waitForTimeout(4000);
  }

  // Check whether Microsoft requires email verification.
  const codeInput = await waitForVisible([
    page.locator('input[name="otc"]'),
    page.locator('input[autocomplete="one-time-code"]'),
    page.locator('input[type="tel"]')
  ], 5000);

  if (codeInput) {
    await completeEmailMfa(page, client, firstUid, codeInput);
  }

  // Handle the optional "Stay signed in?" screen.
  await clickFirst([
    page.getByRole("button", { name: /^yes$/i }),
    page.getByRole("button", { name: /^ja$/i }),
    page.locator("#idSIButton9")
  ], "Stay signed in confirmation", 3000);

  await page.waitForTimeout(4000);

  if (/login\.live\.com|login\.microsoftonline\.com/i.test(page.url())) {
    const text = await page.locator("body").innerText().catch(() => "");

    if (/captcha|robot|unusual activity|blocked/i.test(text)) {
      throw new Error(
        "Microsoft requires an additional security check that cannot be completed automatically."
      );
    }

    if (/approve|approval|authenticator/i.test(text)) {
      throw new Error(
        "Microsoft requested an additional authentication approval."
      );
    }

    throw new Error(
      "Microsoft sign-in did not complete. The login page is still active."
    );
  }

  console.log("Microsoft sign-in completed.");
}

// ==================================================
// EMAIL MFA
// ==================================================

async function completeEmailMfa(page, client, firstUid, codeInput) {
  console.log("Microsoft requested email verification.");

  // If Microsoft displays authentication methods, select email.
  const emailOption = await clickFirst([
    page.getByText(/email.*@/i),
    page.getByRole("button", { name: /email/i }),
    page.getByRole("radio", { name: /email/i }),
    page.getByText(/send.*email/i)
  ], "email verification method", 5000);

  if (emailOption) {
    await page.waitForTimeout(1500);
  }

  // Some Microsoft screens require an explicit Send code action.
  await clickFirst([
    page.getByRole("button", { name: /send code/i }),
    page.getByRole("button", { name: /send verification code/i }),
    page.getByRole("button", { name: /send|next|næste/i }),
    page.locator("#idSIButton9")
  ], "request verification code", 5000);

  await page.waitForTimeout(2000);

  // Retrieve the code from the DanDomain mailbox.
  const code = await getVerificationCode(client, firstUid);

  console.log("Submitting Microsoft verification code...");

  await codeInput.fill(code);

  await clickFirst([
    page.getByRole("button", { name: /verify|next|continue|bekræft|næste/i }),
    page.locator("#idSIButton9"),
    page.locator('input[type="submit"]')
  ], "submit verification code");

  await page.waitForTimeout(5000);
}

// ==================================================
// DOWNLOAD EXCEL WORKBOOK
// ==================================================

async function downloadWorkbook(page) {
  console.log("Opening the Excel workbook...");

  await page.goto(SHARE_URL, {
    waitUntil: "domcontentloaded",
    timeout: 90000
  });

  await page.waitForTimeout(10000);

  if (/login\.live\.com|login\.microsoftonline\.com/i.test(page.url())) {
    throw new Error("Microsoft login is required again.");
  }

  const pageText = await page.locator("body").innerText().catch(() => "");

  if (/access denied|you don't have access/i.test(pageText)) {
    throw new Error("Microsoft denied access to the workbook.");
  }

  console.log("Opening Excel File menu...");

  const fileOpened = await clickFirst([
    page.getByRole("tab", { name: /^file$/i }),
    page.getByRole("button", { name: /^file$/i }),
    page.getByText(/^file$/i),
    page.getByRole("tab", { name: /^filer$/i }),
    page.getByRole("button", { name: /^filer$/i }),
    page.getByText(/^filer$/i)
  ], "File menu");

  if (!fileOpened) {
    throw new Error("Could not locate Excel's File menu.");
  }

  const saveAsOpened = await clickFirst([
    page.getByRole("menuitem", { name: /save as/i }),
    page.getByText(/^save as$/i),
    page.getByRole("menuitem", { name: /gem som/i }),
    page.getByText(/^gem som$/i)
  ], "Save As");

  if (!saveAsOpened) {
    throw new Error("Could not locate Excel's Save As menu.");
  }

  console.log("Starting workbook download...");

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
        timeout: 20000
      });

      await locator.first().click({ timeout: 7000 });

      download = await downloadPromise;
      break;
    } catch {
      // Try the next matching command.
    }
  }

  if (!download) {
    throw new Error(
      "Could not trigger Excel's Download a Copy command."
    );
  }

  await mkdir(dirname(DESTINATION), { recursive: true });

  const temporary = `${DESTINATION}.tmp`;

  await download.saveAs(temporary);

  const buffer = await readFile(temporary);

  // An XLSX workbook is a ZIP archive.
  if (
    buffer.length < 1000 ||
    buffer[0] !== 0x50 ||
    buffer[1] !== 0x4b
  ) {
    await unlink(temporary).catch(() => {});

    throw new Error(
      "Downloaded file is not a valid XLSX workbook. Existing workbook preserved."
    );
  }

  await rename(temporary, DESTINATION);

  console.log(
    `Workbook successfully downloaded (${buffer.length} bytes).`
  );
}

// ==================================================
// MAIN
// ==================================================

async function main() {
  let client;
  let browser;

  try {
    // Connect to mailbox before Microsoft login so we can detect
    // verification messages arriving during the login process.
    client = await connectMailbox();

    const firstUid = client.mailbox.uidNext;

    browser = await chromium.launch({
      headless: true
    });

    const context = await browser.newContext({
      acceptDownloads: true
    });

    const page = await context.newPage();

    page.setDefaultTimeout(20000);

    await loginToMicrosoft(page, client, firstUid);

    await downloadWorkbook(page);

    await context.close();

    console.log("OneDrive synchronization completed successfully.");
  } finally {
    if (browser) {
      await browser.close();
    }

    if (client) {
      await client.logout().catch(() => {});
    }
  }
}

main().catch(error => {
  console.error("Synchronization failed:", error.message);
  process.exitCode = 1;
});
