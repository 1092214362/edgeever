export const isMountedInstallerPath = (appPath, platform = process.platform) => {
  if (platform !== "darwin" || typeof appPath !== "string") return false;
  return appPath === "/Volumes" || appPath.startsWith("/Volumes/");
};
