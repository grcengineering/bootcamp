import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { ExerciseSpecSchema } from "../src/lib/exercise-spec";

const ROOT = join(import.meta.dir, "..", "..");
const MODULES = join(ROOT, "modules");

const dirs = readdirSync(MODULES).filter((d) =>
  existsSync(join(MODULES, d, "exercises/transcripts")),
).sort();

for (const dir of dirs) {
  const tDir = join(MODULES, dir, "exercises/transcripts");
  const antis = readdirSync(tDir).filter((f) => f.startsWith("anti-"));
  if (!antis.length) continue;
  let spec: any;
  try {
    spec = ExerciseSpecSchema.parse(parse(readFileSync(join(MODULES, dir, "exercises/exercise.yaml"), "utf8")));
  } catch (e) { console.log(`${dir}: SPEC PARSE FAIL ${e}`); continue; }
  console.log(`\n##### ${dir} (engine=${spec.engine})`);
  for (const anti of antis.sort()) {
    const lines = readFileSync(join(tDir, anti), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const header = lines[0]?.anti_for ? lines[0] : null;
    const tgt = header?.anti_for;
    const task = spec.tasks.find((t: any) => t.id === tgt);
    const hasFailsCheck = header?.fails_check !== undefined;
    console.log(`  ${anti}  anti_for=${tgt}  fails_check=${hasFailsCheck ? header.fails_check : "ABSENT"}`);
    if (task && task.type === "action") {
      (task.verify as any[]).forEach((v, i) => {
        console.log(`      verify[${i}] ${JSON.stringify(v).slice(0, 160)}`);
      });
    } else {
      console.log(`      !! target task ${tgt} is ${task ? task.type : "MISSING"}`);
    }
  }
}
