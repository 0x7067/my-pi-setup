import { chmod, lstat, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const agentDir = dirname(dirname(fileURLToPath(import.meta.url)));
const privateTrees = [
  "sessions",
  "pi-hermes-memory",
  "projects-memory",
  "backups",
];
const privateRootFiles = new Set([
  ".env",
  "auth.json",
  "models.json",
  "models-store.json",
  "trust.json",
]);

let directories = 0;
let files = 0;

async function hardenTree(path) {
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  if (stat.isSymbolicLink()) return;
  if (!stat.isDirectory()) {
    await chmod(path, 0o600);
    files += 1;
    return;
  }

  await chmod(path, 0o700);
  directories += 1;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    await hardenTree(join(path, entry.name));
  }
}

await chmod(agentDir, 0o700);
directories += 1;

for (const name of privateTrees) {
  await hardenTree(join(agentDir, name));
}

for (const entry of await readdir(agentDir, { withFileTypes: true })) {
  if (
    entry.isFile() &&
    (privateRootFiles.has(entry.name) ||
      entry.name.endsWith(".sqlite") ||
      entry.name.includes(".sqlite-"))
  ) {
    await hardenTree(join(agentDir, entry.name));
  }
}

console.log(
  `Hardened ${directories} directories and ${files} files under ${agentDir}.`,
);
