import { execFileSync } from "node:child_process";

const [platform, baseRef, headRef] = process.argv.slice(2);

if (!["mobile", "desktop"].includes(platform) || !baseRef || !headRef) {
  console.error(
    "Usage: node scripts/plan-native-release.mjs <mobile|desktop> <base-ref> <head-ref>",
  );
  process.exit(1);
}

const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
  }).trim();

const changedFiles = git("diff", "--name-only", `${baseRef}...${headRef}`)
  .split("\n")
  .filter(Boolean);
const runtimeChangedFiles = changedFiles.filter(
  (file) => !file.endsWith(".md"),
);

const packageJsonChangedBeyondVersion = () => {
  if (!changedFiles.includes("package.json")) return false;

  const readPackage = (ref) => {
    const packageJson = JSON.parse(git("show", `${ref}:package.json`));
    delete packageJson.version;
    return packageJson;
  };

  return (
    JSON.stringify(readPackage(baseRef)) !==
    JSON.stringify(readPackage(headRef))
  );
};

const relevantPrefixes =
  platform === "mobile"
    ? ["apps/mobile/", "packages/client/", "packages/shared/"]
    : ["apps/desktop/", "crates/desktop-sidecar/"];

const relevantFiles =
  platform === "mobile"
    ? new Set(["bun.lock", "scripts/build-android-local.sh"])
    : new Set([
        "scripts/run-desktop-builder.mjs",
        "scripts/verify-desktop-package.mjs",
      ]);

const relevantChanges = runtimeChangedFiles.filter(
  (file) =>
    relevantPrefixes.some((prefix) => file.startsWith(prefix)) ||
    relevantFiles.has(file) ||
    (platform === "mobile" &&
      file === "package.json" &&
      packageJsonChangedBeyondVersion()),
);

const rebuild = relevantChanges.length > 0;

process.stdout.write(`rebuild=${rebuild}\n`);
process.stderr.write(
  `${platform} release plan: ${rebuild ? "rebuild" : "reuse"}${
    relevantChanges.length > 0 ? ` (${relevantChanges.join(", ")})` : ""
  }\n`,
);
