# v75.1 — baseline profile

Measured in the cloud workspace on commit `d47dc5d`. No game code changed. The host reports 5 x86_64 AMD EPYC 9V74 vCPUs and 33 GiB RAM. Browser runs used Chromium 156.0.8078.79 in headless mode at 1280 × 720 and device scale factor 1. The scripted raid used seed 31337, started at midnight with a level 1 player, and contained 1,837 buildings and approximately 579 enemies after a one-second warm-up.

## Reproduce

Run from the repository root. The optional browser profile requires Playwright and Chromium installed in the environment.

```sh
python3 -m http.server 8765
# In another terminal:
node tests/profile-browser.js
```

The script loads `index.html` over HTTP, enters the base, starts a raid through the game's `gangGo` click handler, waits one second, samples `requestAnimationFrame` intervals and Chrome Performance metrics for eight seconds, then collects a five-second V8 CPU profile. It reports the GPU renderer and feature status through Chrome DevTools Protocol. `Date.now` is fixed at 31337 in the page to hold the seed constant. No controls are pressed during sampling.

## Results

| Browser run | Raid startup | Frame interval P50 / P95 / P99 | JS heap used after eight seconds | Script time during eight seconds |
| --- | ---: | ---: | ---: | ---: |
| 1 | 1,191 ms | 33.3 / 33.4 / 50.0 ms | 134.6 MiB | 2.16 s |
| 2 | 1,370 ms | 33.3 / 50.0 / 50.1 ms | 134.8 MiB | 2.19 s |
| 3, saved script | 1,315 ms | 33.3 / 33.4 / 50.0 ms | 133.8 MiB | 2.26 s |

Chrome reported 0 page script errors in each run. The V8 sampling profile repeatedly identified `game.js` `updateInside` and `render`, `enemies.js` `step`, and native `drawImage` among the sampled functions. Most samples were labelled `(program)`, so these counts do not establish an exclusive CPU cost for each function. `updateInside` iterates the interior-bearing buildings each frame. Profiling identifies it as a candidate for later investigation, not a measured optimization gain.

For a separate headless Node memory snapshot, run `node --expose-gc` with `H.boot({ seed: 31337, hour: 0, home: 'pavlov_yar' })`, then `h.step(10)`, calling `global.gc()` before each `process.memoryUsage()` sample. Node 24.22.3 measured RSS of 27.7 MiB before boot, 386.9 MiB after boot, and 423.5 MiB after 600 ticks. Corresponding heap used was 4.1, 196.9, and 199.1 MiB. That simulation contained 617 enemies after the ticks. This process memory is separate from Chromium's JS heap and cannot be compared directly with it.

## Limits

Chrome reported a SwiftShader software renderer, software rasterization, and software GPU compositing. Hardware GPU time, graphics memory, phone frame time, thermals, and Android/iOS memory remain unmeasured. Frame intervals reflect this headless cloud computer and include browser scheduling. The three browser runs describe one fixed scenario; later comparisons must keep the same seed, viewport, renderer, and sampling window. A real-device profile is needed before drawing conclusions about mobile performance.
