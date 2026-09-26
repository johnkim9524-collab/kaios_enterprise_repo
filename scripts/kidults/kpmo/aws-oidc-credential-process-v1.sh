#!/usr/bin/env bash
set -euo pipefail

role_arn="${1:?role ARN required}"
session_name="${2:?session name required}"
[[ "$role_arn" =~ ^arn:aws:iam::528314240275:role/kidults-[A-Za-z0-9+=,.@_-]+$ ]]
[[ "$session_name" =~ ^kidults-[A-Za-z0-9+=,.@_-]+$ ]]
test -n "${ACTIONS_ID_TOKEN_REQUEST_URL:-}"
test -n "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-}"

oidc_json=$(curl --fail --silent --show-error \
  -H "Authorization: Bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
  "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=sts.amazonaws.com")
oidc_token=$(jq -er '.value' <<<"$oidc_json")
credentials=$(env -u AWS_PROFILE -u AWS_CONFIG_FILE -u AWS_SHARED_CREDENTIALS_FILE \
  -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN \
  aws sts assume-role-with-web-identity --region ap-northeast-2 \
  --role-arn "$role_arn" --role-session-name "$session_name" \
  --web-identity-token "$oidc_token" --duration-seconds 900 \
  --query 'Credentials' --output json)
jq -ce '{Version:1,AccessKeyId,SecretAccessKey,SessionToken,Expiration}' <<<"$credentials"
unset credentials oidc_json oidc_token
