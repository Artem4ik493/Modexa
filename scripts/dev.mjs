import { spawn } from "node:child_process";
import { request } from "node:http";

const processes = [];

function start(name, command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
    shell: false
  });

  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.error(`\\n[${name}] exited (code=${code ?? "null"}, signal=${signal ?? "none"})`);
      void shutdown(code ?? 1);
    }
  });

  processes.push({ name, child });
}

let shuttingDown = false;

function stopRunnerThroughApi() {
  return new Promise((resolve) => {
    const req = request({
      host: "127.0.0.1",
      port: Number(process.env.PORT ?? 3000),
      path: "/api/runtime",
      method: "POST",
      timeout: 9000,
      headers: {
        "content-type": "application/json",
        ...(process.env.MODEXA_API_KEY
          ? { authorization: `Bearer ${process.env.MODEXA_API_KEY}` }
          : {})
      }
    }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode === 200));
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end(JSON.stringify({ action: "stop" }));
  });
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\\n[dev] stopping Modexa services...");

  // On Windows, child.kill() terminates the process immediately instead of
  // reliably delivering a catchable signal. Ask the API to stop the runner
  // first, so Telegram and Discord adapters can close their connections.
  if (processes.some(({ name }) => name === "api")) {
    const stopped = await stopRunnerThroughApi();
    if (!stopped) {
      console.warn("[dev] graceful runner stop was not confirmed; using process fallback");
    }
  }

  for (const { child } of processes) {
    if (child.exitCode === null && !child.killed) child.kill();
  }

  const deadline = setTimeout(() => process.exit(code), 1500);
  Promise.all(processes.map(({ child }) => new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", resolve);
  }))).then(() => {
    clearTimeout(deadline);
    process.exit(code);
  });
}

process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

console.log("");
console.log("================================");
console.log("        MODEXA DEV STACK");
console.log("================================");
console.log("API:       http://localhost:3000");
console.log("Dashboard: http://localhost:3000/");
console.log("Bots:      runner");
console.log("");

function isApiAlreadyRunning() {
  return new Promise((resolve) => {
    const req = request({
      host: "127.0.0.1",
      port: Number(process.env.PORT ?? 3000),
      path: "/health",
      method: "GET",
      timeout: 500
    }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

const apiAlreadyRunning = await isApiAlreadyRunning();

if (apiAlreadyRunning) {
  console.log("[api] already running on configured port; reusing it");
} else {
  start("api", "node", ["--env-file=.env", "--import=tsx", "apps/api/src/index.ts"]);
}

