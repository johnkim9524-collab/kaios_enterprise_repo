# Autonomous Landing STAGING Deployment Runbook v1

Status: STAGING ONLY / OWNER EXACT-MAIN AUTHORIZATION REQUIRED
Production: HOLD
Public: HOLD
G5: HOLD
Provider activation: HOLD

## Purpose

Apply a reviewed `infrastructure/aws/staging/autonomous-internal-landing-v1.json` update without creating a generic AWS command channel. The deployer accepts only the protected-main SHA, the exact template SHA-256, and the derived single-use authorization ID. It rejects any deployed-template delta or CloudFormation change set beyond the three approval-role inline policies. It deliberately does not attach or replace a persistent CloudFormation service role on the existing stack.

## One-time bootstrap

An authenticated `KIDULTS-Provisioning-Admin` session applies only:

```bash
aws cloudformation deploy \
  --region ap-northeast-2 \
  --stack-name kidults-autonomous-landing-deployer-bootstrap-staging-v1 \
  --template-file infrastructure/aws/staging/autonomous-landing-deployer-bootstrap-v1.json \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset
```

Create the GitHub environment `KIDULTS-AUTONOMOUS-LANDING-DEPLOYER` with Production/Public/G5 variables fixed to `HOLD`. Do not add static AWS credentials. The bootstrap role accepts only the exact main-branch deploy workflow through GitHub OIDC.

## Exact deployment authorization

For protected main SHA `<MAIN_SHA>` compute:

```bash
sha256sum infrastructure/aws/staging/autonomous-internal-landing-v1.json
```

The authorization ID is:

```text
DEPLOY-STAGING-AUTONOMOUS-LANDING-<first-12-main-sha>-<first-12-template-sha256>
```

Dispatch `.github/workflows/kidults-autonomous-landing-staging-deploy-v1.yml` on `main` with the three exact values. The workflow fails closed unless the actor is the repository Owner, the run is attempt 1, and `github.sha` equals the approved main SHA.

## Mandatory pre-execution proof

Before execution the workflow:

1. reads the currently deployed original CloudFormation template;
2. proves its only delta from the exact-main template is the bounded `dynamodb:Query` statement on `AUTH#*` for Track, KPMO, and Verifier roles;
3. creates a change set through the exact CloudFormation execution role;
4. proves the change set contains exactly those three non-replacement `AWS::IAM::Role` modifications;
5. executes only after all checks pass.

## Terminal verification

The workflow reads back all three inline policies, proves the exact table ARN and `AUTH#*` condition, proves DynamoDB write actions remain absent, compares the deployed template to exact main, and uploads a terminal receipt. Only after `DEPLOYED_VERIFIED` may PR #2472 be rebased on current main and allowed to traverse the natural Track → KPMO → `INDEPENDENT_VERIFIER` → Finalizer chain.

No step authorizes Production/Public/G5 promotion, provider activation, ruleset bypass, static credentials, trust-policy changes, role creation outside the one-time bootstrap, or arbitrary AWS commands.
