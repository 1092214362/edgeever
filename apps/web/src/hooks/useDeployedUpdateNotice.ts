import { useSyncExternalStore } from "react";
import {
  DEPLOYED_UPDATE_SEEN_EVENT,
  hasUnseenDeployedUpdate,
  markDeployedUpdateSeen,
} from "@/lib/pwa-update-notice";
import { getReleaseTagForVersion } from "@/lib/version-check";

const isDesktopClient = () => window.edgeeverDesktop?.isAvailable === true;
const deployedReleaseId = getReleaseTagForVersion(__EDGEEVER_APP_VERSION__) ?? __EDGEEVER_APP_VERSION__;

let cachedUnseen: boolean | null = null;
const subscribers = new Set<() => void>();

const readUnseen = () => {
  if (isDesktopClient()) return false;
  cachedUnseen ??= hasUnseenDeployedUpdate(deployedReleaseId);
  return cachedUnseen;
};

const syncUnseen = () => {
  const nextUnseen = isDesktopClient() ? false : hasUnseenDeployedUpdate(deployedReleaseId);
  if (cachedUnseen === nextUnseen) return;
  cachedUnseen = nextUnseen;
  for (const notify of subscribers) notify();
};

const subscribe = (notify: () => void) => {
  subscribers.add(notify);
  if (subscribers.size === 1) {
    window.addEventListener(DEPLOYED_UPDATE_SEEN_EVENT, syncUnseen);
    window.addEventListener("storage", syncUnseen);
  }
  return () => {
    subscribers.delete(notify);
    if (subscribers.size === 0) {
      window.removeEventListener(DEPLOYED_UPDATE_SEEN_EVENT, syncUnseen);
      window.removeEventListener("storage", syncUnseen);
    }
  };
};

const markSeen = () => {
  if (isDesktopClient()) return;
  markDeployedUpdateSeen(deployedReleaseId);
  syncUnseen();
};

export const useDeployedUpdateNotice = () => {
  const unseen = useSyncExternalStore(subscribe, readUnseen, () => false);
  return { markSeen, unseen };
};
