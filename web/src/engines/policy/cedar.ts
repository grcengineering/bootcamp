/**
 * Cedar engine adapter — @cedar-policy/cedar-wasm (official AWS build) (web ISA ISC-72).
 *
 * Cedar is the LIVE policy-authoring flagship (ISC-71 decision): cedar-wasm ships the full
 * parser + authorizer, so the learner's own policy text is genuinely parsed and evaluated —
 * no precompilation step, no theater.
 *
 * Environment split (ISC-73): the adapter core is DOM-free and takes the cedar API as an
 * injected module. Bun tests inject `@cedar-policy/cedar-wasm/nodejs`; the browser island
 * injects the `/web` build initialized against the self-hosted
 * `/engines/cedar/cedar_wasm_bg.wasm` (see browser.ts loader glue).
 */
import { type EngineAdapter, type EngineRunResult, errorMessage } from "../adapters";

/** The slice of the cedar-wasm surface the adapter consumes (identical across builds). */
export interface CedarApi {
  isAuthorized(call: {
    principal: CedarEntityUid;
    action: CedarEntityUid;
    resource: CedarEntityUid;
    context: Record<string, unknown>;
    policies: { staticPolicies: string };
    entities: CedarEntity[];
  }):
    | { type: "success"; response: { decision: "allow" | "deny"; diagnostics: { reason: string[]; errors: unknown[] } } }
    | { type: "failure"; errors: Array<{ message: string }> };
}

export interface CedarEntityUid {
  type: string;
  id: string;
}

export interface CedarEntity {
  uid: CedarEntityUid;
  attrs: Record<string, unknown>;
  parents: CedarEntityUid[];
}

/** One authorization request of a decision-pair test artifact (domain-native verifier asset). */
export interface CedarRequest {
  principal: CedarEntityUid;
  action: CedarEntityUid;
  resource: CedarEntityUid;
  context?: Record<string, unknown>;
}

export interface CedarDecision {
  decision: "allow" | "deny";
  /** Policy ids that determined the decision (Cedar diagnostics.reason). */
  reason: string[];
}

export class CedarEngineAdapter implements EngineAdapter {
  readonly id = "cedar";
  private loader: () => Promise<CedarApi>;
  private api: CedarApi | null = null;

  constructor(loader: () => Promise<CedarApi>) {
    this.loader = loader;
  }

  async load(): Promise<void> {
    if (!this.api) this.api = await this.loader();
  }

  /**
   * Evaluate learner-authored Cedar policy text against requests + entities.
   * @param input the policy set source (what the learner wrote in the policy pane)
   * @param files `requests.json` — CedarRequest[]; `entities.json` — CedarEntity[]
   *
   * stdout: one `ALLOW`/`DENY` line per request (the lab's decision log).
   * exit: 0 when every request evaluated; 1 on parse/evaluation failure
   *       (failure text on stderr — Cedar's own diagnostics, verbatim).
   * artifacts.decisions: CedarDecision[] for the decision-pair verifier.
   */
  async run(input: string, files?: Record<string, string>): Promise<EngineRunResult> {
    await this.load();
    let requests: CedarRequest[];
    let entities: CedarEntity[];
    try {
      requests = JSON.parse(files?.["requests.json"] ?? "[]");
      entities = JSON.parse(files?.["entities.json"] ?? "[]");
    } catch (e) {
      return { stdout: "", stderr: `invalid exercise asset JSON: ${errorMessage(e)}\n`, exit: 2 };
    }

    const decisions: CedarDecision[] = [];
    const lines: string[] = [];
    for (const req of requests) {
      const answer = this.api!.isAuthorized({
        principal: req.principal,
        action: req.action,
        resource: req.resource,
        context: req.context ?? {},
        policies: { staticPolicies: input },
        entities,
      });
      if (answer.type === "failure") {
        const msgs = answer.errors.map((e) => e.message).join("\n");
        return { stdout: "", stderr: `${msgs}\n`, exit: 1 };
      }
      const { decision, diagnostics } = answer.response;
      decisions.push({ decision, reason: diagnostics.reason });
      lines.push(
        `${decision === "allow" ? "ALLOW" : "DENY "} ${req.action.type}::"${req.action.id}" ` +
          `on ${req.resource.type}::"${req.resource.id}" by ${req.principal.type}::"${req.principal.id}"`,
      );
    }
    return {
      stdout: lines.length ? lines.join("\n") + "\n" : "",
      stderr: "",
      exit: 0,
      artifacts: { decisions },
    };
  }
}

/** Bun/node loader (tests + any future SSR use). Browser glue lives in browser.ts. */
export function nodeCedarLoader(): Promise<CedarApi> {
  return import("@cedar-policy/cedar-wasm/nodejs") as unknown as Promise<CedarApi>;
}
