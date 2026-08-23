# KIDULTS ASI Candidate SSRF-Safe Preflight v1

## Current state

`IMPLEMENTED_SECURITY_PROOF_NETWORK_EXECUTION_HOLD`

This package is the fail-closed replacement design for the unsafe candidate-host network behavior identified in issue #1132 and closed PR #1130. It does **not** authorize or execute live candidate-host requests from protected main. The registered workflow runs an offline exact-head mutation proof only.

## Why the prior design was contained

Public-metadata candidate URLs are untrusted. Network bounds on method, request count, response bytes and timeout do not create an egress trust boundary. Resolving an origin from candidate metadata and using automatic redirects can turn an attacker-controlled URL or redirect into a request to runner-reachable loopback, private, link-local, metadata-service or other special-use targets.

PR #1130 therefore remains closed and unmerged. Existing P1 candidate output remains preflight-only: rights are not created, Evidence is not admitted, market claims are not created, and Production/Public/G5 remain HOLD.

## Replacement controls

The replacement transport applies all controls before every request and every redirect hop:

1. require an explicitly bound trusted control-plane resolver; the system resolver is not an implicit fallback;
2. only HTTP(S), HEAD/GET and default ports;
3. no credentials, fragments, backslash authority confusion or IP literals;
4. no single-label, localhost, internal or special-use names;
5. resolve all A/AAAA answers and reject the entire destination if any answer is non-global;
6. deterministically select and pin one validated address;
7. preserve the original validated hostname for TLS SNI and certificate verification;
8. verify that the connected remote address matches the selected pin;
9. disable automatic redirects, validate every Location as a new destination and cap redirects at three;
10. reject HTTPS-to-HTTP downgrade, redirect loops and missing/invalid locations;
11. bind URL digest, hostname, port, all DNS answers, selected address, transport mode, redirect hops and remote-pin match into the receipt.

The transport implementation uses Node HTTP(S) with an address-pinned `lookup` callback, one connection per request, original-host TLS verification and a post-connect remote-address assertion. It has no implicit DNS fallback: absence of an approved resolver fails with `TRUSTED_RESOLVER_REQUIRED`. After an approved answer is selected, the request path does not perform a second resolver lookup.

## Mutation proof

`validate-ssrf-safe-candidate-preflight-v1.mjs` executes offline mutations with injected DNS and transport adapters. No live candidate host is contacted. The proof covers:

- credentials, schemes, fragments, backslashes and non-default ports;
- IPv4 loopback, metadata, decimal, octal and hexadecimal forms;
- IPv6 loopback, mapped, unique-local and link-local forms;
- localhost, internal and special-use names;
- empty, private, link-local, mixed public/private and family-inconsistent DNS answers;
- redirect to IP literal, internal name or mixed DNS;
- downgrade, loop and redirect-cap attacks;
- connected-remote-address mismatch;
- DNS rebinding/check-request TOCTOU behavior.
- missing trusted resolver and any implicit system-resolver fallback.
- invalid method, timeout, body and redirect-limit configuration.

The workflow requires all mutations to be rejected and emits an immutable proof artifact. The artifact is a security proof, not a target-site preflight artifact and not a rights, Evidence, market or release receipt.

## Rights and evidence boundary

- Robots disclosure is not permission or license.
- Discovering Terms, Privacy, Legal or API links is not a rights pass.
- HTTP reachability is not source admission.
- A semantic signal is not market Evidence.
- A successful safe request is not an Evidence admission, dated-SOLD Observation, transaction, liquidity measure or Projection.
- No provider, credential, contract, cost, Production, Public or G5 action is authorized.

## Activation gate

Live candidate-host execution remains disabled until all of the following exist:

1. an exact-head mutation artifact with every declared attack rejected;
2. Security review of address pinning, TLS hostname verification and remote-address match;
3. explicit KPMO Security activation record;
4. no unresolved P0 SSRF mutation;
5. a separate workflow change that keeps the same receipt and rights boundaries.

Until then, the correct state is `HOLD`, not RUNNING, PASS or COMPLETE.

## Platform Constitution effects

- `autonomous_effect`: the offline security proof runs on every relevant PR and protected-main change without a manual button.
- `global_effect`: the same non-compensating egress policy applies to every region, language, category and candidate host.
- `irreplaceable_value_effect`: allowed-destination, DNS, redirect and pin evidence is retained in a KIDULTS-owned receipt.
- `transparency_effect`: every allowed destination, rejected mutation, redirect hop, DNS answer, pin and activation blocker is explicit.
