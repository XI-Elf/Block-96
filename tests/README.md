# Headless tests

Run these commands from the repository root with Node.js:

```sh
node tests/behavior.test.js
node tests/gangs.test.js
node tests/extras.test.js
```

The harness locates the game files relative to `tests/harness.js`, so `B96_ROOT` is normally unnecessary. To load a different checkout, set `B96_ROOT` to its path, either absolute or relative to the current working directory:

```sh
B96_ROOT=/path/to/Block-96 node tests/behavior.test.js
B96_ROOT=. node tests/behavior.test.js
```

Each test builds a full city and can take time. Test failures remain visible in the final summary and exit status.
