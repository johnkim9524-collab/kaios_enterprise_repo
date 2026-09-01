## PROGRAM OWNER ONE-SHOT EXTERNAL-MUTATION APPROVAL RECEIPT

**Approval ID:** `CF-WORKERS-SHADOW-20260901-03`

### Program Owner approval — verbatim

> CF-WORKERS-SHADOW-20260901-03을 승인합니다.
>
> 대상은 당시 current protected main에 반영된
> kidults-public-portal-shadow v3의 수동 workflow_dispatch 1회이며,
> 최대 provider deployment attempt 1회로 제한합니다.
>
> 허용 표면은 non-Production workers.dev only입니다.
> Production route 0, custom domain 0,
> Cloudflare Pages 삭제·도메인 분리 0을 유지합니다.
>
> 신규 지출·계약 변경·credential 생성 또는 scope 확대는 승인하지 않습니다.
> Public·Production·G5 HOLD를 유지합니다.
>
> 첫 유효 v3 dispatch에서 성공·실패와 무관하게 승인이 소진되며,
> rerun·replay·두 번째 dispatch는 승인하지 않습니다.
> 정확한 current-main SHA, nonce와 만료시각을 실행 승인 receipt에 결속하는 데 동의합니다.

### Immutable execution binding

- repository: `johnkim9524-collab/kaios_enterprise_repo`
- exact protected main at receipt issuance: `0f71b08aae471b03e39528c1bfbb3e243134d09d`
- authorized workflow: `.github/workflows/kidults-cloudflare-workers-shadow-deploy-v3.yml`
- service: `kidults-public-portal-shadow`
- trigger: `workflow_dispatch`
- source ref: `refs/heads/main`
- dispatch count maximum: `1`
- provider deployment attempt maximum: `1`
- target: `workers_dev_non_production_only`
- nonce: `8a780e2bed4c518380cf0729778a50601637dd48d2e582b5`
- issued at: `2026-09-01T02:23:41Z`
- expires at: `2026-09-02T02:23:41Z`
- consumption: `FIRST_VALID_V3_DISPATCH_PASS_OR_FAIL`
- rerun / replay / second dispatch: `FORBIDDEN`
- Production routes: `0`
- custom domains: `0`
- Pages delete / domain detach: `FORBIDDEN`
- new spend / contract / credential / credential-scope expansion: `FORBIDDEN`
- Public / Production / G5: `HOLD / HOLD / HOLD`

This comment is the GitHub truth-sync of the Program Owner's explicit approval in the current conversation. It does not authorize any workflow other than the exact v3 workflow and does not survive expiry, main drift, nonce mismatch, first valid dispatch, or any terminal result.
