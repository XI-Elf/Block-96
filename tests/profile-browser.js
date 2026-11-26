// Browser baseline for a fixed Block-96 raid. Requires Playwright and Chromium.
// From the repository root: python3 -m http.server 8765
// In another terminal: node tests/profile-browser.js
const { chromium } = require('playwright');

const URL = 'http://127.0.0.1:8765/';
const SEED = 31337;

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
}

function metricMap(result) {
  return Object.fromEntries(result.metrics.map(({ name, value }) => [name, value]));
}

async function main() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const browserCdp = await browser.newBrowserCDPSession();
    const { gpu } = await browserCdp.send('SystemInfo.getInfo');
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    await page.addInitScript(seed => { Date.now = () => seed; }, SEED);

    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('#start').click();

    const bootStart = Date.now();
    await page.evaluate(() => document.querySelector('#gangGo').click());
    const bootMs = Date.now() - bootStart;
    await page.waitForTimeout(1000);

    const world = await page.evaluate(() => ({
      hour: WL_DEBUG.s.hour,
      enemies: WL_DEBUG.s.enemies.length,
      playerLevel: Object.values(WL_DEBUG.s.players)[0].level,
      buildings: WL_DEBUG.s.map.city.buildings.length,
    }));

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const before = metricMap(await cdp.send('Performance.getMetrics'));
    const frames = await page.evaluate(() => new Promise(resolve => {
      const start = performance.now();
      const intervals = [];
      let previous = start;

      function sample(now) {
        intervals.push(now - previous);
        previous = now;
        if (now - start < 8000) requestAnimationFrame(sample);
        else resolve(intervals.slice(1));
      }

      requestAnimationFrame(sample);
    }));
    const after = metricMap(await cdp.send('Performance.getMetrics'));

    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.start');
    await page.waitForTimeout(5000);
    const { profile } = await cdp.send('Profiler.stop');
    const topFunctions = profile.nodes
      .filter(node => node.hitCount)
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, 12)
      .map(node => ({
        name: node.callFrame.functionName,
        file: node.callFrame.url.split('/').pop(),
        line: node.callFrame.lineNumber + 1,
        samples: node.hitCount,
      }));

    console.log(JSON.stringify({
      seed: SEED,
      browser: browser.version(),
      gpu: {
        devices: gpu.devices.map(device => ({ vendor: device.vendorString, name: device.deviceString })),
        features: gpu.featureStatus,
      },
      world,
      bootMs,
      frameIntervalsMs: {
        count: frames.length,
        p50: percentile(frames, 0.5),
        p95: percentile(frames, 0.95),
        p99: percentile(frames, 0.99),
        max: Math.max(...frames),
      },
      performance: {
        taskSeconds: after.TaskDuration - before.TaskDuration,
        scriptSeconds: after.ScriptDuration - before.ScriptDuration,
        layoutSeconds: after.LayoutDuration - before.LayoutDuration,
        heapUsedMiB: after.JSHeapUsedSize / 1048576,
        heapTotalMiB: after.JSHeapTotalSize / 1048576,
      },
      cpuSamples: { count: profile.samples.length, topFunctions },
      errors,
    }, null, 2));
    if (errors.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
