// Start Vite first. Run with: node --test tests/editor-zoom.e2e.mjs
// PLAYWRIGHT_MODULE can point to an existing Playwright installation.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.env.DISSK_TEST_URL || 'http://127.0.0.1:5187';
let browser;

before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function readView(page) {
  return page.locator('.editor-scroll').evaluate(scroll => {
    const wrapper = scroll.firstElementChild;
    const panel = wrapper.firstElementChild;
    return {
      zoom: Number(wrapper.style.transform.match(/scale\(([^)]+)\)/)[1]),
      overflow: scroll.style.overflow,
      left: scroll.scrollLeft,
      top: scroll.scrollTop,
      fit: Math.max(0.3, Math.min(1,
        (scroll.clientWidth - 16) / panel.scrollWidth,
        (scroll.clientHeight - 16) / panel.scrollHeight)),
    };
  });
}

async function assertAutoFit(page) {
  await assert.doesNotReject(() => page.waitForFunction(() => {
    const scroll = document.querySelector('.editor-scroll');
    const wrapper = scroll?.firstElementChild;
    const panel = wrapper?.firstElementChild;
    if (!panel) return false;
    const zoom = Number(wrapper.style.transform.match(/scale\(([^)]+)\)/)?.[1]);
    const fit = Math.max(0.3, Math.min(1,
      (scroll.clientWidth - 16) / panel.scrollWidth,
      (scroll.clientHeight - 16) / panel.scrollHeight));
    return scroll.style.overflow === 'hidden' && Math.abs(zoom - fit) <= 0.02;
  }));
}

for (const steps of [3, 7]) for (const scale of [1, 1.25, 1.5]) {
  test(`${steps} steps, Full HD at ${scale * 100}% scaling`, async () => {
    const viewport = { width: Math.round(1920 / scale), height: Math.round(1080 / scale) };
    const context = await browser.newContext({ viewport, deviceScaleFactor: scale });
    try {
      // Keep test sessions and recovery backups away from production services.
      await context.route('**/*', route =>
        new URL(route.request().url()).origin === new URL(baseUrl).origin
          ? route.continue() : route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ steps }) => {
        sessionStorage.setItem('dissk_anon_session', JSON.stringify({
          id: 'zoom-regression', title: 'Zoomtest', createdAt: Date.now(), updatedAt: Date.now(),
          input: '', steps: Array.from({ length: steps }, (_, i) => ({
            id: `step-${i}`, title: `Trin ${i + 1}`, time: '', assumption: '', sign: '',
          })),
          output: '', outputTime: '', outputAssumption: '', outputSign: '',
          effects: { short: '', long: '' }, context: '', showTidAnsvar: true,
          showAntagelser: true, showContext: false, stepLabel: 'trin', styles: {}, stepSymbols: {},
        }));
      }, { steps });
      await page.goto(`${baseUrl}/editor/new`);
      await page.locator('.ql-editor').first().waitFor();
      await assertAutoFit(page);
      const initial = await readView(page);

      // One click must select manual zoom even when a field loses focus.
      await page.getByRole('button', { name: /^\d+%$/ }).click();
      await page.waitForTimeout(150);
      assert.equal((await readView(page)).zoom, 1);
      const times = page.locator('.ql-editor[data-placeholder="Tid & ansvar"]');
      await times.nth(0).click({ position: { x: 120, y: 20 } });
      await page.keyboard.type('Zoom regression');
      const target = await times.nth(1).boundingBox();
      const point = { x: target.x + 150, y: target.y + 20 };
      await page.mouse.click(point.x, point.y);
      await page.waitForTimeout(150);
      assert.equal((await readView(page)).zoom, 1, 'column switch keeps manual zoom');
      assert.deepEqual(await times.nth(1).boundingBox(), target, 'clicked field stays in place');
      assert(await times.nth(1).evaluate((el, point) =>
        document.activeElement === el && el.contains(document.elementFromPoint(point.x, point.y)), point));
      assert.match(await page.evaluate(() => JSON.parse(sessionStorage.getItem('dissk_anon_session')).steps[0].time), /Zoom regression/);

      await page.keyboard.type('Second column');
      await page.locator('.ql-editor[data-placeholder="Antagelser"]').nth(1)
        .click({ position: { x: 120, y: 20 } });
      await page.waitForTimeout(150);
      assert.equal((await readView(page)).zoom, 1, 'row switch keeps manual zoom');
      assert.match(await page.evaluate(() => JSON.parse(sessionStorage.getItem('dissk_anon_session')).steps[1].time), /Second column/);

      await page.getByRole('button', { name: '+', exact: true }).click();
      await page.waitForTimeout(150);
      assert.equal((await readView(page)).zoom, 1.1);
      await page.getByRole('button', { name: '–', exact: true }).click();
      await page.getByRole('button', { name: '–', exact: true }).click();
      assert.equal((await readView(page)).zoom, 0.9);

      await page.locator('.editor-scroll').evaluate(scroll => scroll.scrollTo({ left: 100, top: 120 }));
      const scrolled = await readView(page);
      assert(scrolled.left > 0 && scrolled.top > 0, 'manual mode allows scrolling in both directions');
      await page.setViewportSize({ width: viewport.width - 160, height: viewport.height - 80 });
      await page.waitForTimeout(150);
      const resized = await readView(page);
      assert.equal(resized.zoom, 0.9, 'viewport resize respects manual zoom');
      assert.equal(resized.left, scrolled.left);
      assert.equal(resized.top, scrolled.top);

      await page.getByRole('button', { name: 'Auto', exact: true }).click();
      await assertAutoFit(page);
      assert.equal((await readView(page)).left, 0);
      assert.equal((await readView(page)).top, 0);
      await page.setViewportSize(viewport);
      await assertAutoFit(page);
      assert(Math.abs((await readView(page)).zoom - initial.zoom) <= 0.02, 'Auto follows viewport size');

      // A real layout change should still trigger Auto, without observing focus decorations.
      const beforeLayout = await readView(page);
      await page.locator('.editor-scroll > div > div').evaluate(panel => { panel.style.width = `${panel.offsetWidth + 800}px`; });
      await assertAutoFit(page);
      assert((await readView(page)).zoom < beforeLayout.zoom, 'Auto follows canvas size');
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });
}
