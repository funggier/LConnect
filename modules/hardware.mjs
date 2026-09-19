import os from "node:os";
import { z } from "zod";
import { runPowerShell } from "./runtime.mjs";

function textResult(value, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

async function runPowerShellJson(script, config, timeoutSeconds = 30) {
  const result = await runPowerShell(script, {
    timeoutSeconds,
    maxOutputChars: config.shell.maxOutputChars,
  });

  if (result.error) throw new Error(`Failed to launch PowerShell: ${result.error}`);
  if (result.timedOut) throw new Error("Hardware inspection timed out.");
  if (result.code) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`Hardware inspection failed (exit ${result.code})${detail ? `: ${detail}` : ""}`);
  }

  const raw = (result.stdout || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse hardware inspection output as JSON: ${error.message}`);
  }
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function bytes(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function cpuFallback() {
  const cpus = os.cpus();
  return {
    available: cpus.length > 0,
    source: "node:os",
    logical_processor_count: cpus.length,
    model: cpus[0]?.model ?? null,
    speed_mhz: cpus[0]?.speed ?? null,
    architecture: os.arch(),
  };
}

async function cpuWindows(config) {
  const script = [
    "$items = @(Get-CimInstance Win32_Processor | ForEach-Object {",
    "  [pscustomobject]@{",
    "    device_id = [string]$_.DeviceID",
    "    name = [string]$_.Name",
    "    manufacturer = [string]$_.Manufacturer",
    "    description = [string]$_.Description",
    "    architecture_code = [uint16]$_.Architecture",
    "    address_width = [uint16]$_.AddressWidth",
    "    data_width = [uint16]$_.DataWidth",
    "    cores = [uint32]$_.NumberOfCores",
    "    enabled_cores = [uint32]$_.NumberOfEnabledCore",
    "    logical_processors = [uint32]$_.NumberOfLogicalProcessors",
    "    max_clock_mhz = [uint32]$_.MaxClockSpeed",
    "    current_clock_mhz = [uint32]$_.CurrentClockSpeed",
    "    load_percent = if ($null -eq $_.LoadPercentage) { $null } else { [uint16]$_.LoadPercentage }",
    "    socket = if ($null -eq $_.SocketDesignation) { $null } else { [string]$_.SocketDesignation }",
    "    processor_id = if ($null -eq $_.ProcessorId) { $null } else { [string]$_.ProcessorId }",
    "  }",
    "})",
    "[pscustomobject]@{ source = 'Win32_Processor'; processors = $items } | ConvertTo-Json -Compress -Depth 5",
  ].join("\n");
  return runPowerShellJson(script, config, 25);
}

async function memoryWindows(config) {
  const script = [
    "$os = Get-CimInstance Win32_OperatingSystem | Select-Object -First 1",
    "$modules = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object {",
    "  [pscustomobject]@{",
    "    bank_label = if ($null -eq $_.BankLabel) { $null } else { [string]$_.BankLabel }",
    "    device_locator = if ($null -eq $_.DeviceLocator) { $null } else { [string]$_.DeviceLocator }",
    "    capacity_bytes = [uint64]$_.Capacity",
    "    speed_mhz = if ($null -eq $_.Speed) { $null } else { [uint32]$_.Speed }",
    "    configured_clock_mhz = if ($null -eq $_.ConfiguredClockSpeed) { $null } else { [uint32]$_.ConfiguredClockSpeed }",
    "    manufacturer = if ($null -eq $_.Manufacturer) { $null } else { [string]$_.Manufacturer }",
    "    part_number = if ($null -eq $_.PartNumber) { $null } else { ([string]$_.PartNumber).Trim() }",
    "    serial_number = if ($null -eq $_.SerialNumber) { $null } else { ([string]$_.SerialNumber).Trim() }",
    "    form_factor_code = if ($null -eq $_.FormFactor) { $null } else { [uint16]$_.FormFactor }",
    "    memory_type_code = if ($null -eq $_.SMBIOSMemoryType) { $null } else { [uint16]$_.SMBIOSMemoryType }",
    "  }",
    "})",
    "[pscustomobject]@{",
    "  source = 'Win32_OperatingSystem + Win32_PhysicalMemory'",
    "  total_visible_memory_bytes = if ($null -eq $os.TotalVisibleMemorySize) { $null } else { [uint64]$os.TotalVisibleMemorySize * 1024 }",
    "  free_physical_memory_bytes = if ($null -eq $os.FreePhysicalMemory) { $null } else { [uint64]$os.FreePhysicalMemory * 1024 }",
    "  total_virtual_memory_bytes = if ($null -eq $os.TotalVirtualMemorySize) { $null } else { [uint64]$os.TotalVirtualMemorySize * 1024 }",
    "  free_virtual_memory_bytes = if ($null -eq $os.FreeVirtualMemory) { $null } else { [uint64]$os.FreeVirtualMemory * 1024 }",
    "  modules = $modules",
    "} | ConvertTo-Json -Compress -Depth 5",
  ].join("\n");
  return runPowerShellJson(script, config, 30);
}

async function disksWindows(config) {
  const script = [
    "$logical = @(Get-CimInstance Win32_LogicalDisk | ForEach-Object {",
    "  [pscustomobject]@{",
    "    device_id = [string]$_.DeviceID",
    "    drive_type = [uint32]$_.DriveType",
    "    volume_name = if ($null -eq $_.VolumeName) { $null } else { [string]$_.VolumeName }",
    "    file_system = if ($null -eq $_.FileSystem) { $null } else { [string]$_.FileSystem }",
    "    size_bytes = if ($null -eq $_.Size) { $null } else { [uint64]$_.Size }",
    "    free_bytes = if ($null -eq $_.FreeSpace) { $null } else { [uint64]$_.FreeSpace }",
    "    provider_name = if ($null -eq $_.ProviderName) { $null } else { [string]$_.ProviderName }",
    "  }",
    "})",
    "$physical = @(Get-CimInstance Win32_DiskDrive | ForEach-Object {",
    "  [pscustomobject]@{",
    "    index = [uint32]$_.Index",
    "    device_id = [string]$_.DeviceID",
    "    model = if ($null -eq $_.Model) { $null } else { [string]$_.Model }",
    "    manufacturer = if ($null -eq $_.Manufacturer) { $null } else { [string]$_.Manufacturer }",
    "    interface_type = if ($null -eq $_.InterfaceType) { $null } else { [string]$_.InterfaceType }",
    "    media_type = if ($null -eq $_.MediaType) { $null } else { [string]$_.MediaType }",
    "    serial_number = if ($null -eq $_.SerialNumber) { $null } else { ([string]$_.SerialNumber).Trim() }",
    "    size_bytes = if ($null -eq $_.Size) { $null } else { [uint64]$_.Size }",
    "    status = if ($null -eq $_.Status) { $null } else { [string]$_.Status }",
    "    partitions = [uint32]$_.Partitions",
    "  }",
    "})",
    "[pscustomobject]@{ source = 'Win32_LogicalDisk + Win32_DiskDrive'; logical_disks = $logical; physical_disks = $physical } | ConvertTo-Json -Compress -Depth 5",
  ].join("\n");
  return runPowerShellJson(script, config, 30);
}

async function gpuWindows(config) {
  const script = [
    "$items = @(Get-CimInstance Win32_VideoController | ForEach-Object {",
    "  [pscustomobject]@{",
    "    name = [string]$_.Name",
    "    description = if ($null -eq $_.Description) { $null } else { [string]$_.Description }",
    "    adapter_compatibility = if ($null -eq $_.AdapterCompatibility) { $null } else { [string]$_.AdapterCompatibility }",
    "    adapter_ram_bytes = if ($null -eq $_.AdapterRAM) { $null } else { [uint64]$_.AdapterRAM }",
    "    driver_version = if ($null -eq $_.DriverVersion) { $null } else { [string]$_.DriverVersion }",
    "    driver_date = if ($null -eq $_.DriverDate) { $null } else { $_.DriverDate.ToUniversalTime().ToString('o') }",
    "    pnp_device_id = if ($null -eq $_.PNPDeviceID) { $null } else { [string]$_.PNPDeviceID }",
    "    video_processor = if ($null -eq $_.VideoProcessor) { $null } else { [string]$_.VideoProcessor }",
    "    current_horizontal_resolution = if ($null -eq $_.CurrentHorizontalResolution) { $null } else { [uint32]$_.CurrentHorizontalResolution }",
    "    current_vertical_resolution = if ($null -eq $_.CurrentVerticalResolution) { $null } else { [uint32]$_.CurrentVerticalResolution }",
    "    current_refresh_rate_hz = if ($null -eq $_.CurrentRefreshRate) { $null } else { [uint32]$_.CurrentRefreshRate }",
    "    status = if ($null -eq $_.Status) { $null } else { [string]$_.Status }",
    "  }",
    "})",
    "[pscustomobject]@{ source = 'Win32_VideoController'; adapters = $items } | ConvertTo-Json -Compress -Depth 5",
  ].join("\n");
  return runPowerShellJson(script, config, 30);
}

async function storageHealthWindows(config) {
  const script = [
    "$result = [ordered]@{ available = $false; source = $null; disks = @(); note = $null }",
    "$cmd = Get-Command Get-PhysicalDisk -ErrorAction SilentlyContinue",
    "if ($null -ne $cmd) {",
    "  try {",
    "    $items = @(Get-PhysicalDisk -ErrorAction Stop | ForEach-Object {",
    "      [pscustomobject]@{",
    "        friendly_name = [string]$_.FriendlyName",
    "        serial_number = if ($null -eq $_.SerialNumber) { $null } else { ([string]$_.SerialNumber).Trim() }",
    "        media_type = [string]$_.MediaType",
    "        bus_type = [string]$_.BusType",
    "        health_status = [string]$_.HealthStatus",
    "        operational_status = @($_.OperationalStatus | ForEach-Object { [string]$_ })",
    "        size_bytes = [uint64]$_.Size",
    "        can_pool = [bool]$_.CanPool",
    "      }",
    "    })",
    "    $result.available = ($items.Count -gt 0)",
    "    $result.source = 'Get-PhysicalDisk'",
    "    $result.disks = $items",
    "    if ($items.Count -eq 0) { $result.note = 'No physical disk health objects were returned.' }",
    "  } catch {",
    "    $result.note = $_.Exception.Message",
    "  }",
    "}",
    "if (-not $result.available) {",
    "  try {",
    "    $fallback = @(Get-CimInstance Win32_DiskDrive -ErrorAction Stop | ForEach-Object {",
    "      [pscustomobject]@{",
    "        friendly_name = if ($null -eq $_.Model) { $null } else { [string]$_.Model }",
    "        serial_number = if ($null -eq $_.SerialNumber) { $null } else { ([string]$_.SerialNumber).Trim() }",
    "        media_type = if ($null -eq $_.MediaType) { $null } else { [string]$_.MediaType }",
    "        bus_type = if ($null -eq $_.InterfaceType) { $null } else { [string]$_.InterfaceType }",
    "        health_status = if ($null -eq $_.Status) { 'Unknown' } else { [string]$_.Status }",
    "        operational_status = @()",
    "        size_bytes = if ($null -eq $_.Size) { $null } else { [uint64]$_.Size }",
    "        can_pool = $null",
    "      }",
    "    })",
    "    if ($fallback.Count -gt 0) {",
    "      $result.available = $true",
    "      $result.source = 'Win32_DiskDrive status fallback'",
    "      $result.disks = $fallback",
    "      $result.note = 'Detailed SMART/Storage Spaces health was unavailable; reporting Win32_DiskDrive Status instead.'",
    "    }",
    "  } catch {",
    "    if ($null -eq $result.note) { $result.note = $_.Exception.Message }",
    "  }",
    "}",
    "[pscustomobject]$result | ConvertTo-Json -Compress -Depth 6",
  ].join("\n");
  return runPowerShellJson(script, config, 30);
}

async function batteryWindows(config) {
  const script = [
    "$items = @(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | ForEach-Object {",
    "  [pscustomobject]@{",
    "    name = if ($null -eq $_.Name) { $null } else { [string]$_.Name }",
    "    device_id = if ($null -eq $_.DeviceID) { $null } else { [string]$_.DeviceID }",
    "    status = if ($null -eq $_.Status) { $null } else { [string]$_.Status }",
    "    estimated_charge_remaining_percent = if ($null -eq $_.EstimatedChargeRemaining) { $null } else { [uint16]$_.EstimatedChargeRemaining }",
    "    estimated_run_time_minutes = if ($null -eq $_.EstimatedRunTime) { $null } else { [uint32]$_.EstimatedRunTime }",
    "    battery_status_code = if ($null -eq $_.BatteryStatus) { $null } else { [uint16]$_.BatteryStatus }",
    "    chemistry_code = if ($null -eq $_.Chemistry) { $null } else { [uint16]$_.Chemistry }",
    "    design_capacity_mwh = if ($null -eq $_.DesignCapacity) { $null } else { [uint32]$_.DesignCapacity }",
    "    full_charge_capacity_mwh = if ($null -eq $_.FullChargeCapacity) { $null } else { [uint32]$_.FullChargeCapacity }",
    "    voltage_mv = if ($null -eq $_.DesignVoltage) { $null } else { [uint64]$_.DesignVoltage }",
    "  }",
    "})",
    "[pscustomobject]@{ available = ($items.Count -gt 0); source = 'Win32_Battery'; count = $items.Count; batteries = $items; note = if ($items.Count -eq 0) { 'No Win32_Battery device is present or exposed on this system.' } else { $null } } | ConvertTo-Json -Compress -Depth 5",
  ].join("\n");
  return runPowerShellJson(script, config, 20);
}

export function registerHardwareTools(server, config) {
  const executionEnabled = config.shell.enabled && process.env.MCP_ENABLE_POWERSHELL !== "false";

  server.tool("cpu_info", "Return structured CPU topology and clock information.", {}, async () => {
    try {
      if (process.platform === "win32" && executionEnabled) {
        const result = await cpuWindows(config);
        const processors = asArray(result?.processors);
        return textResult({
          available: processors.length > 0,
          source: result?.source ?? "Win32_Processor",
          architecture: os.arch(),
          logical_processor_count_node: os.cpus().length,
          processors,
        });
      }
      return textResult(cpuFallback());
    } catch (error) {
      return textResult({ ...cpuFallback(), warning: error.message });
    }
  });

  server.tool("memory_info", "Return structured physical/virtual memory and RAM-module information.", {}, async () => {
    try {
      if (process.platform === "win32" && executionEnabled) {
        const result = await memoryWindows(config);
        return textResult({
          available: true,
          source: result?.source ?? "Windows CIM",
          total_memory_bytes_node: os.totalmem(),
          free_memory_bytes_node: os.freemem(),
          total_visible_memory_bytes: bytes(result?.total_visible_memory_bytes),
          free_physical_memory_bytes: bytes(result?.free_physical_memory_bytes),
          total_virtual_memory_bytes: bytes(result?.total_virtual_memory_bytes),
          free_virtual_memory_bytes: bytes(result?.free_virtual_memory_bytes),
          modules: asArray(result?.modules),
        });
      }
      return textResult({
        available: true,
        source: "node:os",
        total_memory_bytes: os.totalmem(),
        free_memory_bytes: os.freemem(),
        modules_available: false,
        modules: [],
      });
    } catch (error) {
      return textResult({
        available: true,
        source: "node:os",
        total_memory_bytes: os.totalmem(),
        free_memory_bytes: os.freemem(),
        modules_available: false,
        modules: [],
        warning: error.message,
      });
    }
  });

  server.tool("disk_info", "Return logical volume and physical disk inventory.", {}, async () => {
    try {
      if (process.platform !== "win32" || !executionEnabled) {
        return textResult({
          available: false,
          source: null,
          logical_disks: [],
          physical_disks: [],
          note: "Detailed disk inventory currently requires Windows shell/CIM access.",
        });
      }
      const result = await disksWindows(config);
      return textResult({
        available: true,
        source: result?.source ?? "Windows CIM",
        logical_disks: asArray(result?.logical_disks),
        physical_disks: asArray(result?.physical_disks),
      });
    } catch (error) {
      return textResult({
        available: false,
        source: null,
        logical_disks: [],
        physical_disks: [],
        note: error.message,
      });
    }
  });

  server.tool("gpu_info", "Return graphics adapter/driver inventory exposed by Windows.", {}, async () => {
    try {
      if (process.platform !== "win32" || !executionEnabled) {
        return textResult({
          available: false,
          source: null,
          adapters: [],
          note: "GPU inventory currently requires Windows CIM access.",
        });
      }
      const result = await gpuWindows(config);
      const adapters = asArray(result?.adapters);
      return textResult({
        available: adapters.length > 0,
        source: result?.source ?? "Win32_VideoController",
        adapters,
        note: adapters.length ? null : "No Win32_VideoController adapters were returned.",
      });
    } catch (error) {
      return textResult({
        available: false,
        source: null,
        adapters: [],
        note: error.message,
      });
    }
  });

  server.tool("storage_health", "Return physical storage health when Windows exposes it; otherwise return an explicit fallback/unavailable result.", {}, async () => {
    try {
      if (process.platform !== "win32" || !executionEnabled) {
        return textResult({
          available: false,
          source: null,
          disks: [],
          note: "Storage health currently requires Windows storage/CIM access.",
        });
      }
      const result = await storageHealthWindows(config);
      return textResult({
        available: Boolean(result?.available),
        source: result?.source ?? null,
        disks: asArray(result?.disks),
        note: result?.note ?? null,
      });
    } catch (error) {
      return textResult({
        available: false,
        source: null,
        disks: [],
        note: error.message,
      });
    }
  });

  server.tool("battery_info", "Return battery inventory/status when a battery is exposed; desktops without batteries return available=false.", {}, async () => {
    try {
      if (process.platform !== "win32" || !executionEnabled) {
        return textResult({
          available: false,
          source: null,
          count: 0,
          batteries: [],
          note: "Battery inspection currently requires Windows CIM access.",
        });
      }
      const result = await batteryWindows(config);
      return textResult({
        available: Boolean(result?.available),
        source: result?.source ?? "Win32_Battery",
        count: Number(result?.count ?? 0),
        batteries: asArray(result?.batteries),
        note: result?.note ?? null,
      });
    } catch (error) {
      return textResult({
        available: false,
        source: null,
        count: 0,
        batteries: [],
        note: error.message,
      });
    }
  });
}
