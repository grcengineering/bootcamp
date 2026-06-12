/**
 * Mock SaaS API engine entry point (web ISA ISC-74..79).
 *
 * In-engine fetch router for the fictional vendor acme.example — consumed directly by
 * the terminal sim's `curl` (src/engines/shell/curl-ext.ts) and the api-client panel.
 * Pure DOM-free TypeScript; see ./types.ts for the contract and honesty classes.
 */
export type * from "./types";
export { createApiRouter } from "./router";
export {
  acmeConfig,
  errorBody,
  ERRORS,
  USERS_PAGE_1,
  USERS_PAGE_2,
  USERS_PAGE_2_CURSOR,
  DEVICES_PAGE_1,
  ACME_API_KEY,
  ACME_CLIENT_ID,
  ACME_CLIENT_SECRET,
  SCOPE_USERS_READ,
  SCOPE_DEVICES_READ,
} from "./acme";
export { simulateMfaDisabledDelivery, type WebhookEventOptions } from "./webhooks";
