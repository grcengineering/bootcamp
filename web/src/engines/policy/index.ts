/**
 * Policy engines (web ISA ISC-71/72): Cedar (live learner-authored evaluation — the
 * policy-authoring flagship) + OPA/Rego (precompiled policies, input-mutation exercises).
 */
export {
  CedarEngineAdapter,
  nodeCedarLoader,
  type CedarApi,
  type CedarDecision,
  type CedarEntity,
  type CedarEntityUid,
  type CedarRequest,
} from "./cedar";
export {
  OpaEngineAdapter,
  OPA_DEFAULT_ENTRYPOINT,
  OPA_POLICY_DEFAULT_URL,
  type OpaAdapterOptions,
} from "./opa";
