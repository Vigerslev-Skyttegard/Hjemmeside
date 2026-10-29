
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SHARE_URL =
  "https://1drv.ms/x/c/4560751afe576670/IQBwZlf-GnVgIIBFLAMAAAAAAacgNjZehh4H7Nvmzuz5pZA?e=VpDpPb";

const DESTINATION = "data/venteliste.xlsx";

async function main() {
  const shareToken =
    "u!" +
    Buffer.from(SHARE_URL, "utf8")
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  // Try the OneDrive personal API directly, without browser redirects.
  const url =
    `https://api.onedrive.com/v1.0/shares/${shareToken}/root/content`;

  console.log("Requesting workbook from the OneDrive API...");

  const response = await fetch(url, {
    headers: {
      Accept: "application/octet-stream",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `OneDrive API returned HTTP ${response.status}: ` +
      details.slice(0, 500)
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  // Validate that the response is an XLSX ZIP archive.
  if (
    bytes.length < 4 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b
  ) {
    throw new Error(
      "The OneDrive API did not return an Excel workbook."
    );
  }

  await mkdir(dirname(DESTINATION), { recursive: true });
  await writeFile(DESTINATION, bytes);

  console.log(
    `Successfully downloaded ${bytes.length} bytes to ${DESTINATION}`
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
