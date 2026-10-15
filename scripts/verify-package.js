// (c) 2026 Ash
// SPDX-License-Identifier: MIT
// verify-package.js
// ---------------------------------------------------------------------------

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
const npm = [
  process.env.npm_execpath,
  join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
  join(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"),
].find((path) => path?.endsWith("npm-cli.js") && existsSync(path));
if (!npm) throw new Error("Cannot locate npm-cli.js; run through npm run verify:package.");
const root = await mkdtemp(join(tmpdir(), "package-smoke-"));
const allowed = new Set([
  "path",
  "systemroot",
  "windir",
  "comspec",
  "pathext",
  "temp",
  "tmp",
  "tmpdir",
  "home",
  "userprofile",
  "localappdata",
  "appdata",
  "systemdrive",
  "lang",
  "lc_all",
]);
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => allowed.has(key.toLowerCase())),
);
try {
  await writeFile(join(root, "package.json"), JSON.stringify({ private: true, type: "module" }));
  await writeFile(join(root, "user.npmrc"), "");
  await writeFile(join(root, "global.npmrc"), "");
  const config = [
    "--userconfig",
    join(root, "user.npmrc"),
    "--globalconfig",
    join(root, "global.npmrc"),
  ];
  const packed = run(
    [npm, "pack", "--ignore-scripts", "--json", "--pack-destination", root, ...config],
    project,
  );
  const filename = JSON.parse(packed)[0].filename;
  run(
    [
      npm,
      "install",
      join(root, filename),
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      ...config,
    ],
    root,
  );
  const demo = await readFile(join(project, "examples/demo.js"), "utf8");
  await writeFile(join(root, "demo.mjs"), demo);
  process.stdout.write(run([join(root, "demo.mjs")], root));
  await writeFile(
    join(root, "mcp.mjs"),
    await readFile(join(project, "scripts/verify-mcp.js"), "utf8"),
  );
  run([join(root, "mcp.mjs")], root);
  console.log(`PASS packed ${pkg.name}@${pkg.version}: API and executable`);
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

function run(args, cwd) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env,
    encoding: "utf8",
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(result.stderr || result.error?.message || "Process failed.");
  return result.stdout;
}
