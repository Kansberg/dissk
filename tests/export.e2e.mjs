// Start Vite, then run: node --test tests/export.e2e.mjs
// This suite blocks all external traffic and uses synthetic document content.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.DISSK_TEST_URL || 'http://127.0.0.1:5187';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

function fixture() {
  return {
    id: 'export-regression', title: 'Langt skema til eksporttest', createdAt: 1, updatedAt: 1,
    input: '<p>INPUT LEFT EDGE</p>', output: '<p>OUTPUT RIGHT EDGE</p>', outputTime: '', outputAssumption: '', outputSign: '',
    context: '<p>CONTEXT RIGHT EDGE</p>'.repeat(20), effects: { short: '<p>SHORT EFFECT</p>', long: '<p>LONG EFFECT</p>'.repeat(3) },
    steps: Array.from({ length: 9 }, (_, i) => ({ id: String(i), title: `<p>STEP ${i}</p>`, time: '',
      assumption: '<p>Assumption</p>'.repeat(i + 1),
      sign: i === 0 ? '<p>Realistic long exam content</p>'.repeat(450)
        + '<p><span style="background-color: rgb(85, 170, 51)">BOTTOM EDGE MARKER</span></p>' : '<p>Short sign</p>',
    })),
    stepSymbols: { '0': 'right', '2': 'cycle' }, showTidAnsvar: true, showAntagelser: true, showContext: true, stepLabel: 'trin',
    styles: { context: { bg: '#00ff00' }, effectsShort: { bg: '#ff00ff' }, effectsLong: { bg: '#00ffff' }, outputMid: { bg: '#ff8800' } },
  };
}

async function session() {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.addInitScript(document => sessionStorage.setItem('dissk_anon_session', JSON.stringify(document)), fixture());
  await page.goto(`${base}/editor/new`);
  await page.locator('.ql-editor').first().waitFor();
  await page.waitForTimeout(150);
  return { context, page };
}

test('dynamic heights follow text, uniform heights match their row, and editor content is untouched', async () => {
  const { context, page } = await session();
  try {
    const result = await page.evaluate(async () => {
      const { applyExportBoxLayout } = await import('/src/utils/exportLayout.ts');
      const panel = document.querySelector('[data-editor-zoom]').firstElementChild;
      const before = panel.outerHTML;
      const clone = panel.cloneNode(true);
      clone.style.transform = 'none';
      document.body.appendChild(clone);
      const heights = row => [...clone.querySelectorAll(`[data-export-row="${row}"]`)].map(el => el.getBoundingClientRect().height);
      applyExportBoxLayout(clone, 'dynamic');
      const dynamic = heights('sign');
      const maximumNaturalHeight = Math.max(...dynamic);
      applyExportBoxLayout(clone, 'uniform');
      const uniform = heights('sign');
      const effects = heights('effects');
      const allContentFits = [...clone.querySelectorAll('.ql-editor')].every(el => el.scrollHeight <= el.clientHeight + 1);
      clone.remove();
      return { dynamic, uniform, effects, maximumNaturalHeight, allContentFits, unchanged: panel.outerHTML === before };
    });
    assert(result.dynamic[0] > 5000, 'fixture exercises a source taller than the Original export');
    assert(result.dynamic[1] < 100, 'short boxes shrink to their own content');
    assert(result.uniform.every(h => Math.abs(h - result.maximumNaturalHeight) <= 1), 'row uses its largest natural box');
    assert(Math.abs(result.effects[0] - result.effects[1]) <= 1, 'effect boxes form their own uniform row');
    assert(result.allContentFits, 'text has no hidden internal scroll area');
    assert(result.unchanged, 'export layout does not change saved/editor content');
  } finally { await context.close(); }
});

for (const boxLayout of ['dynamic', 'uniform']) for (const size of ['original', 'A4', 'A2']) {
  test(`PNG ${size}, ${boxLayout}: all right-edge fields and bottom marker are rendered`, async () => {
    const { context, page } = await session();
    try {
      const downloadPromise = page.waitForEvent('download');
      await page.evaluate(async options => {
        const { exportDissk } = await import('/src/utils/exportDissk.ts');
        await exportDissk(document.querySelector('[data-editor-zoom]').firstElementChild, options);
      }, { format: 'png', size, boxLayout });
      const download = await downloadPromise;
      const data = (await readFile(await download.path())).toString('base64');
      const pixels = await page.evaluate(async data => {
        const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
        const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
        const rgba = ctx.getImageData(0, 0, img.width, img.height).data;
        const counts = { context: 0, short: 0, long: 0, output: 0, bottom: 0 };
        const colors = { '0,255,0': 'context', '255,0,255': 'short', '0,255,255': 'long', '255,136,0': 'output', '85,170,51': 'bottom' };
        for (let i = 0; i < rgba.length; i += 16) {
          const name = colors[`${rgba[i]},${rgba[i + 1]},${rgba[i + 2]}`];
          if (name && rgba[i + 3] === 255) counts[name]++;
        }
        return { counts, width: img.width, height: img.height };
      }, data);
      for (const [field, count] of Object.entries(pixels.counts)) assert(count > 5, `${field} is present in the actual downloaded image`);
      assert(pixels.width * pixels.height <= 64_000_000);
      if (size === 'original') assert.equal(Math.max(pixels.width, pixels.height), 5000);
    } finally { await context.close(); }
  });
}

test('PDF export completes in both layouts', async () => {
  const { context, page } = await session();
  try {
    for (const boxLayout of ['dynamic', 'uniform']) {
      const downloadPromise = page.waitForEvent('download');
      await page.evaluate(async boxLayout => {
        const { exportDissk } = await import('/src/utils/exportDissk.ts');
        await exportDissk(document.querySelector('[data-editor-zoom]').firstElementChild, { format: 'pdf', size: 'A4', boxLayout });
      }, boxLayout);
      const download = await downloadPromise;
      const data = await readFile(await download.path());
      assert.equal(data.subarray(0, 5).toString(), '%PDF-');
      assert(data.length > 10_000);
    }
  } finally { await context.close(); }
});

test('a tall nine-step document fits Auto and both scroll directions work in manual view', async () => {
  const { context, page } = await session();
  try {
    await page.waitForFunction(() => {
      const scroll = document.querySelector('.editor-scroll');
      const panel = scroll.querySelector('[data-editor-zoom]').firstElementChild.getBoundingClientRect();
      const bounds = scroll.getBoundingClientRect();
      return panel.bottom <= bounds.bottom && panel.right <= bounds.right;
    });
    const zoom = await page.locator('[data-editor-zoom]').evaluate(el => Number(el.style.transform.match(/scale\(([^)]+)\)/)[1]));
    assert(zoom < 0.3, 'large document is allowed below the former 30% limit');
    await page.getByRole('button', { name: /^\d+%$/ }).click();
    await page.mouse.move(600, 400); await page.mouse.wheel(500, 500); await page.waitForTimeout(150);
    const scroll = await page.locator('.editor-scroll').evaluate(el => ({ left: el.scrollLeft, top: el.scrollTop }));
    assert(scroll.left > 0 && scroll.top > 0, 'real wheel input reaches both dimensions');
  } finally { await context.close(); }
});
