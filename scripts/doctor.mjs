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
  if (source.startsWith("npm:")) {
    const spec = source.slice("npm:".length);
    const separator = spec.lastIndexOf("@");
    const version = spec.slice(separator + 1);
    if (
      separator <= spec.lastIndexOf("/") ||
      !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)
    ) {
      failures.push(`npm package is not pinned: ${source}`);
    }
  }
  if (source.startsWith("git:") && !source.includes("@")) {
    failures.push(`git package is not pinned: ${source}`);
  }
  if (source.startsWith(".") || source.startsWith("/")) {
    if (source !== "../../.hound/pi-extension") {
      failures.push(
        `unexpected machine-local package source remains: ${source}`,
      );
      continue;
    }
    const houndPackage = await readJson(
      join(agentDir, source, "package.json"),
    ).catch(() => undefined);
    const houndEntrypoint = await lstat(
      join(agentDir, source, "extensions/hound.ts"),
    ).catch(() => undefined);
    const houndExtensions = houndPackage?.pi?.extensions;
    if (
      houndPackage?.name !== "@houndmcp/hound-mcp-pi" ||
      houndPackage?.version !== "13.1.1" ||
      !Array.isArray(houndExtensions) ||
      houndExtensions.length !== 1 ||
      houndExtensions[0] !== "./extensions/hound.ts" ||
      !houndEntrypoint?.isFile()
    ) {
      failures.push(
        "../../.hound/pi-extension must be @houndmcp/hound-mcp-pi@13.1.1 with its Hound entrypoint",
      );
    }
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

const installedPiPackage = await readJson(
  join(
    agentDir,
    "node_modules",
    "@earendil-works",
    "pi-coding-agent",
    "package.json",
  ),
).catch(() => undefined);
const installedPiVersion = installedPiPackage?.version;
if (typeof installedPiVersion !== "string" || !installedPiVersion) {
  failures.push(
    "installed @earendil-works/pi-coding-agent version is unavailable",
  );
} else {
  console.log(`Pi ${installedPiVersion}`);
  const configuredVersion =
    rootPackage.dependencies?.["@earendil-works/pi-coding-agent"];
  if (configuredVersion !== installedPiVersion) {
    failures.push(
      `package.json pins Pi ${configuredVersion ?? "nothing"}, but the installed Pi is ${installedPiVersion}`,
    );
  }
}

const shell = process.env.SHELL || "/bin/sh";
const resolvedPi = spawnSync(shell, ["-lc", "command -v pi"], {
  cwd: agentDir,
  encoding: "utf8",
});
const runtimePiPath = resolvedPi.stdout.trim();
let runtimePiVersion;
if (resolvedPi.status !== 0 || !runtimePiPath) {
  failures.push("the login shell cannot resolve the pi executable");
} else {
  const runtimePi = spawnSync(runtimePiPath, ["--version"], {
    cwd: agentDir,
    encoding: "utf8",
    env: { ...process.env, PI_OFFLINE: "1" },
  });
  runtimePiVersion = runtimePi.stdout.trim();
  if (runtimePi.status !== 0 || !runtimePiVersion) {
    failures.push(
      `${runtimePiPath} --version failed: ${(runtimePi.stderr || runtimePi.stdout).trim()}`,
    );
  } else {
    console.log(`Pi runtime ${runtimePiVersion} (${runtimePiPath})`);
    const configuredVersion =
      rootPackage.dependencies?.["@earendil-works/pi-coding-agent"];
    if (configuredVersion !== runtimePiVersion) {
      failures.push(
        `package.json pins Pi ${configuredVersion ?? "nothing"}, but the login-shell Pi is ${runtimePiVersion}`,
      );
    }
  }
}

const compactionPackage = await readJson(
  join(agentDir, "extensions/openai-server-compaction/package.json"),
).catch(() => undefined);
if (!compactionPackage) {
  failures.push("vendored remote compaction package is unavailable");
}
const compactionRange =
  compactionPackage?.peerDependencies?.["@earendil-works/pi-coding-agent"];
if (
  compactionRange &&
  runtimePiVersion &&
  !satisfiesSimpleRange(runtimePiVersion, compactionRange)
) {
  failures.push(
    `remote compaction declares Pi ${compactionRange}, but the login-shell Pi is ${runtimePiVersion}`,
  );
}

for (const warning of warnings) console.warn(`WARN: ${warning}`);
for (const failure of failures) console.error(`FAIL: ${failure}`);

if (failures.length > 0) process.exitCode = 1;
else
  console.log(
    `Doctor passed with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.`,
  );
