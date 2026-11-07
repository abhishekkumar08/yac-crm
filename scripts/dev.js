import { spawn } from "node:child_process";

const run = (cmd, args) => spawn(cmd, args, { stdio: "inherit" });
const children = [
  run(process.execPath, ["--no-warnings=ExperimentalWarning", "--watch", "server/index.js"]),
  run("npx", ["vite", "--config", "web/vite.config.js", "--open"]),
];
const stop = () => {
  for (const c of children) if (c.pid && c.exitCode === null) process.kill(c.pid, "SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const c of children) c.on("exit", stop);
