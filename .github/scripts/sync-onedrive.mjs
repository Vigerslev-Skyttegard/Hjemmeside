
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SOURCE_URL =
  "https://1drv.ms/x/c/4560751afe576670/IQBwZlf-GnVgIIBFLAMAAAAAAdAuxtxL8NaM5-kU-dsTUvA?e=4zc7if&download=1";

const DESTINATION_PATH = "data/venteliste.xlsx";

async function main() {
  console.log("Downloading Excel workbook from OneDrive...");

  const response = await fetch(SOURCE_URL, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const file = Buffer.from(await response.arrayBuffer());

  // An .xlsx file is a ZIP archive and normally starts with PK.
  if (
    file.length < 4 ||
    file[0] !== 0x50 ||
    file[1] !== 0x4b
  ) {
    throw new Error(
      `The response was not an Excel workbook. ` +
      `Content-Type: ${contentType}. ` +
      `OneDrive may have returned an HTML page instead.`
    );
  }

  await mkdir(dirname(DESTINATION_PATH), { recursive: true });
  await writeFile(DESTINATION_PATH, file);

  console.log(
    `Downloaded ${file.length} bytes to ${DESTINATION_PATH}`
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
