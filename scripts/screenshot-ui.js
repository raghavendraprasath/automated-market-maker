/**
 * Captures the README screenshots of the running UI.
 *
 * Drives an already-installed Chrome or Edge through puppeteer-core, so nothing is downloaded.
 * Expects a seeded chain and a running UI:
 *
 *   npm run node                       (terminal 1)
 *   npm run deploy:local               (terminal 2)
 *   cd web && npm run build && npm start   (terminal 3)
 *   npm run screenshots                (terminal 2)
 *
 * Cards are located by their <h2> title, so the shots stay correct if the layout is reordered.
 */
const fs = require("node:fs");
const path = require("node:path");

const puppeteer = require("puppeteer-core");

const URL = process.env.SCREENSHOT_URL || "http://127.0.0.1:3000";
const OUT_DIR = path.join(__dirname, "..", "screenshots");

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

/** Returns the <section class="card"> whose title starts with `titlePrefix`. */
async function card(page, titlePrefix) {
  const sections = await page.$$("section.card");
  for (const section of sections) {
    const title = await section
      .$eval("h2.card-title", (el) => el.textContent ?? "")
      .catch(() => null);
    if (title && title.startsWith(titlePrefix)) return section;
  }
  throw new Error(`No card titled "${titlePrefix}" on the page`);
}

async function shootCard(page, titlePrefix, fileName) {
  const handle = await card(page, titlePrefix);
  await handle.scrollIntoView();
  await new Promise((resolve) => setTimeout(resolve, 400));
  const file = path.join(OUT_DIR, fileName);
  await handle.screenshot({ path: file });
  console.log(`  ${fileName}`);
}

/**
 * Types into a card's first amount field. Quote previews are computed from reserves rather than from
 * the wallet, so this fills in the live output even with no wallet connected.
 */
async function typeAmount(page, titlePrefix, value) {
  const handle = await card(page, titlePrefix);
  const input = await handle.$("input");
  if (!input) throw new Error(`No input inside "${titlePrefix}"`);
  await input.click({ clickCount: 3 });
  await input.type(value, { delay: 30 });
  await new Promise((resolve) => setTimeout(resolve, 700));
}

/**
 * Clicks a button by its label, ignoring case: the tab labels are lowercase in the DOM and only
 * look capitalized because of a `capitalize` CSS class.
 */
async function clickButton(page, label) {
  const clicked = await page.evaluate((text) => {
    const button = [...document.querySelectorAll("button")].find(
      (candidate) =>
        candidate.textContent?.trim().toLowerCase() === text.toLowerCase()
    );
    if (!button) return false;
    button.click();
    return true;
  }, label);

  if (!clicked) throw new Error(`No button labelled "${label}"`);
  await new Promise((resolve) => setTimeout(resolve, 500));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ["--force-color-profile=srgb", "--hide-scrollbars"],
    defaultViewport: { width: 1600, height: 1200, deviceScaleFactor: 2 },
  });

  try {
    const page = await browser.newPage();
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60_000 });

    // Charts only exist once pool reads and the eth_getLogs scan have resolved.
    await page.waitForSelector("section.card", { timeout: 60_000 });
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("h2.card-title")].some((el) =>
          el.textContent?.startsWith("Raw eth_getLogs")
        ),
      { timeout: 60_000 }
    );
    await page.waitForSelector(".recharts-surface", { timeout: 60_000 });
    await new Promise((resolve) => setTimeout(resolve, 2_500));

    console.log("Writing screenshots to screenshots/");

    await page.screenshot({
      path: path.join(OUT_DIR, "hw5_ui_dashboard.png"),
      fullPage: true,
    });
    console.log("  hw5_ui_dashboard.png");

    await shootCard(page, "Pools", "hw5_pool_selector.png");
    await shootCard(page, "Pool state", "hw5_pool_state.png");
    await shootCard(page, "Reserves curve", "hw5_reserves_curve.png");
    await shootCard(page, "Execution price distribution", "hw5_price_distribution.png");
    await shootCard(page, "Price history", "hw5_price_history.png");
    await shootCard(page, "Recent activity", "hw5_activity_table.png");

    await typeAmount(page, "Actions", "1");
    await shootCard(page, "Actions", "hw5_action_swap.png");

    await clickButton(page, "Deposit");
    await typeAmount(page, "Actions", "2");
    await shootCard(page, "Actions", "hw5_action_deposit.png");

    await clickButton(page, "Redeem");
    await shootCard(page, "Actions", "hw5_action_redeem.png");

    // The raw request/decoded log blocks live behind this toggle.
    await clickButton(page, "Show payload");
    await shootCard(page, "Raw eth_getLogs", "hw5_raw_getlogs.png");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
