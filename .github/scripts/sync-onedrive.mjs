
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SHARE_URL =
  "https://1drv.ms/x/c/4560751afe576670/IQBwZlf-GnVgIIBFLAMAAAAAAdAuxtxL8NaM5-kU-dsTUvA?e=4zc7if";

const DESTINATION = "data/venteliste.xlsx";

async function main() {
  const urls = [
    `${SHARE_URL}&download=1`,
    SHARE_URL,
  ];

  let workbook;

  for (const url of urls) {
    console.log(`Trying ${new URL(url).hostname}...`);

    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*",
      },
    });

    console.log(`HTTP status: ${response.status}`);
    console.log(`Final URL: ${response.url}`);
    console.log(`Content-Type: ${response.headers.get("content-type")}`);

    if (!response.ok) {
      await response.body?.cancel();
      continue;
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    // An XLSX file is a ZIP archive.
    if (
      bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b
    ) {
      workbook = bytes;
      break;
    }

    console.log("Response was not an XLSX file; trying the next URL.");
  }

  if (!workbook) {
    throw new Error(
      "Could not download the workbook directly. " +
      "Check the logged final URL and response status."
    );
  }

  await mkdir(dirname(DESTINATION), { recursive: true });
  await writeFile(DESTINATION, workbook);

  console.log(`Saved ${workbook.length} bytes to ${DESTINATION}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
