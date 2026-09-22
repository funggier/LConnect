import { z } from "zod";
import {
  refreshManagedProcessState,
} from "./process.mjs";
import {
  listLogFollowerSnapshots,
  pruneStoppedLogFollowers,
} from "./log-tail.mjs";
import {
  listFileWatcherSnapshots,
  pruneStoppedFileWatchers,
} from "./file-watcher.mjs";

function textResult(value, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

export function refreshTransientState({
  scope = "all",
  pruneTerminal = false,
  olderThanSeconds = 3600,
  dryRun = true,
} = {}) {
  const includeProcess = scope === "all" || scope === "process";
  const includeLog = scope === "all" || scope === "log";
  const includeWatch = scope === "all" || scope === "watch";

  const processState = includeProcess
    ? refreshManagedProcessState({
        pruneTerminal,
        olderThanSeconds,
        dryRun,
      })
    : null;

  const logBefore = includeLog ? listLogFollowerSnapshots() : [];
  const watchBefore = includeWatch ? listFileWatcherSnapshots() : [];

  let releasedFollowers = [];
  let releasedWatchers = [];

  if (pruneTerminal && !dryRun) {
    if (includeLog) releasedFollowers = pruneStoppedLogFollowers();
    if (includeWatch) releasedWatchers = pruneStoppedFileWatchers();
  }

  const logAfter = includeLog ? listLogFollowerSnapshots() : [];
  const watchAfter = includeWatch ? listFileWatcherSnapshots() : [];

  return {
    scope,
    dry_run: dryRun,
    prune_terminal: pruneTerminal,
    older_than_seconds: olderThanSeconds,
    process_sessions: processState,
    log_followers: includeLog
      ? {
          active: logAfter.filter((x) => x.running),
          stopped_or_error: logBefore.filter((x) => !x.running || x.last_error),
          released_follower_ids: releasedFollowers,
        }
      : null,
    file_watchers: includeWatch
      ? {
          active: watchAfter.filter((x) => x.running),
          stopped_or_error: watchBefore.filter((x) => !x.running || x.last_error),
          released_watcher_ids: releasedWatchers,
        }
      : null,
    persistent_os_state_modified: false,
    note: "refresh_state reconciles transient in-memory handles only. It does not restart LConnect or modify Scheduled Tasks, Services, files, or Git state.",
  };
}

export function registerTransientStateTools(server) {
  server.tool(
    "refresh_state",
    "Reconcile transient process/log/watch state and optionally prune safe terminal/stopped handles. Running work is preserved.",
    {
      scope: z.enum(["all", "process", "log", "watch"]).optional(),
      prune_terminal: z.boolean().optional(),
      older_than_seconds: z.number().min(0).max(31536000).optional(),
      dry_run: z.boolean().optional(),
    },
    async ({
      scope = "all",
      prune_terminal = false,
      older_than_seconds = 3600,
      dry_run = true,
    }) => {
      try {
        return textResult(
          refreshTransientState({
            scope,
            pruneTerminal: prune_terminal,
            olderThanSeconds: older_than_seconds,
            dryRun: dry_run,
          })
        );
      } catch (error) {
        return textResult(error.message, true);
      }
    }
  );
}
