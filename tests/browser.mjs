import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

// Test fixtures only intercept the test browser. The exported app has no demo or mock mode.
const output = resolve("test/scratch/browser-validation");
await mkdir(output, { recursive: true });
const root = resolve("dist");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain",
};
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(
    new URL(req.url, "http://localhost").pathname,
  );
  if (pathname === "/") {
    res.writeHead(302, { Location: "/preview/" });
    res.end();
    return;
  }
  if (!pathname.startsWith("/preview/")) {
    res.writeHead(404);
    res.end();
    return;
  }
  const file = resolve(
    root,
    pathname.slice("/preview/".length) || "index.html",
  );
  if (!file.startsWith(root + "/")) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const results = [];
const limitations = [];
const errors = [];
async function check(name, fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    results.push({ name, passed: true, ms: Date.now() - start, detail });
    console.log(`PASS ${name}`);
    return true;
  } catch (e) {
    results.push({
      name,
      passed: false,
      ms: Date.now() - start,
      error: e.stack,
    });
    console.error(`FAIL ${name}: ${e.message}`);
    return false;
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function watch(page) {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.url().startsWith(url) && r.status() >= 400)
      errors.push(`${r.status()} ${r.url().replace(url, "/preview/")}`);
  });
}
async function shot(page, name) {
  await page.screenshot({
    path: `${output}/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}
async function fixture(context, state) {
  await context.route("https://api.squeekchain.com/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (state.fail === "all" || state.fail === path) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"status":"unavailable"}',
      });
      return;
    }
    let body;
    if (path === "/v1/status") {
      const now = await route
        .request()
        .frame()
        .evaluate(() => Date.now())
        .catch(() => Date.now());
      body = {
        measurement: {
          freshness: state.stale ? "stale" : "online",
          observedAt: new Date(now).toISOString(),
          staleAfterSeconds: 120,
          coreStatus: state.running ? "RUNNING" : "IDLE",
          rpmMilli: state.running ? (state.rpm ?? 25) * 1000 : 0,
          cumulativeWorkUnits: String(state.work ?? 84732),
        },
      };
    } else if (path === "/v1/economy/state")
      body = {
        status: "available",
        lifecycle: { stage: "active", paused: false, currentRound: "1" },
      };
    else body = { status: "unavailable" }; // Exercises the honest 90-second timing fallback.
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(body),
    });
  });
}
async function waitMode(page, mode) {
  await page
    .locator(`.arcade[data-mode="${mode}"]`)
    .waitFor({ timeout: 10000 });
}
async function advance(page, ms) {
  await page.clock.runFor(ms);
  await sleep(80);
}

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const live = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  const livePage = await live.newPage();
  watch(livePage);
  await check(
    "Live production export: both public feeds and round timing at /preview/",
    async () => {
      await livePage.goto(url);
      await livePage
        .locator(".live-badge:not(.offline)")
        .waitFor({ timeout: 20000 });
      assert.ok(
        await livePage
          .getByRole("button", { name: "Play as guest", exact: true })
          .isVisible(),
      );
      const rect = await livePage
        .getByRole("button", { name: "Play as guest", exact: true })
        .boundingBox();
      assert.ok(rect.y + rect.height < 844);
      const data = await livePage.locator(".live-bar").innerText();
      await shot(livePage, "live-mobile-390");
      return { data, playButtonBottom: rect.y + rect.height };
    },
  );
  await check("Live guest play and honest sleep/boost state", async () => {
    await livePage
      .getByRole("button", { name: "Play as guest", exact: true })
      .click();
    await livePage.locator(".is-racing").waitFor();
    await sleep(1200);
    const mode = await livePage.locator(".arcade").getAttribute("data-mode");
    if (mode === "sleeping")
      assert.equal(
        await livePage
          .getByRole("button", { name: "Boost", exact: false })
          .isDisabled(),
        true,
      );
    assert.ok(await livePage.getByTestId("timer").isVisible());
    await shot(livePage, "live-race-390");
    return { mode, timer: await livePage.getByTestId("timer").innerText() };
  });
  await live.close();

  for (const width of [320, 390, 730, 1024, 1440]) {
    await check(`Layout, first action and metadata at ${width}px`, async () => {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      watch(page);
      await fixture(context, { running: false });
      await page.goto(url);
      await waitMode(page, "sleeping");
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      assert.ok(
        overflow.scroll <= overflow.width + 1,
        JSON.stringify(overflow),
      );
      const button = await page
        .getByRole("button", { name: "Play as guest", exact: true })
        .boundingBox();
      assert.ok(button.y + button.height < 900);
      for (const key of ["description", "og:title", "og:image"])
        assert.ok(
          await page
            .locator(
              `meta[${key.startsWith("og") ? "property" : "name"}="${key}"]`,
            )
            .getAttribute("content"),
        );
      const image = await page
        .locator('meta[property="og:image"]')
        .getAttribute("content");
      const response = await page.request.get(new URL(image, url).href);
      assert.equal(response.status(), 200);
      if (width === 390 || width === 1440) await shot(page, `title-${width}`);
      if (width === 390) {
        await page.evaluate(() => {
          document.body.tabIndex = -1;
          document.body.focus();
        });
        await page.keyboard.press("Tab");
        assert.ok(
          await page
            .getByRole("link", { name: "Skip to the relay" })
            .evaluate(
              (e) =>
                e === document.activeElement && e.matches(":focus-visible"),
            ),
        );
      }
      await context.close();
      return overflow;
    });
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  const state = { running: true, rpm: 25, work: 84732 };
  await fixture(context, state);
  const fixtureTime = new Date();
  const page = await context.newPage();
  watch(page);
  await page.clock.install({ time: fixtureTime });
  await page.goto(url);
  await waitMode(page, "running");
  await check(
    "Guest name validation, quick heat and keyboard/touch-equivalent lanes",
    async () => {
      await page.getByLabel("Runner name").fill("");
      await page
        .getByRole("button", { name: "Play as guest", exact: true })
        .click();
      assert.equal(
        await page.getByRole("alert").innerText(),
        "Give your runner a name.",
      );
      await page.getByLabel("Runner name").fill("Baton Buddy");
      await page.getByLabel("90s quick heat").check();
      await page
        .getByRole("button", { name: "Play as guest", exact: true })
        .click();
      assert.equal(await page.getByTestId("timer").innerText(), "01:30");
      await advance(page, 1000);
      await page.keyboard.press("ArrowLeft");
      assert.equal(
        await page.locator(".arcade").getAttribute("data-lane"),
        "0",
      );
      await page.keyboard.press("d");
      assert.equal(
        await page.locator(".arcade").getAttribute("data-lane"),
        "1",
      );
      await page.getByRole("button", { name: "Change lane right" }).click();
      assert.equal(
        await page.locator(".arcade").getAttribute("data-lane"),
        "2",
      );
      await page.keyboard.press("Space");
      await advance(page, 100);
      assert.ok(await page.getByText("Surging!", { exact: true }).isVisible());
      await page.locator(".arcade").focus();
      await page.keyboard.press("a");
      await advance(page, 2500);
      return { nick: "Baton Buddy" };
    },
  );
  let speed25;
  await check("Real RPM mapping changes visible world speed", async () => {
    await advance(page, 5000);
    speed25 = Number(await page.locator(".arcade").getAttribute("data-speed"));
    assert.ok(speed25 > 9 && speed25 < 11);
    state.rpm = 50;
    state.work = 84762;
    await advance(page, 3000);
    await waitMode(page, "running");
    await advance(page, 3000);
    const speed50 = Number(
      await page.locator(".arcade").getAttribute("data-speed"),
    );
    assert.ok(speed50 > 19);
    assert.ok(speed50 > speed25 * 1.8);
    assert.ok((await page.locator(".work").innerText()).includes("84,762"));
    await shot(page, "running-desktop");
    return { speed25, speed50 };
  });
  await check(
    "Sleep instantly frosts the track, cancels boost and stops recharge",
    async () => {
      state.running = false;
      await advance(page, 3000);
      await waitMode(page, "sleeping");
      await advance(page, 200);
      const charge = await page
        .getByRole("progressbar")
        .getAttribute("aria-valuenow");
      assert.ok(
        Number(await page.locator(".arcade").getAttribute("data-speed")) <= 0.6,
      );
      assert.ok(
        await page
          .getByRole("button", { name: "Boost", exact: false })
          .isDisabled(),
      );
      await advance(page, 3000);
      assert.equal(
        await page.getByRole("progressbar").getAttribute("aria-valuenow"),
        charge,
      );
      await shot(page, "sleeping-desktop");
      return { charge };
    },
  );
  await check(
    "Status HTTP failure freezes scoring and recovery resumes",
    async () => {
      state.fail = "/v1/status";
      await advance(page, 3000);
      await waitMode(page, "reconnecting");
      await advance(page, 100);
      const before = await page.getByTestId("score").innerText();
      await advance(page, 3000);
      assert.equal(await page.getByTestId("score").innerText(), before);
      assert.ok(
        await page
          .getByRole("button", { name: "Retry live connection" })
          .isVisible(),
      );
      state.fail = undefined;
      state.running = true;
      await page.getByRole("button", { name: "Retry live connection" }).click();
      await waitMode(page, "running");
      await advance(page, 2000);
      assert.notEqual(await page.getByTestId("score").innerText(), before);
      return { frozenScore: before };
    },
  );
  await check(
    "Economy failure also pauses scoring; stale measurement is honest frost",
    async () => {
      state.fail = "/v1/economy/state";
      await advance(page, 3000);
      await waitMode(page, "reconnecting");
      await advance(page, 100);
      const before = await page.getByTestId("score").innerText();
      await advance(page, 1000);
      assert.equal(await page.getByTestId("score").innerText(), before);
      state.fail = undefined;
      state.stale = true;
      await advance(page, 3000);
      await waitMode(page, "stale");
      assert.ok(
        await page
          .getByRole("button", { name: "Boost", exact: false })
          .isDisabled(),
      );
      state.stale = false;
      await advance(page, 3000);
      await waitMode(page, "running");
    },
  );
  await check("Pause, help focus trap, Escape and resume", async () => {
    await page.locator(".arcade").focus();
    await page.keyboard.press("p");
    await advance(page, 100);
    const before = await page.getByTestId("score").innerText();
    await advance(page, 1000);
    assert.equal(await page.getByTestId("score").innerText(), before);
    await page.locator(".pause-cover .primary").click();
    await page
      .getByRole("button", { name: "How to play", exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
    const trapped = await page.evaluate(() =>
      document.querySelector("dialog").contains(document.activeElement),
    );
    assert.ok(trapped);
    for (let i = 0; i < 14; i++) await page.keyboard.press("Tab");
    assert.ok(
      await page.evaluate(() =>
        document.querySelector("dialog").contains(document.activeElement),
      ),
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(
      await page
        .getByRole("button", { name: "How to play", exact: true })
        .evaluate((e) => e === document.activeElement),
      true,
    );
  });
  await check("Two real tabs share live peers in one heat", async () => {
    const peer = await context.newPage();
    watch(peer);
    await peer.clock.install({ time: fixtureTime });
    await peer.goto(url);
    await waitMode(peer, "running");
    await peer.getByLabel("Runner name").fill("Second Runner");
    await peer.getByLabel("90s quick heat").check();
    await peer
      .getByRole("button", { name: "Play as guest", exact: true })
      .click();
    await advance(peer, 1200);
    await advance(page, 1200);
    await sleep(150);
    assert.ok(
      (await page.locator(".board-footnote").innerText()).includes(
        "1 other runner",
      ),
    );
    await peer.close();
  });
  await check(
    "Complete 90-second heat saves exact distance × final combo, replays and persists",
    async () => {
      await advance(page, 95000);
      await page
        .getByRole("heading", { name: "Little legs. Big relay." })
        .waitFor({ timeout: 10000 });
      const resultScore = Number(
        (await page.locator(".finish-score").innerText()).replace(/[^\d]/g, ""),
      );
      const saved = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("squeek-relay:scores:v1")),
      );
      assert.equal(saved.length, 1);
      assert.equal(saved[0].nick, "Baton Buddy");
      assert.equal(
        saved[0].score,
        Math.floor(saved[0].distance * saved[0].combo),
      );
      assert.equal(saved[0].score, resultScore);
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page
        .getByRole("button", { name: "Copy score", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Copied!", exact: false })
        .waitFor();
      assert.ok(
        (await page.evaluate(() => navigator.clipboard.readText())).includes(
          resultScore.toLocaleString("en-US"),
        ),
      );
      await shot(page, "heat-finished");
      await page.getByRole("button", { name: "Race again" }).click();
      assert.ok(await page.locator(".is-racing").isVisible());
      assert.equal(await page.getByTestId("score").innerText(), "0m");
      await page.reload();
      await waitMode(page, "running");
      assert.equal(
        await page.getByLabel("Runner name").inputValue(),
        "Baton Buddy",
      );
      assert.equal(
        (
          await page.evaluate(() =>
            JSON.parse(localStorage.getItem("squeek-relay:scores:v1")),
          )
        ).length,
        1,
      );
      return {
        score: resultScore,
        distance: saved[0].distance,
        combo: saved[0].combo,
      };
    },
  );
  await check(
    "Wallet discovery, unavailable-provider error and keyboard dismissal",
    async () => {
      await page.getByRole("button", { name: "Connect wallet" }).click();
      await page.getByRole("dialog", { name: "Connect a wallet" }).waitFor();
      assert.ok(
        await page
          .getByRole("button", { name: "Coinbase Wallet", exact: false })
          .isVisible(),
      );
      await page
        .getByRole("button", { name: "Browser wallet", exact: false })
        .click();
      await page
        .getByText("Wallet did not connect.", { exact: false })
        .waitFor();
      assert.ok(
        await page
          .getByRole("button", { name: "Browser wallet", exact: false })
          .isEnabled(),
      );
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 0);
    },
  );
  await context.close();

  await check(
    "EIP-6963 named discovery and actual local message signature",
    async () => {
      // A fresh ephemeral test account exists only in this test process. No key is bundled or saved.
      const account = privateKeyToAccount(generatePrivateKey());
      const c = await browser.newContext({
        viewport: { width: 1024, height: 900 },
      });
      await fixture(c, { running: true });
      const p = await c.newPage();
      watch(p);
      await p.exposeFunction("relayTestSign", async (raw) =>
        account.signMessage({ message: { raw } }),
      );
      await p.addInitScript(
        ({ address }) => {
          const handlers = new Map();
          let authorized = false;
          const provider = {
            async request({ method, params }) {
              if (method === "eth_requestAccounts") {
                authorized = true;
                return [address];
              }
              if (method === "eth_accounts") return authorized ? [address] : [];
              if (method === "eth_chainId") return "0xaa36a7";
              if (
                method === "wallet_requestPermissions" ||
                method === "wallet_getPermissions"
              )
                return [{ parentCapability: "eth_accounts" }];
              if (method === "personal_sign")
                return window.relayTestSign(params[0]);
              if (method === "wallet_revokePermissions") {
                authorized = false;
                return null;
              }
              throw new Error(`Unsupported test request: ${method}`);
            },
            on(event, fn) {
              handlers.set(event, fn);
            },
            removeListener(event) {
              handlers.delete(event);
            },
          };
          const announce = () =>
            window.dispatchEvent(
              new CustomEvent("eip6963:announceProvider", {
                detail: {
                  info: {
                    uuid: "a06d8c29-e101-4dca-b032-4b7071212345",
                    name: "Relay test wallet",
                    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle r="14" cx="14" cy="14" fill="gold"/></svg>',
                    rdns: "test.squeek-relay.wallet",
                  },
                  provider,
                },
              }),
            );
          window.addEventListener("eip6963:requestProvider", announce);
          announce();
        },
        { address: account.address },
      );
      await p.goto(url);
      await waitMode(p, "running");
      await p.getByRole("button", { name: "Connect wallet" }).click();
      assert.equal(
        await p
          .getByRole("button", { name: "Browser wallet", exact: false })
          .count(),
        0,
      );
      await p
        .getByRole("button", { name: "Relay test wallet", exact: false })
        .click();
      await p.getByRole("button", { name: "Sign free message" }).waitFor();
      await p.getByRole("button", { name: "Sign free message" }).click();
      await p.getByRole("dialog").waitFor({ state: "hidden" });
      assert.ok(
        await p
          .getByRole("button", { name: "Play relay", exact: true })
          .isVisible(),
      );
      const short = `${account.address.slice(0, 6)}…${account.address.slice(-4)}`;
      await p.getByRole("button", { name: short, exact: false }).click();
      assert.ok(
        await p
          .getByText("Identity signed for this visit", { exact: true })
          .isVisible(),
      );
      await p.getByRole("button", { name: "Disconnect", exact: true }).click();
      await p.getByRole("button", { name: "Close dialog" }).click();
      assert.ok(
        await p
          .getByRole("button", { name: "Play as guest", exact: true })
          .isVisible(),
      );
      await c.close();
    },
  );

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  });
  await fixture(mobile, { running: false });
  const phone = await mobile.newPage();
  watch(phone);
  await phone.goto(url);
  await waitMode(phone, "sleeping");
  await check(
    "Mobile wallet browsers and Coinbase Smart Wallet share one sheet",
    async () => {
      await phone.getByRole("button", { name: "Connect wallet" }).tap();
      for (const name of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
        assert.ok(
          await phone
            .getByRole("link", { name: `Open in ${name}`, exact: true })
            .isVisible(),
        );
      assert.ok(
        await phone
          .getByRole("button", { name: "Coinbase Smart Wallet", exact: false })
          .isVisible(),
      );
      const rabby = new URL(
        await phone
          .getByRole("link", { name: "Open in Rabby", exact: true })
          .getAttribute("href"),
      );
      assert.equal(rabby.searchParams.get("_cmd"), "open-dapp");
      assert.equal(rabby.searchParams.get("dapp"), url);
      await shot(phone, "wallet-mobile");
      await phone.getByRole("button", { name: "Close dialog" }).tap();
    },
  );
  await check(
    "Automated accessibility: title, wallet, help and race",
    async () => {
      const scans = [];
      for (const state of ["title", "wallet", "help", "race"]) {
        if (state === "wallet")
          await phone.getByRole("button", { name: "Connect wallet" }).tap();
        if (state === "help")
          await phone
            .getByRole("button", { name: "How to play", exact: true })
            .tap();
        if (state === "race")
          await phone
            .getByRole("button", { name: "Play as guest", exact: true })
            .tap();
        const audit = await new AxeBuilder({ page: phone })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        scans.push({
          state,
          violations: audit.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => n.target),
          })),
        });
        if (state === "wallet" || state === "help")
          await phone.getByRole("button", { name: "Close dialog" }).tap();
      }
      await writeFile(`${output}/axe.json`, JSON.stringify(scans, null, 2));
      assert.equal(
        scans.flatMap((s) => s.violations).length,
        0,
        JSON.stringify(scans),
      );
      return scans;
    },
  );
  await mobile.close();
  await check(
    "Reduced motion stops ambient animation and enlarged text reflows",
    async () => {
      const c = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
      });
      await fixture(c, { running: false });
      const p = await c.newPage();
      await p.goto(url);
      await waitMode(p, "sleeping");
      assert.equal(
        await p
          .locator(".live-badge i")
          .evaluate((e) => getComputedStyle(e).animationName),
        "none",
      );
      await p.addStyleTag({ content: "html:root{font-size:200%}" });
      assert.equal(
        await p.evaluate(
          () => getComputedStyle(document.documentElement).fontSize,
        ),
        "32px",
      );
      assert.equal(
        await p.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
        ),
        false,
      );
      await shot(p, "enlarged-text");
      await c.close();
    },
  );
  try {
    const safari = await webkit.launch({ headless: true });
    await check("WebKit mobile primary interaction", async () => {
      const c = await safari.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      await fixture(c, { running: true });
      const p = await c.newPage();
      watch(p);
      await p.goto(url);
      await waitMode(p, "running");
      await p.getByRole("button", { name: "Play as guest", exact: true }).tap();
      assert.ok(await p.locator(".is-racing").isVisible());
      await p.getByRole("button", { name: "Change lane left" }).tap();
      assert.equal(await p.locator(".arcade").getAttribute("data-lane"), "0");
      await p.getByRole("button", { name: "Boost", exact: false }).tap();
      await p.screenshot({
        path: `${output}/webkit-mobile.png`,
        fullPage: false,
        animations: "disabled",
      });
      await c.close();
    });
    await safari.close();
  } catch (e) {
    limitations.push(
      `WebKit did not launch: ${String(e.message).slice(0, 1200)}`,
    );
    console.log("LIMITATION WebKit host dependencies unavailable");
  }
  await check("No production script errors or missing local resources", () => {
    assert.equal(errors.length, 0, errors.join("\n"));
    return errors;
  });
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  const report = { at: new Date().toISOString(), results, limitations, errors };
  await writeFile(`${output}/results.json`, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        passed: results.filter((r) => r.passed).length,
        failed: results.filter((r) => !r.passed).length,
        limitations,
      },
      null,
      2,
    ),
  );
}
if (results.some((r) => !r.passed)) process.exitCode = 1;
