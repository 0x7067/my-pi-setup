import { lstat, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const agentDir = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
const warnings = [];

const mode = (stat) => stat.mode & 0o777;
const octal = (value) => value.toString(8).padStart(3, "0");
const compareVersions = (left, right) => {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
};

const satisfiesSimpleRange = (version, range) =>
  range.split(/\s+/).every((constraint) => {
    const match = constraint.match(/^(>=|<=|>|<|=)?(\d+\.\d+\.\d+)$/);
    if (!match) return false;
    const comparison = compareVersions(version, match[2]);
    switch (match[1] ?? "=") {
      case ">=":
        return comparison >= 0;
      case "<=":
        return comparison <= 0;
      case ">":
        return comparison > 0;
      case "<":
        return comparison < 0;
      default:
        return comparison === 0;
    }
  });

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function expectMode(relativePath, expected) {
  const path = join(agentDir, relativePath);
  try {
    const stat = await lstat(path);
    const actual = mode(stat);
    if (actual !== expected) {
      failures.push(
        `${relativePath} is ${octal(actual)}; expected ${octal(expected)}`,
      );
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const nodeMajor = Number.parseInt(
  process.versions.node.split(".")[0] ?? "0",
  10,
);
if (nodeMajor < 22)
  failures.push(`Node ${process.versions.node} is too old; expected Node 22+`);

const settings = await readJson(join(agentDir, "settings.json"));
if (settings.defaultProjectTrust !== "ask") {
  failures.push('settings.defaultProjectTrust must be "ask"');
}
if (settings.compaction?.enabled !== true) {
  failures.push("automatic compaction is not enabled");
}

for (const source of settings.packages ?? []) {
  if (source.startsWith("npm:") && source.lastIndexOf("@") <= 3) {
    failures.push(`npm package is not pinned: ${source}`);
  }
  if (source.startsWith("git:") && !source.includes("@")) {
    failures.push(`git package is not pinned: ${source}`);
  }
  if (source.startsWith(".") || source.startsWith("/")) {
    failures.push(`machine-local package source remains: ${source}`);
  }
}

const rootPackage = await readJson(join(agentDir, "package.json"));
if (!rootPackage.workspaces?.includes("extensions/*")) {
  failures.push("package.json does not install extensions as workspaces");
}

await expectMode(".", 0o700);
await expectMode(".env", 0o600);
await expectMode("auth.json", 0o600);
await expectMode("models-store.json", 0o600);
for (const path of [
  "sessions",
  "pi-hermes-memory",
  "projects-memory",
  "backups",
]) {
  await expectMode(path, 0o700);
}

const pi = spawnSync("pi", ["--version"], {
  cwd: agentDir,
  encoding: "utf8",
  env: { ...process.env, PI_OFFLINE: "1" },
});
if (pi.status !== 0) {
  failures.push(`pi --version failed: ${(pi.stderr || pi.stdout).trim()}`);
} else {
  console.log(`Pi ${pi.stdout.trim()}`);
  const configuredVersion =
    rootPackage.dependencies?.["@earendil-works/pi-coding-agent"];
  if (configuredVersion !== pi.stdout.trim()) {
    failures.push(
      `package.json pins Pi ${configuredVersion ?? "nothing"}, but the installed Pi is ${pi.stdout.trim()}`,
    );
  }
}

const compactionPackage = await readJson(
  join(
    agentDir,
    "git/github.com/algal/pi-openai-server-compaction/package.json",
  ),
).catch(() => undefined);
const compactionRange =
  compactionPackage?.peerDependencies?.["@earendil-works/pi-coding-agent"];
if (
  compactionRange &&
  pi.status === 0 &&
  !satisfiesSimpleRange(pi.stdout.trim(), compactionRange)
) {
  warnings.push(
    `remote compaction declares Pi ${compactionRange}, but the installed Pi is ${pi.stdout.trim()}`,
  );
}

for (const warning of warnings) console.warn(`WARN: ${warning}`);
for (const failure of failures) console.error(`FAIL: ${failure}`);

if (failures.length > 0) process.exitCode = 1;
else
  console.log(
    `Doctor passed with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.`,
  );
