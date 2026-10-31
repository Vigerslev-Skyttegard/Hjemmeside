
import { mkdir, writeFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";

const SHARE_URL =
  "https://onedrive.live.com/:x:/g/personal/4560751afe576670/IQBwZlf-GnVgIIBFLAMAAAAAAacgNjZehh4H7Nvmzuz5pZA?rtime=8ahKBmQ330g&redeem=aHR0cHM6Ly8xZHJ2Lm1zL3gvYy80NTYwNzUxYWZlNTc2NjcwL0lRQndabGYtR25WZ0lJQkZMQU1BQUFBQUFhY2dOalplaGg0SDdOdm16dXo1cFpBP2U9VnBEcFBiJnV0bV9zb3VyY2U9Y2hhdGdwdC5jb20";

const DESTINATION = "data/venteliste.xlsx";

async function main() {
  console.log("Requesting workbook from OneDrive...");

  const response = await fetch(SHARE_URL, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*"
    }
  });

  if (!response.ok) {
    throw new Error(`OneDrive returned HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const finalUrl = response.url;

  if (
    finalUrl.includes("login.live.com") ||
    finalUrl.includes("login.microsoftonline.com")
  ) {
    throw new Error("OneDrive redirected to Microsoft login. Anonymous download is unavailable.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  // XLSX files are ZIP archives and begin with PK.
  if (
    buffer.length < 1000 ||
    buffer[0] !== 0x50 ||
    buffer[1] !== 0x4b
  ) {
    console.error("Unexpected response:", {
      contentType,
      finalUrl,
      bytes: buffer.length
    });

    throw new Error(
      "The response is not an XLSX file. OneDrive may require an authenticated download."
    );
  }

  await mkdir(dirname(DESTINATION), { recursive: true });

  const temporary = `${DESTINATION}.tmp`;

  await writeFile(temporary, buffer);
  await rename(temporary, DESTINATION);

  console.log(`Workbook downloaded successfully: ${buffer.length} bytes`);
}

main().catch(async error => {
  console.error("Synchronization failed:", error.message);
  await unlink(`${DESTINATION}.tmp`).catch(() => {});
  process.exitCode = 1;
});
