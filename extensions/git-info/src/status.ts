export interface GitStatusSnapshot {
  branchName: string | null;
  changedFiles: number;
}

/** Parse `git status --porcelain=v1 --branch` without another Git process. */
export function parseGitStatus(output: string): GitStatusSnapshot | null {
  const lines = output.split("\n");
  const header = lines[0]?.replace(/\r$/, "");
  if (!header?.startsWith("## ")) return null;

  const branchHeader = header.slice(3);
  let branchName: string | null;
  if (branchHeader === "HEAD (no branch)") {
    branchName = null;
  } else if (branchHeader.startsWith("No commits yet on ")) {
    branchName = branchHeader.slice("No commits yet on ".length);
  } else if (branchHeader.startsWith("Initial commit on ")) {
    branchName = branchHeader.slice("Initial commit on ".length);
  } else {
    branchName = branchHeader.split("...")[0] ?? null;
  }

  const changedFiles = lines
    .slice(1)
    .filter((line) => line.replace(/\r$/, "").length > 0).length;
  return { branchName, changedFiles };
}
