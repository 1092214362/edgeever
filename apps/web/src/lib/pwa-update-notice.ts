export const PWA_UPDATE_NOTICE_EVENT = "edgeever:pwa-update-notice";
export const DEPLOYED_UPDATE_SEEN_EVENT = "edgeever:deployed-update-seen";

const DEPLOYED_RELEASE_ID_KEY = "edgeever:deployed-release-id:v1";
const DEPLOYED_SEEN_RELEASE_ID_KEY = "edgeever:deployed-seen-release-id:v1";

export type PwaUpdateNoticeKind = "checking" | "reload-required";

export type PwaUpdateNoticeDetail = {
  kind: PwaUpdateNoticeKind;
};

export type PwaUpdateNoticeEvent = CustomEvent<PwaUpdateNoticeDetail>;

export const emitPwaUpdateNotice = (detail: PwaUpdateNoticeDetail) => {
  window.dispatchEvent(new CustomEvent<PwaUpdateNoticeDetail>(PWA_UPDATE_NOTICE_EVENT, { detail }));
};

export const hasUnseenDeployedUpdate = (currentReleaseId: string) => {
  try {
    const previousReleaseId = window.localStorage.getItem(DEPLOYED_RELEASE_ID_KEY);
    const seenReleaseId = window.localStorage.getItem(DEPLOYED_SEEN_RELEASE_ID_KEY);

    if (!previousReleaseId) {
      window.localStorage.setItem(DEPLOYED_RELEASE_ID_KEY, currentReleaseId);
      window.localStorage.setItem(DEPLOYED_SEEN_RELEASE_ID_KEY, currentReleaseId);
      return false;
    }

    if (previousReleaseId !== currentReleaseId) {
      window.localStorage.setItem(DEPLOYED_RELEASE_ID_KEY, currentReleaseId);
    }

    if (!seenReleaseId) {
      window.localStorage.setItem(DEPLOYED_SEEN_RELEASE_ID_KEY, previousReleaseId);
      return previousReleaseId !== currentReleaseId;
    }

    return seenReleaseId !== currentReleaseId;
  } catch {
    return false;
  }
};

export const markDeployedUpdateSeen = (currentReleaseId: string) => {
  try {
    window.localStorage.setItem(DEPLOYED_RELEASE_ID_KEY, currentReleaseId);
    window.localStorage.setItem(DEPLOYED_SEEN_RELEASE_ID_KEY, currentReleaseId);
  } catch {
    // Storage can be unavailable in restricted browsing modes.
  }
  window.dispatchEvent(new Event(DEPLOYED_UPDATE_SEEN_EVENT));
};
