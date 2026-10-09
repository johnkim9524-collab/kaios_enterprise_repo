# KIDULTS Natural Clock STAGING Bootstrap V1

## One-time CloudShell bootstrap

Run only from the authenticated AWS account `528314240275` in `ap-northeast-2`:

```bash
set -euo pipefail
test "$(aws sts get-caller-identity --query Account --output text)" = "528314240275"
curl -fsSLo /tmp/kidults-natural-clock-deployer-bootstrap-v1.json https://raw.githubusercontent.com/johnkim9524-collab/kaios_enterprise_repo/main/infrastructure/aws/staging/natural-clock-deployer-bootstrap-v1.json
aws cloudformation deploy --region ap-northeast-2 --stack-name kidults-natural-clock-deployer-bootstrap-staging-v1 --template-file /tmp/kidults-natural-clock-deployer-bootstrap-v1.json --capabilities CAPABILITY_NAMED_IAM --no-fail-on-empty-changeset
aws cloudformation describe-stacks --region ap-northeast-2 --stack-name kidults-natural-clock-deployer-bootstrap-staging-v1 --query 'Stacks[0].Outputs' --output table
```

This creates only the STAGING artifact bucket, exact GitHub OIDC deployer role, and bounded CloudFormation execution role. It does not deploy a service, touch Production/Public/G5, create access keys, or use a PAT.

After bootstrap, run `KIDULTS Natural Clock STAGING Deploy V1` from protected `main` with the exact current main SHA and authorization ID `DEPLOY-STAGING-NATURAL-CLOCK-<first-12-main-sha>`. The workflow deploys the natural-clock stack with all five schedules enabled and writes a terminal deployment receipt.
