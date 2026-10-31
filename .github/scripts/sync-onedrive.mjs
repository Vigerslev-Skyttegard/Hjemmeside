
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

const SHARE_URL =
  "https://1drv.ms/x/c/4560751afe576670/IQBwZlf-GnVgIIBFLAMAAAAAAacgNjZehh4H7Nvmzuz5pZA?e=VpDpPb";

const DESTINATION = "data/venteliste.xlsx";
const IMAP_FOLDER = process.env.MAIL_IMAP_FOLDER || "INBOX";

const required = [
  "ONEDRIVE_EMAIL",
  "ONEDRIVE_PASSWORD",
  "MAIL_IMAP_HOST",
  "MAIL_IMAP_USER",
  "MAIL_IMAP_PASSWORD"
];

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Missing environment variable: ${name}`);
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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

async function connectMailbox() {
  const client = new ImapFlow({
    host: process.env.MAIL_IMAP_HOST,
    port: Number(process.env.MAIL_IMAP_PORT || 993),
    secure: true,
    auth: {
      user: process.env.MAIL_IMAP_USER,
      pass: process.env.MAIL_IMAP_PASSWORD
    },
    logger: false
  });

  await client.connect();
  await client.mailboxOpen(IMAP_FOLDER);

  return client;
}

async function getVerificationCode(client, firstUid) {
  console.log("Waiting for Microsoft's verification email...");

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

      const microsoftSender =
        /microsoft|accountprotection/i.test(sender);

      const relevantSubject =
        /code|security|verify|verification|identity/i.test(subject);

      if (!microsoftSender || !relevantSubject) continue;

      const received = new Date(
        message.internalDate || parsed.date || 0
      );

      if (Date.now() - received.getTime() > 5 * 60 * 1000) {
        continue;
      }

      const combined = `${subject}\n${body}`;

      const match =
        combined.match(/(?:security|verification|verify|sign-in)\s+code[^\d]{0,50}(\d{6})/i) ||
        combined.match(/\b(\d{6})\b/);

      if (match) {
        console.log("Microsoft verification email received.");
        return match[1];
      }
    }

    await sleep(5000);
  }

  throw new Error(
    "No suitable Microsoft verification email arrived within three minutes."
  );
}

async function enterEmailAndPassword(page) {
  const emailField = page.locator(
    'input[type="email"], input[name="loginfmt"]'
  ).first();

  if (await emailField.isVisible().catch(() => false)) {
    console.log("Entering Microsoft email...");
    await emailField.fill(process.env.ONEDRIVE_EMAIL);

    await clickFirst([
      page.locator("#idSIButton9"),
      page.getByRole("button", { name: /next|næste/i }),
      page.locator('input[type="submit"]')
    ], "Microsoft Next button");

    await page.waitForTimeout(2000);
  }

  const passwordField = page.locator(
    'input[type="password"], input[name="passwd"]'
  ).first();

  if (await passwordField.isVisible().catch(() => false)) {
    console.log("Entering Microsoft password...");
    await passwordField.fill(process.env.ONEDRIVE_PASSWORD);

    await clickFirst([
      page.locator("#idSIButton9"),
      page.getByRole("button", { name: /sign in|log ind|next|næste/i }),
      page.locator('input[type="submit"]')
    ], "Microsoft Sign in button");

    await page.waitForTimeout(4000);
  }
}

async function handleEmailMfa(page, client, firstUid) {
  // Check whether Microsoft has already displayed the code input.
  const codeField = page.locator(
    'input[name="otc"], input[autocomplete="one-time-code"], input[type="tel"]'
  ).first();

  let codeInputVisible = await codeField.isVisible().catch(() => false);

  if (!codeInputVisible) {
    // Select the email verification option if Microsoft presents choices.
    await clickFirst([
      page.getByText(/email.*@/i),
      page.getByRole("button", { name: /email/i }),
      page.getByRole("radio", { name: /email/i }),
      page.getByText(/send.*email/i)
    ], "email verification option", 5000);

    await page.waitForTimeout(1500);

    // Request a code if Microsoft has not already sent one.
    await clickFirst([
      page.getByRole("button", { name: /send code|send|next|send verification code/i }),
      page.locator("#idSIButton9"),
      page.locator('input[type="submit"]')
    ], "send verification code button", 5000);

    await page.waitForTimeout(2000);
  }

  codeInputVisible = await codeField.isVisible().catch(() => false);

  if (!codeInputVisible) {
    throw new Error(
      "Could not identify Microsoft's email verification screen. The login flow may have changed or another security check is required."
    );
  }

  const code = await getVerificationCode(client, firstUid);

  console.log("Entering verification code...");

  await codeField.fill(code);

  await clickFirst([
    page.getByRole("button", { name: /verify|next|continue|bekræft|næste/i }),
    page.locator("#idSIButton9"),
    page.locator('input[type="submit"]')
  ], "verification submit button");

  await page.waitForTimeout(4000);
}

async function downloadWorkbook(page) {
  console.log("Opening the Excel workbook...");

  await page.goto(SHARE_URL, {
    waitUntil: "domcontentloaded",
    timeout: 90000
  });

  await page.waitForTimeout(10000);

  if (/login\.live\.com|login\.microsoftonline\.com/i.test(page.url())) {
    throw new Error("Microsoft login is still required after verification.");
  }

  const pageText = await page.locator("body").innerText().catch(() => "");

  if (/access denied|you don't have access/i.test(pageText)) {
    throw new Error("Microsoft denied access to the workbook.");
  }

  await clickFirst([
    page.getByRole("tab", { name: /^file$/i }),
    page.getByRole("button", { name: /^file$/i }),
    page.getByText(/^file$/i),
    page.getByRole("tab", { name: /^filer$/i }),
    page.getByRole("button", { name: /^filer$/i }),
    page.getByText(/^filer$/i)
  ], "Excel File menu");

  await clickFirst([
    page.getByRole("menuitem", { name: /save as/i }),
    page.getByText(/^save as$/i),
    page.getByRole("menuitem", { name: /gem som/i }),
    page.getByText(/^gem som$/i)
  ], "Excel Save As menu");

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
      // Try the next possible menu item.
    }
  }

  if (!download) {
    throw new Error("Could not trigger Excel's Download a Copy command.");
  }

  await mkdir(dirname(DESTINATION), { recursive: true });

  const temporary = `${DESTINATION}.tmp`;

  await download.saveAs(temporary);

  const buffer = await readFile(temporary);

  // XLSX files are ZIP archives.
  if (
    buffer.length < 1000 ||
    buffer[0] !== 0x50 ||
    buffer[1] !== 0x4b
  ) {
    await unlink(temporary).catch(() => {});
    throw new Error("Downloaded content is not a valid XLSX workbook.");
  }

  await rename(temporary, DESTINATION);

  console.log(`Workbook downloaded: ${buffer.length} bytes.`);
}

async function main() {
  let client;
  let browser;

  try {
    console.log("Connecting to DanDomain mailbox...");

    client = await connectMailbox();

    // Capture the next mailbox UID before starting Microsoft login.
    const firstUid = client.mailbox.uidNext;

    console.log("Connected to mailbox.");
    console.log("Starting Microsoft login...");

    browser = await chromium.launch({ headless: true });

    const context = await browser.newContext({
      acceptDownloads: true
    });

    const page = await context.newPage();
    page.setDefaultTimeout(20000);

    await page.goto(SHARE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 90000
    });

    await enterEmailAndPassword(page);

    if (/login\.live\.com|login\.microsoftonline\.com/i.test(page.url())) {
      await handleEmailMfa(page, client, firstUid);
    }

    // Microsoft may display a "Stay signed in?" prompt.
    await clickFirst([
      page.getByRole("button", { name: /^yes$/i }),
      page.getByRole("button", { name: /^ja$/i })
    ], "Stay signed in prompt", 3000);

    await downloadWorkbook(page);

    await context.close();

    console.log("OneDrive synchronization completed.");
  } finally {
    if (browser) await browser.close();

    if (client) {
      await client.logout().catch(() => {});
    }
  }
}

main().catch(error => {
  console.error("Synchronization failed:", error.message);
  process.exitCode = 1;
});
