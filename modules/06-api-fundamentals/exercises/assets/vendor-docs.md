# acme.example — API Reference (v2)

> Developer documentation for the Acme workforce platform's REST API. This is the
> document the LOCATE stage reads: every answer your evidence pull needs is on this
> page. (Simulated vendor — this host exists only inside the lab.)

## Authentication

Two rungs are supported. Use the lowest-risk rung your tooling allows, with the
narrowest scope your job needs.

- **API key (legacy):** send `Authorization: Api-Key 9f8c4e21b6a94d3f8c7e5a1029384756`
  on every request. Keys do not expire — prefer OAuth2 below.
- **OAuth2 client-credentials (recommended):** exchange your client credentials for a
  short-lived bearer token at the token endpoint, then send
  `Authorization: Bearer <access_token>` on every API call.

```
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=<id>&client_secret=<secret>&scope=<scope>
```

Lab credentials: `client_id=grc_evidence_bot`,
`client_secret=cs_4d2b9e7f1a8c6053b4e2d9f7c1a08e35`.

Response: `{ "access_token": "...", "token_type": "Bearer", "expires_in": 3600, "scope": "..." }`.
Tokens live one hour. Requests with no credential answer `401`; a valid token that
lacks the endpoint's scope answers `403`.

### Scopes (least privilege)

| Scope | Grants |
|---|---|
| `users:read` | read access to `/api/v2/users` |
| `devices:read` | read access to `/api/v2/devices` |

## Endpoints

### `GET /api/v2/users`

Lists workforce users. Requires scope `users:read`. Each record carries `id`,
`email`, `mfa_enabled` (boolean), and `status` (`active` or `suspended`).

### `GET /api/v2/devices`

Lists managed endpoint devices. Requires scope `devices:read`. Each record carries
`id`, `user_id`, `hostname`, `disk_encrypted` (boolean), and `os`.

## Pagination

List endpoints are cursor-paginated. Every response carries:

```
"pagination": { "page": N, "per_page": 5, "total": T, "next_cursor": "..." }
```

Pass `?cursor=<next_cursor>` to fetch the next page. **Stop when `next_cursor` is
`null`.** Every page advertises the same grand `total` — verify your accumulated
record count against it before trusting any number you compute.

## Rate limits

600 requests per minute per credential. Exceeding the window answers
`429 Too Many Requests` with a `Retry-After` header (seconds). Wait that long, then
retry the same request — do not drop the page and do not hammer the endpoint.

## Errors

Every non-2xx response body has the shape:

```
{ "error": "<machine-readable code>", "message": "<human-readable explanation>" }
```

Read the status code before the body: `2xx` parse, `401` authenticate, `403` fix the
scope, `404` fix the address, `429` honor `Retry-After`, `5xx` retry with backoff.
