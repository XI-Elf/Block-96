# v75.2 — city initialization timing

Measured on commit `3c05a43` in the cloud workspace with Node.js 24.22.3 on a 5-vCPU AMD EPYC 9V74 host. Game code was unchanged. The timing script is `tests/profile-boot.js`.

Run from the repository root three times:

```sh
node --expose-gc tests/profile-boot.js
```

Each process loads the headless game modules once, then creates six worlds in a fixed sequence: seeds 31337, 12345, and 424242, repeated twice. For every world, the script calls `S.newWorld(seed, null, [], 'pavlov_yar')`, creates one player, sets the hour to midnight, and executes one 1/60-second simulation tick. It times module loading, world creation, player creation, and the first tick separately with `performance.now()`. Garbage collection runs before each world and outside the timed sections. The first tick initializes the nighttime NPC population.

| Phase | First seed 31337 in each new process | Later worlds in the same process |
| --- | --- | --- |
| Headless module load | 42–116 ms | Performed once per process |
| `newWorld` | 2,311–3,657 ms; median 3,105 ms | 1,567–2,387 ms; median 1,781 ms |
| First simulation tick | 642–692 ms; median 677 ms | 602–707 ms; median 660 ms |

For seed 31337 on the second pass through each process, `newWorld` took 1,633–1,796 ms and the first tick took 619–637 ms. Player creation was below 0.5 ms in the first run. Seed 31337 produced 1,837 buildings, 502,251 wall records, 7,793 containers, and 609 enemies after the first tick. The other two seeds produced 502,315–503,792 walls and 7,672–7,770 containers. Counts were identical between rounds for each seed.

`newWorld` includes city geometry, interiors, containers, collision indexing, and initial static spawns. The first tick adds the main nighttime population. The measured phases show that world creation consumes most of the headless startup time in this scenario. They do not attribute that cost to a specific geometry operation. Successive processes also benefit from warmed filesystem caches, so the first-world range is a host observation rather than a controlled cold-disk benchmark.

These timings exclude browser asset decoding, Canvas rendering, and device GPU work. The browser raid startup observations in `PROFILE_V75_1.md` include a different path and are not directly comparable. Use the same script, seeds, host class, and phase definitions when evaluating later changes.
