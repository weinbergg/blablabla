import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Exercise the real launcher with shell commands replaced; no services or VPS access.
const mockCommands = `
id() { echo 0; }
realpath() { case "$1" in */../..) echo /srv/blabla-test/app;; *) echo "$1";; esac; }
stat() { echo cgroup2fs; }
grep() { return 0; }
awk() { case "$1" in /MemAvailable*) echo "$TEST_RAM_KIB";; /SwapFree*) echo "$TEST_SWAP_KIB";; *) return 1;; esac; }
df() { echo Available; echo "$TEST_DISK_KIB"; }
ss() { if [ -n "$TEST_PORT_BUSY" ]; then echo LISTEN; fi; }
runuser() { return 0; }
cd() { return 0; }
systemd-run() { printf '%s\\n' "$@" > "$TEST_LAUNCH_CAPTURE"; }
`;

for (const scenario of [
  { name: "rejects RAM below reserve", ram: 1200 * 1024 - 1, launch: false },
  { name: "launches at exact RAM boundary", ram: 1200 * 1024, launch: true },
  { name: "launches at observed VPS RAM", ram: 1259 * 1024, launch: true },
  { name: "rejects insufficient swap", swap: 512 * 1024 - 1, launch: false },
  { name: "rejects insufficient disk", disk: 2 * 1024 * 1024 - 1, launch: false },
  { name: "rejects occupied port", busy: "yes", launch: false },
]) {
  test(`test launcher ${scenario.name}`, t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "blabla-launch-test-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const shellEnv = path.join(directory, "mock.sh"), capture = path.join(directory, "launch.txt");
    fs.writeFileSync(shellEnv, mockCommands);
    const result = spawnSync("bash", ["deploy/test/start.sh", "--reviewed-preflight", "/usr/bin/node", "/usr/bin/pm2-runtime"], {
      encoding: "utf8",
      env: { NODE_ENV: "test", PATH: process.env.PATH, BASH_ENV: shellEnv, TEST_LAUNCH_CAPTURE: capture,
        TEST_RAM_KIB: String(scenario.ram ?? 1259 * 1024), TEST_SWAP_KIB: String(scenario.swap ?? 1960 * 1024),
        TEST_DISK_KIB: String(scenario.disk ?? 20 * 1024 * 1024), TEST_PORT_BUSY: scenario.busy ?? "" },
    });
    assert.equal(result.status, scenario.launch ? 0 : 1, result.stdout + result.stderr);
    assert.equal(fs.existsSync(capture), scenario.launch);
    if (!scenario.launch) return;
    const args = fs.readFileSync(capture, "utf8").trim().split("\n");
    for (const property of ["User=blabla-test", "MemoryHigh=550M", "MemoryMax=750M", "MemorySwapMax=256M", "OOMPolicy=kill", "InaccessiblePaths=/var/www/blabla", "ReadWritePaths=/srv/blabla-test"])
      assert(args.includes(`--property=${property}`), property);
    assert(args.includes("--unit=blabla-test"));
    assert(args.includes("PM2_HOME=/srv/blabla-test/pm2"));
  });
}
