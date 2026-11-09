// Usage: npm run hash-password
// Asks for the admin password (shown as *) and saves its hash as ADMIN_PASSWORD_HASH in .env.
// Only the hash is stored; the password itself is never written anywhere.
import { randomBytes, scrypt } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
let pipedLines = null;

function ask(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    let value = "";

    if (!stdin.isTTY) {
      // Piped input: read everything once, then hand out one line per question
      pipedLines ??= new Promise((r) => {
        let all = "";
        stdin.setEncoding("utf8");
        stdin.on("data", (d) => (all += d));
        stdin.on("end", () => r(all.split(/\r?\n/)));
      });
      pipedLines.then((lines) => {
        process.stdout.write("\n");
        resolve(lines.shift() ?? "");
      });
      return;
    }

    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          // Ctrl+C
          process.stdout.write("\nCancelled.\n");
          process.exit(130);
        }
        if (ch === "\u0008" || ch === "\u007f") {
          // Backspace
          if (value.length) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        value += ch;
        process.stdout.write("*");
      }
    };
    stdin.on("data", onData);
  });
}

const password = await ask("New admin password (at least 12 characters): ");
if (password.length < 12) {
  console.error("Too short: use at least 12 characters. Nothing was saved.");
  process.exit(1);
}
const again = await ask("Type it again to confirm: ");
if (again !== password) {
  console.error("The two passwords don't match. Nothing was saved.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = await scryptAsync(password, salt, 64);
const line = `ADMIN_PASSWORD_HASH=scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;

if (existsSync(".env")) {
  const env = readFileSync(".env", "utf8");
  const next = /^ADMIN_PASSWORD_HASH=.*$/m.test(env) ? env.replace(/^ADMIN_PASSWORD_HASH=.*$/m, line) : `${env.trimEnd()}\n${line}\n`;
  writeFileSync(".env", next);
  console.log("Saved the admin password hash to .env. Restart the backend if it is running.");
} else {
  console.log(`No .env file found here. Copy .env.example to .env and add this line:\n${line}`);
}
process.exit(0);
