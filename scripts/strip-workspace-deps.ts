/**
 * strip-workspace-deps.ts — Remove workspace:* dependencies from package.json.
 * Used on Vercel where the monorepo workspace packages are not available.
 * The create-shims.ts script runs after bun install to provide stub modules.
 */

import fs from "fs";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

const pkg: PackageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

for (const section of ["dependencies", "devDependencies"] as const) {
  if (!pkg[section]) continue;
  for (const [name, version] of Object.entries(pkg[section]!)) {
    if (String(version).startsWith("workspace:")) {
      delete pkg[section]![name];
      console.log(`Stripped ${name} (${version}) from ${section}`);
    }
  }
}

fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));
console.log("Workspace dependencies stripped.");
