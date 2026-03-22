const { spawn } = require("child_process");
const net = require("net");
const https = require("https");
const localtunnel = require("localtunnel");

const cwd = __dirname;

function findAvailablePort(start = 4173) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => {
      resolve(findAvailablePort(start + 1));
    });
    server.once("listening", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.listen(start);
  });
}

function startServer(port) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (data) => {
    process.stdout.write(data);
  });

  child.stderr.on("data", (data) => {
    process.stderr.write(data);
  });

  return child;
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk.toString();
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          resolve(body.trim());
        });
      })
      .on("error", reject);
  });
}

async function getTunnelPassword() {
  try {
    const password = await fetchText("https://loca.lt/mytunnelpassword");
    if (password) {
      return password;
    }
  } catch {}

  try {
    const password = await fetchText("https://api.ipify.org");
    if (password) {
      return password;
    }
  } catch {}

  return null;
}

async function main() {
  const port = await findAvailablePort();
  const server = startServer(port);
  let tunnel;

  const shutdown = async () => {
    if (tunnel) {
      await tunnel.close();
    }
    if (!server.killed) {
      server.kill();
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise((resolve) => setTimeout(resolve, 1200));
  tunnel = await localtunnel({ port });
  const password = await getTunnelPassword();

  console.log("");
  console.log("Share URL:");
  console.log(tunnel.url);
  console.log("");
  console.log(`Local port: ${port}`);
  if (password) {
    console.log(`Tunnel Password: ${password}`);
    console.log("If visitors see a Tunnel Password page, send them this password.");
  } else {
    console.log("Could not fetch Tunnel Password automatically.");
    console.log("If visitors see a password page, open https://loca.lt/mytunnelpassword on this machine.");
  }
  console.log("Send the URL above to anyone you want to share with.");
  console.log("Keep this terminal open. Closing it will disable the temporary link.");

  tunnel.on("close", () => {
    if (!server.killed) {
      server.kill();
    }
  });

  server.on("exit", async () => {
    if (tunnel) {
      await tunnel.close();
    }
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Failed to create public link:", error.message);
  process.exit(1);
});
