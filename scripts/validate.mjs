import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const ignored = new Set([".git", "node_modules", ".temp"]);
const files = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name.endsWith(".js")) files.push(path);
  }
}

await walk(root);
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`JavaScript syntax failed: ${relative(root, file)}`);
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
}

const frontend = files.filter((file) => !file.includes(`${join("supabase", "functions")}`));
const secretPattern = /(?:service_role|SUPABASE_SERVICE_ROLE_KEY)\s*[:=]\s*["'][^"']{20,}["']/i;
for (const file of frontend) {
  const content = await readFile(file, "utf8");
  if (secretPattern.test(content)) {
    console.error(`Privileged secret found in frontend: ${relative(root, file)}`);
    process.exit(1);
  }
}

console.log(`Validated ${files.length} JavaScript files; no privileged frontend secret found.`);
