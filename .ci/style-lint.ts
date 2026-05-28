// Style gate (zero-dependency): §1 objectives must use measurable (Bloom) verbs.
// Optional Vale prose linting can be added via style/.vale.ini once Vale is installed.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listModules, lintStyle, readBannedVerbs, countObjectives, red, green } from "./lib.ts";

const banned = readBannedVerbs(join(import.meta.dir, "..", "style", "banned-verbs.txt"));
const mods = listModules();
let failed = 0;
for (const mod of mods) {
  const md = readFileSync(mod.moduleMd, "utf8");
  const problems = lintStyle(md, banned);
  if (problems.length) {
    failed++;
    console.log(red(`✗ ${mod.id}`));
    for (const p of problems) console.log(`    - ${p}`);
  } else {
    console.log(green(`✓ ${mod.id} (${countObjectives(md)} objectives)`));
  }
}
console.log(`\nstyle-lint: ${mods.length - failed}/${mods.length} modules pass`);
process.exit(failed ? 1 : 0);
