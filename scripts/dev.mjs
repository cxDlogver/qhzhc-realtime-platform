import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const execFileAsync = promisify(execFile);

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// package.json engines.node = ">=24"：node:sqlite 在 Node 22 需要 --experimental-sqlite
const REQUIRED_NODE_MAJOR = 24;

/**
 * 需在启动前检查并释放的目标端口：
 * - server：QHZHC_Server/src/server/config.ts —— process.env.PORT ?? 18080
 * - web：   QHZHC_Web/vue.config.js devServer.port = 9527
 */
const TARGET_PORTS = [
  { name: "server", port: positiveIntegerOrUndefined(process.env.PORT) ?? 18080 },
  { name: "web", port: 9527 },
];

/**
 * 命令行命中以下特征即视为“本项目已启动”的旧进程。
 * 端口探测只能发现已经监听的进程，编译中/刚崩溃的实例需要靠命令行识别。
 */
const PROJECT_PROCESS_PATTERNS = [
  /src[\\/]server[\\/]index\.ts/i,
  /vue-cli-service(\.js)?\s+serve/i,
];

/** 缺失时前后端子进程都会直接 code=1 退出 */
const REQUIRED_DEPENDENCIES = ["tsx", "@vue/cli-service"];

function positiveIntegerOrUndefined(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** 依赖是否已安装（支持 workspaces 提升安装到根目录的情况） */
function resolveModuleDir(name) {
  const candidates = [
    path.join(ROOT, "node_modules", name),
    path.join(ROOT, "QHZHC_Server", "node_modules", name),
    path.join(ROOT, "QHZHC_Web", "node_modules", name),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

/**
 * Node 22 及以下：node:sqlite 需要 --experimental-sqlite，
 * 通过 NODE_OPTIONS 注入，子进程（npm → node）会自动继承。
 */
function resolveNodeOptions() {
  const major = Number(process.versions.node.split(".")[0]);
  if (Number.isInteger(major) && major >= REQUIRED_NODE_MAJOR) return process.env.NODE_OPTIONS;
  console.warn(
    `[dev] 当前 Node ${process.versions.node}，项目要求 >=${REQUIRED_NODE_MAJOR}；` +
      "已自动为子进程追加 --experimental-sqlite 以启用 node:sqlite。",
  );
  return [process.env.NODE_OPTIONS, "--experimental-sqlite"].filter(Boolean).join(" ");
}

/** 目标端口是否处于监听状态 */
function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(800);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

/** netstat 本机地址形如 127.0.0.1:18080 / 0.0.0.0:9527 / [::]:8080 */
function localAddressMatchesPort(local, port) {
  const ipv6Marker = local.lastIndexOf("]:");
  const hostPort =
    ipv6Marker !== -1 ? local.slice(ipv6Marker + 2) : local.slice(local.lastIndexOf(":") + 1);
  return hostPort === String(port);
}

/** 查找监听指定端口的进程 PID 列表 */
async function findListeningPids(port) {
  const pids = new Set();
  if (isWindows) {
    const { stdout } = await execFileAsync("netstat", ["-ano"], {
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });
    for (const line of stdout.split(/\r?\n/)) {
      const columns = line.trim().split(/\s+/);
      if (columns.length < 5) continue;
      const [protocol, local, , state, pid] = columns;
      if (
        protocol.toUpperCase().startsWith("TCP") &&
        state.toUpperCase() === "LISTENING" &&
        /^\d+$/.test(pid) &&
        localAddressMatchesPort(local, port)
      ) {
        pids.add(Number(pid));
      }
    }
    return [...pids];
  }

  // macOS / Linux：优先 lsof，失败回退 fuser
  try {
    const { stdout } = await execFileAsync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
    for (const line of stdout.split(/\r?\n/)) {
      const pid = Number(line.trim());
      if (Number.isInteger(pid) && pid > 0) pids.add(pid);
    }
    return [...pids];
  } catch {
    try {
      const { stderr } = await execFileAsync("fuser", [`${port}/tcp`]);
      for (const token of stderr.trim().split(/\s+/)) {
        const pid = Number(token);
        if (Number.isInteger(pid) && pid > 0) pids.add(pid);
      }
    } catch {
      // fuser 在没有任何进程占用时返回非 0，忽略即可
    }
    return [...pids];
  }
}

/** 结束进程（Windows 下连带子进程树一起结束） */
async function killProcessTree(pid) {
  if (isWindows) {
    try {
      await execFileAsync("taskkill", ["/pid", String(pid), "/t", "/f"], {
        windowsHide: true,
      });
    } catch {
      // 进程可能已经退出
    }
    return;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // 进程可能已经退出或无权限
  }
}

/** 列出当前所有 node 进程的 PID 与命令行 */
async function listNodeProcesses() {
  if (isWindows) {
    const { stdout } = await execFileAsync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' } | " +
          "ForEach-Object { Write-Output ($_.ProcessId.ToString() + '|' + $_.CommandLine) }",
      ],
      { windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
    ).catch(() => ({ stdout: "" }));

    return stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("|");
        if (separator <= 0) return null;
        const pid = Number(line.slice(0, separator).trim());
        return Number.isInteger(pid) && pid > 0
          ? { pid, command: line.slice(separator + 1) }
          : null;
      })
      .filter(Boolean);
  }

  const { stdout } = await execFileAsync("ps", ["-eo", "pid=,args="], {
    maxBuffer: 32 * 1024 * 1024,
  }).catch(() => ({ stdout: "" }));

  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(.*)$/);
      return match ? { pid: Number(match[1]), command: match[2] } : null;
    })
    .filter(Boolean);
}

/** 中断本项目的旧进程（含尚未监听端口、正在编译的实例） */
async function cleanupProjectProcesses() {
  const processes = await listNodeProcesses();
  const targets = processes.filter(
    ({ pid, command }) =>
      pid !== process.pid && PROJECT_PROCESS_PATTERNS.some((pattern) => pattern.test(command)),
  );
  if (targets.length === 0) return 0;

  console.log(`[dev] 检测到本项目已在运行的旧进程（${targets.length} 个），正在中断以重新启动…`);
  for (const { pid } of targets) {
    console.log(`[dev] 终止旧进程 PID ${pid}…`);
    await killProcessTree(pid);
  }
  await sleep(500);
  return targets.length;
}

/** 若端口已被旧进程占用，则终止占用进程并等待端口释放 */
async function freePortIfOccupied(port, label) {
  if (!(await isPortListening(port))) return;

  console.log(`[dev] 检测到 ${label} 端口 ${port} 已被占用，尝试终止旧进程后重启。`);
  const pids = await findListeningPids(port);
  if (pids.length === 0) {
    console.warn(
      `[dev] 警告：${label} 端口 ${port} 被占用，但无法解析出占用进程 PID，` +
        "继续启动（若报 EADDRINUSE，请手动释放端口）。",
    );
    return;
  }

  for (const pid of pids) {
    console.log(`[dev] 终止占用 ${label} 端口 ${port} 的旧进程（PID ${pid}）…`);
    await killProcessTree(pid);
  }

  // 等待端口真正释放（最长约 8 秒）
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await sleep(500);
    if (!(await isPortListening(port))) {
      console.log(`[dev] ${label} 端口 ${port} 已释放。`);
      return;
    }
  }

  throw new Error(
    `[dev] ${label} 端口 ${port} 在终止进程后仍被占用，请手动检查：` +
      (isWindows ? `netstat -ano | findstr :${port}` : `lsof -iTCP:${port} -sTCP:LISTEN`),
  );
}

// ---------- 启动前预检 ----------
const missingDependencies = REQUIRED_DEPENDENCIES.filter((name) => !resolveModuleDir(name));
if (missingDependencies.length > 0) {
  console.error(
    `[dev] 依赖缺失：${missingDependencies.join("、")}。\n` +
      `[dev] 请先在 ${ROOT} 执行：npm install\n` +
      "[dev] 依赖安装完成后重新运行：npm run dev",
  );
  process.exit(1);
}

const nodeOptions = resolveNodeOptions();
const childEnv = nodeOptions ? { ...process.env, NODE_OPTIONS: nodeOptions } : process.env;

try {
  await cleanupProjectProcesses();
  for (const { name, port } of TARGET_PORTS) {
    await freePortIfOccupied(port, name);
  }
  console.log("[dev] 端口与进程检查完毕，正在启动前后端开发服务…");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const commands = [
  { name: "server", args: ["run", "dev:server"] },
  { name: "web", args: ["run", "dev:web"] },
];

const children = commands.map(({ name, args }) => {
  // Windows 下 .cmd 必须由 shell 启动，否则 spawn 直接抛 EINVAL
  const child = spawn(npmCommand, args, {
    cwd: ROOT,
    env: childEnv,
    stdio: "inherit",
    shell: isWindows,
  });
  child.on("error", (error) => {
    console.error(`[dev:${name}] 启动失败：`, error);
  });
  return { name, child };
});

let stopping = false;

async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const { child } of children) {
    if (!child.killed && child.pid !== undefined) {
      if (isWindows) {
        // shell 模式下 kill 只作用于 cmd.exe，需要连同子进程树一起结束
        spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
          stdio: "ignore",
        });
      } else {
        child.kill("SIGTERM");
      }
    }
  }
  // 兜底清理：避免异常退出后残留孤儿进程，导致下次启动又判定为“已启动”
  await cleanupProjectProcesses();
  setTimeout(() => process.exit(exitCode), 250).unref();
}

for (const { name, child } of children) {
  child.on("exit", (code, signal) => {
    if (stopping) return;
    if (code !== 0) {
      console.error(
        `[dev:${name}] 已异常退出（${signal ? `signal=${signal}` : `code=${code}`}），正在停止另一进程。`,
      );
    }
    stop(code ?? (signal ? 1 : 0));
  });
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
