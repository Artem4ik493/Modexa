import { spawn } from "node:child_process";

const processes = [];

function start(name, command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32"
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

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const { child } of processes) {
    if (!child.killed) child.kill();
  }

  setTimeout(() => process.exit(code), 500);
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

start("api", "node", ["--env-file=.env", "--import=tsx", "apps/api/src/index.ts"]);
start("runner", "node", ["--env-file=.env", "--import=tsx", "apps/runner/src/index.ts"]);
