## PROGRAM OWNER ONE-SHOT READ-ONLY EXTERNAL-CALL APPROVAL RECEIPT

**Approval ID:** `CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-02`

### Program Owner approval — verbatim

> CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-02를 승인합니다.
>
> 대상은 당시 current protected main에 반영될
> Cloudflare Credential Identity Preflight v2의
> 수동 workflow_dispatch 1회입니다.
>
> GitHub Environment kidults-cloudflare-staging-deploy의
> CLOUDFLARE_ACCOUNT_ID와 CLOUDFLARE_API_TOKEN을 사용하여
> Cloudflare 읽기 전용 GET 요청을 최대 2회 실행하는 것을 승인합니다.
>
> 허용 목적은 API Token 활성 확인과,
> 해당 Account ID에 대한 account-scoped Workers 읽기 권한 확인뿐입니다.
>
> Worker·Pages·route·domain 변경은 모두 0이며,
> Secret 값, Authorization header 및 raw provider response는
> 출력하거나 저장하지 않습니다.
>
> 첫 유효 v2 dispatch에서 성공·실패와 관계없이 승인이 소진되며,
> rerun·replay·두 번째 dispatch는 승인하지 않습니다.
>
> 신규 지출·계약 변경·credential 생성 또는 scope 확대는 승인하지 않습니다.
> Production route 0, custom domain 0,
> Pages 삭제·도메인 분리 0,
> Public·Production·G5 HOLD를 유지합니다.

### Immutable issuance binding

- repository: `johnkim9524-collab/kaios_enterprise_repo`
- exact protected main at receipt issuance: `ecfa2fd2b6d24d3e8d977544411cf590d84d48ee`
- authorized workflow: `.github/workflows/kidults-cloudflare-credential-identity-preflight-v2.yml`
- GitHub Environment: `kidults-cloudflare-staging-deploy`
- trigger: `workflow_dispatch`
- source ref: `refs/heads/main`
- dispatch count maximum: `1`
- external GET request maximum: `2`
- allowed request 1: `GET /client/v4/user/tokens/verify`
- allowed request 2: `GET /client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/workers/scripts`
- Worker / Pages / route / domain mutation maximum: `0`
- secret / Authorization header / raw provider response output or persistence: `FORBIDDEN`
- nonce: `4e47ac299e26f983d9773efdf913c7619b587978d2ab2e3b`
- issued at: `2026-09-01T07:36:40Z`
- expires at: `2026-09-02T07:36:40Z`
- consumption: `FIRST_VALID_V2_PREFLIGHT_DISPATCH_PASS_OR_FAIL`
- rerun / replay / second dispatch: `FORBIDDEN`
- new spend / contract / credential creation / credential-scope expansion: `FORBIDDEN`
- Production routes / custom domains / Pages mutation: `0 / 0 / 0`
- Public / Production / G5: `HOLD / HOLD / HOLD`

This comment is the GitHub truth-sync of the Program Owner's explicit v2 read-only approval. It creates no Worker deployment authority and does not survive expiry, exact-main drift, nonce mismatch, first valid dispatch, or any terminal result.
