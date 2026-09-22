const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join } = require("node:path");

const signingIdentity = (appPath) => {
  const result = spawnSync("codesign", ["-dvv", appPath], { encoding: "utf8" });
  const details = `${result.stdout || ""}\n${result.stderr || ""}`;
  const authority = details.match(/^Authority=(.*)$/m)?.[1]?.trim();
  if (!authority || authority === "-" || authority.startsWith("Signature=")) return "-";
  return authority;
};

const codesign = (identity, args) => {
  const command = ["--force", "--sign", identity, "--generate-entitlement-der"];
  if (process.env.CSC_KEYCHAIN) command.push("--keychain", process.env.CSC_KEYCHAIN);
  if (identity !== "-") command.push("--timestamp");
  command.push(...args);
  const result = spawnSync("codesign", command, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "codesign failed");
  }
};

// electron-builder signs nested code with the Electron helper entitlements.
// The share extension has to keep its own sandbox entitlements instead.
module.exports = async function signShareExtension(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const appexPath = join(appPath, "Contents", "PlugIns", "EdgeEverShare.appex");
  if (!existsSync(appexPath)) {
    throw new Error(`macOS share extension is missing from the app bundle: ${appexPath}`);
  }
  const identity = signingIdentity(appPath);
  const entitlements = join(__dirname, "..", "share-extension", "EdgeEverShare.entitlements");
  codesign(identity, ["--entitlements", entitlements, appexPath]);
  codesign(identity, ["--preserve-metadata=entitlements,requirements,flags,runtime", appPath]);
};
