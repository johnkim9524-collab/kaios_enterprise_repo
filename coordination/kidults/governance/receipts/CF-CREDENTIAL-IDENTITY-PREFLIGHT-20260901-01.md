## PROGRAM OWNER ONE-SHOT READ-ONLY EXTERNAL-CALL APPROVAL RECEIPT

**Approval ID:** `CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-01`

### Program Owner approval — verbatim

> `CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-01`을 승인합니다. 당시 current protected main에서 `kidults-cloudflare-staging-deploy` Environment의 `CLOUDFLARE_ACCOUNT_ID`와 `CLOUDFLARE_API_TOKEN`을 사용해 Cloudflare 읽기 전용 GET 요청을 최대 2회 실행하는 것을 승인합니다. Worker·Pages·route·domain 변경은 0이며, Secret 값은 출력·저장하지 않습니다. 첫 유효 실행에서 성공·실패와 관계없이 승인이 소진되고 재실행하지 않으며, Public·Production·G5 HOLD를 유지합니다.

### Immutable execution binding

- repository: `johnkim9524-collab/kaios_enterprise_repo`
- exact protected main at receipt issuance: `89da1efa67f252bae527fdebe207f4c763284081`
- authorized workflow: `.github/workflows/kidults-cloudflare-credential-identity-preflight-v1.yml`
- GitHub Environment: `kidults-cloudflare-staging-deploy`
- trigger: `workflow_dispatch`
- source ref: `refs/heads/main`
- dispatch count maximum: `1`
- external request maximum: `2`
- allowed request 1: `GET /client/v4/user/tokens/verify`
- allowed request 2: `GET /client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/workers/scripts`
- Worker / Pages / route / domain mutation maximum: `0`
- secret output / persistence: `FORBIDDEN`
- nonce: `cf43692776efd9f2c088d2030bd7764d38a71ac1e951dda5`
- issued at: `2026-09-01T05:08:00Z`
- expires at: `2026-09-02T05:08:00Z`
- consumption: `FIRST_VALID_PREFLIGHT_DISPATCH_PASS_OR_FAIL`
- rerun / replay / second dispatch: `FORBIDDEN`
- Public / Production / G5: `HOLD / HOLD / HOLD`

This comment is the GitHub truth-sync of the Program Owner's explicit read-only approval. It creates no Worker deployment authority and does not survive expiry, exact-main drift, nonce mismatch, first valid dispatch, or any terminal result.
