# Target-aware precheck design

## Problem

The penetration-test page currently treats every target as a domain during the
precheck wizard. A URL such as `http://139.198.31.136:81/#/login` is therefore
sent to Xiaoyi as a `can_subdomain` domain. The Xiaoyi WebSocket accepts the
connection but does not return a terminal response for that invalid payload,
so the browser reports a 30-second timeout.

## Required behavior

Classify the original target before opening the precheck wizard:

- A URL with an `http` or `https` scheme is an `http` asset. It does not call
  the Xiaoyi subdomain or port precheck WebSocket. The platform updates the
  plan assets through its existing endpoint, which performs the local CDN/WAF
  assessment, and then moves to authorization.
- A plain IPv4 address is an `ip` asset. It skips subdomain precheck and starts
  with port precheck.
- A plain hostname is a `domain` asset. It keeps the documented subdomain then
  port precheck sequence.
- CDN/WAF status other than `SAFE` continues to block confirmation and task
  creation.

The original URL, including its explicit port and path, remains the asset sent
to the platform and ultimately to Xiaoyi when a task is created.

## Data flow

1. Parse the target locally into an asset type.
2. Create the draft plan and run the existing DeepSeek consultation.
3. Open the confirmation wizard with a type-aware first available action.
4. For `http`, call the existing scan-plan asset update endpoint with the
   original URL. The backend performs the existing CDN/WAF assessment and
   returns the enriched asset list. No Xiaoyi precheck WebSocket is opened.
5. For `ip`, send only `can_port` with the plain IP.
6. For `domain`, send `can_subdomain`, then `can_port`, using only plain host
   values as required by the Xiaoyi WebSocket document.
7. Permit authorization only after platform CDN/WAF assessment succeeds.

## Error handling

- Target parsing failures remain visible beside the input.
- Platform CDN/WAF failures are shown in the existing modal alert.
- Xiaoyi connection and response timeouts are translated into a clear Chinese
  precheck error.
- A failed precheck leaves the draft plan unconfirmed and never starts a scan.

## Scope

This change modifies only the existing frontend page, WebSocket helper, and
their tests. It reuses the current scan-plan asset update endpoint and CDN
implementation. It introduces no service, dependency, protocol, or database
change.

## Verification

- A regression test submits an HTTP URL while `crypto.randomUUID` is absent,
  confirms no precheck WebSocket message is sent, and confirms the platform
  asset update contains the unchanged URL.
- Existing domain and IP precheck tests continue to cover their WebSocket
  paths.
- Run the full frontend test suite, lint, type check, and production build.
- Deploy and confirm the public service is healthy and serves the new build.
