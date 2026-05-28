// Originality gate: third-party URLs may appear ONLY under §8 Supplemental Learning Material.
import { readFileSync } from "node:fs";
import { listModules, lintOriginality, red, green } from "./lib.ts";

const mods = listModules();
let failed = 0;
for (const mod of mods) {
  const md = readFileSync(mod.moduleMd, "utf8");
  const problems = lintOriginality(md);
  if (problems.length) {
    failed++;
    console.log(red(`✗ ${mod.id} — third-party content outside §8`));
    for (const p of problems) console.log(`    - ${p}`);
  } else {
    console.log(green(`✓ ${mod.id}`));
  }
}
console.log(`\noriginality-lint: ${mods.length - failed}/${mods.length} modules pass`);
process.exit(failed ? 1 : 0);
