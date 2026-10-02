// Central public-tool metadata policy for LConnect.
// Keep this registry synchronized with the actual runtime catalog.
// Tests fail if a registered tool is missing here or if an entry is stale.

export const PUBLIC_TOOL_NAMES = Object.freeze([
  "batch_inspect",
  "battery_info",
  "browser_attach",
  "browser_click",
  "browser_live_attach",
  "browser_live_click",
  "browser_live_snapshot",
  "browser_live_stop",
  "browser_live_tabs",
  "browser_live_type",
  "browser_navigate",
  "browser_screenshot",
  "browser_snapshot",
  "browser_start",
  "browser_stop",
  "browser_tabs",
  "browser_type",
  "clipboard_clear",
  "clipboard_get",
  "clipboard_set",
  "close_window",
  "command_run",
  "compare_directories",
  "compare_files",
  "cpu_info",
  "create_directory",
  "create_scheduled_task",
  "delete_scheduled_task",
  "delivery_snapshot",
  "deployment_verification_snapshot",
  "detect_build_system",
  "detect_project",
  "directory_manifest",
  "directory_tree",
  "disable_scheduled_task",
  "disk_info",
  "dns_lookup",
  "edit_file",
  "enable_scheduled_task",
  "env_get",
  "env_list",
  "env_set",
  "file_hash",
  "find_process",
  "focus_window",
  "follow_log",
  "get_file_info",
  "get_scheduled_task",
  "get_service",
  "get_window",
  "git_branch",
  "git_commit",
  "git_diff",
  "git_fetch",
  "git_is_ancestor",
  "git_log",
  "git_pull",
  "git_push",
  "git_push_ref",
  "git_remote_ref",
  "git_status",
  "git_sync_status",
  "git_worktree",
  "github_commit_run_status",
  "github_release_download",
  "github_release_view",
  "github_run_failed_logs",
  "github_run_list",
  "github_run_view",
  "github_run_wait",
  "github_workflow_dispatch",
  "gpu_info",
  "http_download",
  "http_headers",
  "http_probe",
  "http_request",
  "install_dependencies",
  "key_combo",
  "key_press",
  "kill_process",
  "latency_budget_status",
  "latency_round_start",
  "list_allowed_directories",
  "list_directory",
  "list_directory_with_sizes",
  "list_listening_ports",
  "list_processes",
  "list_scheduled_tasks",
  "list_services",
  "list_sessions",
  "list_windows",
  "maximize_window",
  "memory_info",
  "minimize_window",
  "mouse_click",
  "mouse_move",
  "mouse_scroll",
  "move_file",
  "move_window",
  "network_interfaces",
  "path_list",
  "ping_host",
  "port_owner",
  "port_test",
  "powershell_run",
  "process_details",
  "process_tree",
  "project_info",
  "prune_sessions",
  "read_file",
  "read_log_events",
  "read_media_file",
  "read_multiple_files",
  "read_process_events",
  "read_process_output",
  "read_text_file",
  "refresh_state",
  "release_session",
  "resize_window",
  "restart_process",
  "restart_service",
  "run_build",
  "run_lint",
  "run_scheduled_task",
  "run_tests",
  "runtime_catalog",
  "search_files",
  "search_log",
  "search_text",
  "session_status",
  "set_service_startup",
  "start_process",
  "start_service",
  "stop_log_follow",
  "stop_scheduled_task",
  "stop_service",
  "stop_watch",
  "storage_health",
  "structured_data_inspect",
  "system_info",
  "tail_file",
  "tcp_connections",
  "terminate_process",
  "tool_telemetry",
  "type_text",
  "udp_endpoints",
  "wait_process",
  "wait_session",
  "watch_events",
  "watch_path",
  "watch_status",
  "which",
  "write_file",
  "write_process_input",
]);

const STATUS_OVERRIDES = Object.freeze({
  read_file: { status: "deprecated", replacement: "read_text_file" },
  read_process_output: { status: "compatibility", replacement: "read_process_events" },
});

const FAMILY_RULES = [
  ["browser_live_", "browser-live"],
  ["browser_", "browser-managed"],
  ["github_", "github"],
  ["git_", "git"],
  ["clipboard_", "clipboard"],
  ["mouse_", "desktop-input"],
  ["key_", "desktop-input"],
  ["window", "window"],
];

const FAMILY_SETS = new Map([
  [["list_allowed_directories","read_text_file","read_file","read_multiple_files","read_media_file","write_file","edit_file","create_directory","list_directory","list_directory_with_sizes","directory_tree","move_file","search_files","get_file_info"], "filesystem"],
  [["powershell_run","command_run"], "shell"],
  [["start_process","session_status","read_process_output","read_process_events","wait_session","release_session","prune_sessions","write_process_input","terminate_process","list_sessions"], "process"],
  [["process_details","process_tree","find_process","wait_process","restart_process"], "process-advanced"],
  [["system_info","list_processes","kill_process","list_listening_ports"], "system"],
  [["list_services","get_service","start_service","stop_service","restart_service","set_service_startup"], "services"],
  [["tcp_connections","udp_endpoints","port_owner","port_test","dns_lookup","network_interfaces","ping_host"], "network"],
  [["cpu_info","memory_info","disk_info","gpu_info","storage_health","battery_info"], "hardware"],
  [["detect_project","detect_build_system","project_info","install_dependencies","run_build","run_tests","run_lint"], "development"],
  [["http_request","http_probe","http_headers","http_download"], "http"],
  [["tail_file","follow_log","read_log_events","search_log","stop_log_follow"], "log-tail"],
  [["watch_path","watch_events","watch_status","stop_watch"], "file-watcher"],
  [["list_scheduled_tasks","get_scheduled_task","create_scheduled_task","run_scheduled_task","stop_scheduled_task","enable_scheduled_task","disable_scheduled_task","delete_scheduled_task"], "scheduled-tasks"],
  [["refresh_state"], "transient-state"],
  [["env_get","env_list","env_set","path_list","which"], "environment"],
  [["search_text"], "structured-search"],
  [["file_hash","compare_files"], "file-integrity"],
  [["directory_manifest","compare_directories"], "directory-integrity"],
  [["structured_data_inspect"], "structured-data"],
  [["deployment_verification_snapshot"], "deployment"],
  [["batch_inspect"], "batch"],
  [["tool_telemetry","delivery_snapshot","latency_round_start","latency_budget_status","runtime_catalog"], "runtime-observation"],
]);

const READ_ONLY = new Set([
  "list_allowed_directories","read_text_file","read_file","read_multiple_files","read_media_file","list_directory","list_directory_with_sizes","directory_tree","search_files","get_file_info",
  "session_status","read_process_output","read_process_events","wait_session","list_sessions","process_details","process_tree","find_process","wait_process",
  "system_info","list_processes","list_listening_ports","list_services","get_service","tcp_connections","udp_endpoints","port_owner","port_test","dns_lookup","network_interfaces","ping_host",
  "cpu_info","memory_info","disk_info","gpu_info","storage_health","battery_info",
  "git_status","git_sync_status","git_diff","git_log","git_remote_ref","git_is_ancestor",
  "detect_project","detect_build_system","project_info","http_probe","http_headers",
  "tail_file","read_log_events","search_log","watch_events","watch_status","list_scheduled_tasks","get_scheduled_task",
  "env_get","env_list","path_list","which","clipboard_get","list_windows","get_window","browser_tabs","browser_snapshot","browser_screenshot",
  "browser_live_tabs","browser_live_snapshot","search_text","file_hash","compare_files","github_run_list","github_commit_run_status","github_run_view","github_run_wait","github_run_failed_logs","github_release_view",
  "delivery_snapshot","structured_data_inspect","directory_manifest","compare_directories","deployment_verification_snapshot","batch_inspect","latency_budget_status","runtime_catalog"
]);

const PROCESS_CONTROL = new Set(["start_process","release_session","prune_sessions","write_process_input","terminate_process","kill_process","restart_process","refresh_state"]);
const SERVICE_CONTROL = new Set(["start_service","stop_service","restart_service","set_service_startup"]);
const SCHEDULED_MUTATION = new Set(["create_scheduled_task","run_scheduled_task","stop_scheduled_task","enable_scheduled_task","disable_scheduled_task","delete_scheduled_task"]);
const GIT_MUTATION = new Set(["git_branch","git_commit","git_fetch","git_pull","git_push","git_push_ref","git_worktree"]);
const REMOTE_ACTION = new Set(["github_workflow_dispatch","github_release_download","http_request","http_download"]);
const DESKTOP_INPUT = new Set(["focus_window","move_window","resize_window","minimize_window","maximize_window","close_window","key_press","key_combo","type_text","mouse_move","mouse_click","mouse_scroll","clipboard_set","clipboard_clear"]);
const BROWSER_MANAGED_MUTATION = new Set(["browser_start","browser_attach","browser_stop","browser_navigate","browser_click","browser_type"]);
const LIVE_UI_MUTATION = new Set(["browser_live_attach","browser_live_click","browser_live_type","browser_live_stop"]);
const LOCAL_MUTATION = new Set(["write_file","edit_file","create_directory","move_file","env_set","follow_log","stop_log_follow","watch_path","stop_watch","install_dependencies","run_build","run_tests","run_lint","tool_telemetry","latency_round_start"]);
const LONG_RUNNING = new Set(["start_process","install_dependencies","run_build","run_tests","run_lint","follow_log","watch_path","browser_start"]);

function familyFor(name) {
  for (const [members, family] of FAMILY_SETS) {
    if (members.includes(name)) return family;
  }
  if (name.startsWith("browser_live_")) return "browser-live";
  if (name.startsWith("browser_")) return "browser-managed";
  if (name.startsWith("github_")) return "github";
  if (name.startsWith("git_")) return "git";
  if (name.startsWith("clipboard_")) return "clipboard";
  if (["list_windows","get_window","focus_window","move_window","resize_window","minimize_window","maximize_window","close_window"].includes(name)) return "window";
  if (["key_press","key_combo","type_text","mouse_move","mouse_click","mouse_scroll"].includes(name)) return "desktop-input";
  return "other";
}

function safetyFor(name) {
  if (READ_ONLY.has(name)) return "read-only";
  if (PROCESS_CONTROL.has(name)) return "process-control";
  if (SERVICE_CONTROL.has(name)) return "service-control";
  if (SCHEDULED_MUTATION.has(name)) return "scheduled-task-mutation";
  if (GIT_MUTATION.has(name)) return "git-mutation";
  if (REMOTE_ACTION.has(name)) return "remote-action";
  if (DESKTOP_INPUT.has(name)) return "desktop-input";
  if (BROWSER_MANAGED_MUTATION.has(name)) return "browser-managed-mutation";
  if (LIVE_UI_MUTATION.has(name)) return "live-ui-mutation";
  if (LOCAL_MUTATION.has(name)) return "local-mutation";
  return "local-mutation";
}

function moduleFor(name, family) {
  const special = {
    runtime_catalog: "modules/runtime-catalog.mjs",
    tool_telemetry: "modules/telemetry.mjs",
    delivery_snapshot: "modules/delivery-snapshot.mjs",
    latency_round_start: "modules/latency-budget.mjs",
    latency_budget_status: "modules/latency-budget.mjs",
    batch_inspect: "modules/batch-inspect.mjs",
    deployment_verification_snapshot: "modules/deployment-verification.mjs",
    structured_data_inspect: "modules/structured-data-inspection.mjs",
    search_text: "modules/structured-text-search.mjs",
    file_hash: "modules/file-integrity.mjs",
    compare_files: "modules/file-integrity.mjs",
    directory_manifest: "modules/directory-integrity.mjs",
    compare_directories: "modules/directory-integrity.mjs",
    refresh_state: "modules/transient-state.mjs",
  };
  if (special[name]) return special[name];
  const familyModule = {
    filesystem: "modules/filesystem.mjs",
    shell: "modules/shell.mjs",
    process: "modules/process.mjs",
    "process-advanced": "modules/process-advanced.mjs",
    system: "modules/system.mjs",
    services: "modules/services.mjs",
    network: "modules/network.mjs",
    hardware: "modules/hardware.mjs",
    git: "modules/git.mjs",
    github: "modules/github.mjs",
    development: "modules/development.mjs",
    http: "modules/http.mjs",
    "log-tail": "modules/log-tail.mjs",
    "file-watcher": "modules/file-watcher.mjs",
    "scheduled-tasks": "modules/scheduled-tasks.mjs",
    environment: "modules/environment.mjs",
    clipboard: "modules/clipboard.mjs",
    window: "modules/window-control.mjs",
    "desktop-input": "modules/input-control.mjs",
    "browser-managed": "modules/browser-common.mjs",
    "browser-live": "modules/browser-live.mjs",
  };
  return familyModule[family] || "lconnect-mcp.mjs";
}

function platformFor(family) {
  return new Set(["services","scheduled-tasks","window","desktop-input","clipboard","browser-live"]).has(family)
    ? "windows"
    : "cross-platform-or-runtime-dependent";
}

export function toolMetadata(name) {
  if (!PUBLIC_TOOL_NAMES.includes(name)) return null;
  const override = STATUS_OVERRIDES[name] || {};
  const family = familyFor(name);
  return {
    name,
    module: moduleFor(name, family),
    family,
    status: override.status || "canonical",
    replacement: override.replacement || null,
    safety: safetyFor(name),
    long_running: LONG_RUNNING.has(name),
    platform: platformFor(family),
  };
}

export function buildToolMetadataCatalog(names = PUBLIC_TOOL_NAMES) {
  return names.map((name) => toolMetadata(name));
}

export function validateToolMetadataCatalog(names = PUBLIC_TOOL_NAMES) {
  const seen = new Set();
  const duplicates = [];
  const missing = [];
  const invalidReplacement = [];
  for (const name of names) {
    if (seen.has(name)) duplicates.push(name);
    seen.add(name);
    const meta = toolMetadata(name);
    if (!meta) {
      missing.push(name);
      continue;
    }
    if (["compatibility","deprecated"].includes(meta.status) && !meta.replacement) {
      invalidReplacement.push(name);
    }
    if (meta.replacement && !PUBLIC_TOOL_NAMES.includes(meta.replacement)) {
      invalidReplacement.push(name);
    }
  }
  return {
    ok: duplicates.length === 0 && missing.length === 0 && invalidReplacement.length === 0,
    tool_count: names.length,
    duplicates,
    missing,
    invalid_replacement: [...new Set(invalidReplacement)],
  };
}
