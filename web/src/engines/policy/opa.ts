/**
 * OPA/Rego engine adapter — @open-policy-agent/opa-wasm over PRECOMPILED policies
 * (web ISA ISC-71; RedTeam finding 5).
 *
 * opa-wasm cannot compile learner Rego source in-browser, so this adapter evaluates only
 * policies precompiled in CI/dev via `opa build -t wasm` (dockerized; see
 * modules/09-policy-as-code/exercises/assets/policy.wasm.provenance.json). Module-09
 * exercises therefore mutate INPUT JSON against the fixed reference policy — labeled
 * honestly in the UI — while free-form Rego authoring routes to the real-machine lab path.
 *
 * Exit-code semantics mirror the lab's check.sh verdict function: deny set non-empty →
 * exit 1 (the CI gate's teeth); empty → exit 0.
 */
import { loadPolicy } from "@open-policy-agent/opa-wasm";
import { type EngineAdapter, type EngineRunResult, errorMessage } from "../adapters";

interface LoadedPolicy {
  entrypoints: Record<string, number>;
  evaluate(input: unknown, entrypoint?: string | number): Array<{ result: unknown }>;
}

export interface OpaAdapterOptions {
  /** The precompiled policy bundle's wasm bytes (provider injected: file in tests, fetch of a same-origin URL in the browser island). */
  wasmBytes: () => Promise<ArrayBuffer | Uint8Array>;
  /** Entrypoint to query (default: the module-09 reference policy's deny set). */
  entrypoint?: string;
}

export const OPA_POLICY_DEFAULT_URL = "/engines/opa/policy.wasm";
export const OPA_DEFAULT_ENTRYPOINT = "access/deny";

export class OpaEngineAdapter implements EngineAdapter {
  readonly id = "opa";
  private opts: OpaAdapterOptions;
  private policy: LoadedPolicy | null = null;

  constructor(opts: OpaAdapterOptions) {
    this.opts = opts;
  }

  async load(): Promise<void> {
    if (this.policy) return;
    const bytes = await this.opts.wasmBytes();
    this.policy = (await loadPolicy(bytes)) as unknown as LoadedPolicy;
  }

  /** Entrypoints the compiled bundle exposes (provenance surface for the UI). */
  async entrypoints(): Promise<string[]> {
    await this.load();
    return Object.keys(this.policy!.entrypoints);
  }

  /**
   * Evaluate the precompiled policy against learner-mutated input.
   * @param input the input document JSON (e.g. `{"action":"grantRole","resource":{"role":"legacy-admin"}}`)
   * @param files ignored (the policy is fixed by design — ISC-71)
   *
   * stdout: the deny set, one message per line, then a check.sh-shaped RESULT line.
   * exit: 1 iff the deny set is non-empty (check.sh semantics), 2 on bad input JSON.
   * artifacts.deny: the raw deny set from the real engine.
   */
  async run(input: string, _files?: Record<string, string>): Promise<EngineRunResult> {
    await this.load();
    let doc: unknown;
    try {
      doc = JSON.parse(input);
    } catch (e) {
      return { stdout: "", stderr: `invalid input JSON: ${errorMessage(e)}\n`, exit: 2 };
    }
    const entrypoint = this.opts.entrypoint ?? OPA_DEFAULT_ENTRYPOINT;
    let resultSet: Array<{ result: unknown }>;
    try {
      resultSet = this.policy!.evaluate(doc, entrypoint);
    } catch (e) {
      return { stdout: "", stderr: `opa evaluation failed: ${errorMessage(e)}\n`, exit: 2 };
    }
    const deny = (resultSet[0]?.result ?? []) as string[];
    const lines = deny.map((m) => `DENY  ${m}`);
    const decision = deny.length > 0 ? "deny" : "allow";
    lines.push(`RESULT  entrypoint=${entrypoint}  decision=${decision}  violations=${deny.length}`);
    return {
      stdout: lines.join("\n") + "\n",
      stderr: "",
      exit: deny.length > 0 ? 1 : 0,
      artifacts: { deny },
    };
  }
}
