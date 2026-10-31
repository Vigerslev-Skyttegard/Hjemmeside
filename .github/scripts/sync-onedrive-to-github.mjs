
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

// Add one entry for each file you want to synchronize.
// Each file can come from a different OneDrive folder.
const FILES = [
  {
    folderUrl: "https://onedrive.live.com/my?id=%2Fpersonal%2F4560751afe576670%2FDocuments%2FDokumenter%2FParkering&viewid=92a05dab%2D4425%2D48df%2D9c92%2D07bfe5d43802",
    fileName: "Venteliste Parkering.xlsx",
    destination: "Venteliste Parkering.xlsx"
  },

  // FILE 2 - PLACEHOLDER
  // {
  //   folderUrl: "ONEDRIVE_FOLDER_URL",
  //   fileName: "File2.xlsx",
  //   destination: "File2.xlsx"
  // },

  // FILE 3 - PLACEHOLDER
  // {
  //   folderUrl: "ONEDRIVE_FOLDER_URL",
  //   fileName: "File3.xlsx",
  //   destination: "File3.xlsx"
  // }
];

// DanDomain IMAP configuration
const IMAP_HOST = "post.dandomain.dk";
const IMAP_PORT = 993;
const IMAP_FOLDER = "INBOX";

// Same credentials for Microsoft and DanDomain
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

if (!Array.isArray(FILES) || FILES.length === 0) {
  throw new Error("The FILES configuration array is empty.");
}

for (const [index, file] of FILES.entries()) {
  if (!file.folderUrl || !file.fileName || !file.destination) {
    throw new Error(
      `Invalid FILES entry at position ${index + 1}. ` +
      "Each entry requires folderUrl, fileName and destination."
    );
  }
}

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

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
      // Try next locator.
    }
  }

  return false;
}

async function waitForVisible(locators, timeout = 15000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const locator of locators) {
      try {
        if (await locator.first().isVisible()) {
          return locator.first();
        }
      } catch {
        // Continue checking.
      }
    }

    await sleep(500);
  }

  return null;
}

// ==================================================
// DANDOMAIN IMAP CONNECTION
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
// RETRIEVE MICROSOFT VERIFICATION CODE
// ==================================================

async function getVerificationCode(client, firstUid) {
  console.log("Waiting for Microsoft verification email...");

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

      if (!/microsoft|accountprotection/i.test(sender)) {
        continue;
      }

      const received = new Date(
        message.internalDate || parsed.date || 0
      );

      if (
        !Number.isFinite(received.getTime()) ||
        Date.now() - received.getTime() > 5 * 60 * 1000
      ) {
        continue;
      }

      const content = `${subject}\n${body}`;

      const match =
        content.match(
          /(?:security|verification|verify|sign-in)\s+code[^\d]{0,60}(\d{6})/i
        ) ||
        content.match(/\b(\d{6})\b/);

      if (match) {
        console.log("Microsoft verification code received.");

        return match[1];
      }
    }

    await sleep(5000);
  }

  throw new Error(
    "Microsoft verification email was not received within three minutes."
  );
}

// ==================================================
// MICROSOFT EMAIL VERIFICATION
// ==================================================

async function completeEmailMfa(page, client, firstUid) {
  console.log("Handling Microsoft email verification...");

  await clickFirst([
    page.getByText(/email.*@/i),
    page.getByRole("button", { name: /email/i }),
    page.getByRole("radio", { name: /email/i }),
    page.getByText(/send.*email/i)
  ], "email verification method", 5000);

  await page.waitForTimeout(1500);

  await clickFirst([
    page.getByRole("button", { name: /send code/i }),
    page.getByRole("button", { name: /send verification code/i }),
    page.getByRole("button", { name: /send|next|næste/i }),
    page.locator("#idSIButton9")
  ], "request verification code", 5000);

  const codeInput = await waitForVisible([
    page.locator('input[name="otc"]'),
    page.locator('input[autocomplete="one-time-code"]'),
    page.locator('input[type="tel"]')
  ], 20000);

  if (!codeInput) {
    throw new Error(
      "Microsoft verification code input was not found."
    );
  }

  const code = await getVerificationCode(client, firstUid);

  console.log("Submitting verification code...");

  await codeInput.fill(code);

  await clickFirst([
    page.getByRole("button", {
      name: /verify|next|continue|bekræft|næste/i
    }),
    page.locator("#idSIButton9"),
    page.locator('input[type="submit"]')
  ], "submit verification code");

  await page.waitForTimeout(5000);
}

// ==================================================
// MICROSOFT LOGIN
// ==================================================

async function loginToMicrosoft(page, client, firstUid) {
  console.log("Opening Microsoft sign-in...");

  await page.goto(FILES[0].folderUrl, {
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
      page.getByRole("button", {
        name: /sign in|log ind/i
      }),
      page.locator('input[type="submit"]')
    ], "Microsoft password submission");

    await page.waitForTimeout(4000);
  }

  const bodyText = await page.locator("body")
    .innerText()
    .catch(() => "");

  const codeInput = await waitForVisible([
    page.locator('input[name="otc"]'),
    page.locator('input[autocomplete="one-time-code"]'),
    page.locator('input[type="tel"]')
  ], 3000);

  if (
    codeInput ||
    /verify your identity|verify.*email|send a code|bekræft din identitet/i.test(bodyText)
  ) {
    await completeEmailMfa(page, client, firstUid);
  }

  // Stay signed in prompt
  await clickFirst([
    page.getByRole("button", { name: /^yes$/i }),
    page.getByRole("button", { name: /^ja$/i }),
    page.locator("#idSIButton9")
  ], "Stay signed in confirmation", 3000);

  await page.waitForTimeout(4000);

  if (/login\.live\.com|login\.microsoftonline\.com/i.test(page.url())) {
    const text = await page.locator("body")
      .innerText()
      .catch(() => "");

    if (/captcha|robot|unusual activity|blocked/i.test(text)) {
      throw new Error(
        "Microsoft requires an additional security check."
      );
    }

    throw new Error(
      "Microsoft sign-in did not complete."
    );
  }

  console.log("Microsoft sign-in completed.");
}

// ==================================================
// FIND AND DOWNLOAD WORKBOOK FROM ONEDRIVE FOLDER
// ==================================================

async function downloadFile(page, fileConfig) {
  const { folderUrl, fileName, destination } = fileConfig;

  console.log("------------------------------------------");
  console.log(`Downloading: ${fileName}`);
  console.log(`Destination: ${destination}`);
  console.log("------------------------------------------");

  console.log("Opening OneDrive folder...");

  await page.goto(folderUrl, {
    waitUntil: "domcontentloaded",
    timeout: 90000
  });

  await page.waitForTimeout(8000);

  console.log(`Looking for ${fileName}...`);

  const file = page.getByText(fileName, {
    exact: true
  }).first();

  try {
    await file.waitFor({
      state: "visible",
      timeout: 30000
    });
  } catch {
    const visibleText = await page.locator("body")
      .innerText()
      .catch(() => "");

    console.log("Current URL:", page.url());
    console.log("Page title:", await page.title());

    console.log(
      "Visible page content:",
      visibleText.slice(0, 4000)
    );

    throw new Error(
      `Could not find ${fileName} in the OneDrive folder.`
    );
  }

  console.log("File found.");

  // Open the file's context menu.
  await file.click({
    button: "right"
  });

  await page.waitForTimeout(1500);

  const downloadOption = await waitForVisible([
    page.getByRole("menuitem", {
      name: /^download$/i
    }),
    page.getByText(/^download$/i),
    page.getByRole("button", {
      name: /^download$/i
    })
  ], 10000);

  if (!downloadOption) {
    throw new Error(
      `File found, but the OneDrive Download option was not visible for ${fileName}.`
    );
  }

  console.log("Starting download...");

  const downloadPromise = page.waitForEvent("download", {
    timeout: 60000
  });

  await downloadOption.click();

  const download = await downloadPromise;

  await mkdir(dirname(destination), {
    recursive: true
  });

  const temporary = `${destination}.tmp`;

  await download.saveAs(temporary);

  const buffer = await readFile(temporary);

  // Validate known file formats using their file signatures.
  // DOCX, XLSX and PPTX are ZIP-based Office formats.
  const extension = fileName.toLowerCase().match(/\.([^.]+)$/)?.[1] || "";
  const isZipBasedOfficeFile = ["docx", "xlsx", "pptx"].includes(extension);
  const isPdf = extension === "pdf";
  const isLegacyWord = extension === "doc";

  const hasZipSignature =
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b;

  const hasPdfSignature =
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString("ascii") === "%PDF-";

  // Legacy .doc files use the OLE Compound File signature.
  const hasLegacyWordSignature =
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])
    );

  let validFile = buffer.length > 0;

  if (isZipBasedOfficeFile) {
    validFile = buffer.length >= 1000 && hasZipSignature;
  } else if (isPdf) {
    validFile = hasPdfSignature;
  } else if (isLegacyWord) {
    validFile = hasLegacyWordSignature;
  }

  if (!validFile) {
    await unlink(temporary).catch(() => {});

    throw new Error(
      `Downloaded file ${fileName} failed file validation. ` +
      "The existing destination file has been preserved."
    );
  }

  await rename(temporary, destination);

  console.log(
    `Successfully downloaded ${fileName} (${buffer.length} bytes).`
  );

  console.log(`Saved to ${destination}.`);
}

// ==================================================
// MAIN
// ==================================================

async function main() {
  let client;
  let browser;

  try {
    client = await connectMailbox();

    // Record the next mailbox UID before starting Microsoft login.
    const firstUid = client.mailbox.uidNext;

    browser = await chromium.launch({
      headless: true
    });

    const context = await browser.newContext({
      acceptDownloads: true
    });

    const page = await context.newPage();

    page.setDefaultTimeout(20000);

    await loginToMicrosoft(
      page,
      client,
      firstUid
    );

    // Download every configured file sequentially.
    for (const fileConfig of FILES) {
      await downloadFile(page, fileConfig);
    }

    await context.close();

    console.log("OneDrive file synchronization completed successfully.");
  } finally {
    if (browser) {
      await browser.close();
    }

    if (client) {
      await client.logout().catch(() => {});
    }
  }
}

// ==================================================
// EXECUTION
// ==================================================

main().catch(error => {
  console.error("Synchronization failed:", error);
  process.exitCode = 1;
});
