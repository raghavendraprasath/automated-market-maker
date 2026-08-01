/**
 * Captures the Istanbul HTML coverage report for the README.
 *
 * Run after `npm run coverage`, which writes coverage/lcov-report/. Reuses the
 * already-installed Chrome or Edge through puppeteer-core, so nothing is downloaded.
 *
 *   npm run coverage
 *   npm run screenshots:coverage
 */
const fs = require("node:fs");
const path = require("node:path");

const puppeteer = require("puppeteer-core");

// The per-directory page lists each contract by name; the root page only shows the
// aggregate `contracts/` row, which hides that both contracts are covered.
const REPORT = path.join(
  __dirname,
  "..",
  "coverage",
  "lcov-report",
  "contracts",
  "index.html"
);
const OUT_DIR = path.join(__dirname, "..", "screenshots");
const OUT_FILE = path.join(OUT_DIR, "hw5_coverage_html.png");

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env["ProgramFiles(x86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

function findBrowser() {
  for (const candidate of CHROME_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    "No Chrome or Edge found. Set CHROME_PATH to a Chromium-based browser executable."
  );
}

(async () => {
  if (!fs.existsSync(REPORT)) {
    throw new Error(`No coverage report at ${REPORT}. Run \`npm run coverage\` first.`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ["--no-sandbox", "--allow-file-access-from-files"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
    await page.goto(`file://${REPORT.split(path.sep).join("/")}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("table.coverage-summary tbody tr");
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Clip to the report content; the page body is mostly empty space below the table.
    const content = (await page.$("div.wrapper")) ?? (await page.$("body"));
    await content.screenshot({ path: OUT_FILE });
    console.log(`Wrote ${path.relative(process.cwd(), OUT_FILE)}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
