// Anatomy gate: every module has the fixed 9-section anatomy (§1–8 + meta.yaml) + labs/ + assessment/.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listModules, parseMetaYaml, lintAnatomy, red, green } from "./lib.ts";

const mods = listModules();
if (mods.length === 0) {
  console.error(red("anatomy-lint: no modules found"));
  process.exit(1);
}

let failed = 0;
for (const mod of mods) {
  const md = readFileSync(mod.moduleMd, "utf8");
  const meta = existsSync(mod.metaYaml)
    ? parseMetaYaml(readFileSync(mod.metaYaml, "utf8"))
    : null;
  const problems = lintAnatomy({
    md,
    meta,
    hasLabs: existsSync(join(mod.dir, "labs")),
    hasAssessment: existsSync(join(mod.dir, "assessment")),
  });
  if (problems.length) {
    failed++;
    console.log(red(`✗ ${mod.id}`));
    for (const p of problems) console.log(`    - ${p}`);
  } else {
    console.log(green(`✓ ${mod.id}`));
  }
}
console.log(`\nanatomy-lint: ${mods.length - failed}/${mods.length} modules pass`);
process.exit(failed ? 1 : 0);
