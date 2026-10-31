
import { mkdir, writeFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";

const SHARE_URL =
  "https://1drv.ms/x/c/4560751afe576670/IQBwZlf-GnVgIIBFLAMAAAAAAacgNjZehh4H7Nvmzuz5pZA?e=VpDpPb";

const DESTINATION = "data/venteliste.xlsx";

function isXlsx(buffer) {
  return (
    buffer.length > 1000 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b
  );
}

async function main() {
  console.log("Resolving OneDrive sharing link...");

  const shareResponse = await fetch(SHARE_URL, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!shareResponse.ok) {
    throw new Error(`Sharing page returned HTTP ${shareResponse.status}`);
  }

  const pageUrl = shareResponse.url;
  const html = await shareResponse.text();

  console.log("Sharing page:", pageUrl);

  if (/login\.live\.com|login\.microsoftonline\.com/i.test(pageUrl)) {
    throw new Error("OneDrive requires authentication.");
  }

  // Look for a direct download URL embedded in the sharing page.
  const patterns = [
    /"downloadUrl"\s*:\s*"([^"]+)"/i,
    /"download_url"\s*:\s*"([^"]+)"/i,
    /"@content\.downloadUrl"\s*:\s*"([^"]+)"/i,
    /"downloadUri"\s*:\s*"([^"]+)"/i
  ];

  let downloadUrl;

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match) {
      downloadUrl = match[1]
        .replace(/\\u0026/g, "&")
        .replace(/\\\//g, "/")
        .replace(/&amp;/g, "&");

      break;
    }
  }

  // Fallback: request the public sharing URL with download=1.
  if (!downloadUrl) {
    const url = new URL(pageUrl);
    url.searchParams.set("download", "1");
    downloadUrl = url.toString();
  }

  console.log("Requesting Excel download...");

  const downloadResponse = await fetch(downloadUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*"
    }
  });

  if (!downloadResponse.ok) {
    throw new Error(
      `Download returned HTTP ${downloadResponse.status}`
    );
  }

  const buffer = Buffer.from(await downloadResponse.arrayBuffer());

  if (!isXlsx(buffer)) {
    console.error("Response URL:", downloadResponse.url);
    console.error(
      "Content type:",
      downloadResponse.headers.get("content-type")
    );

    throw new Error(
      "OneDrive did not return a valid Excel workbook. Anonymous download may not be supported for this link."
    );
  }

  await mkdir(dirname(DESTINATION), { recursive: true });

  const temporary = `${DESTINATION}.tmp`;

  await writeFile(temporary, buffer);
  await rename(temporary, DESTINATION);

  console.log(
    `Successfully downloaded workbook (${buffer.length} bytes).`
  );
}

main().catch(async error => {
  await unlink(`${DESTINATION}.tmp`).catch(() => {});
  console.error("OneDrive synchronization failed:", error);
  process.exitCode = 1;
});
