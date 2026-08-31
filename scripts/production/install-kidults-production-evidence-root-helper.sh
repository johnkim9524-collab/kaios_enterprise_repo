#!/usr/bin/env bash
set -euo pipefail
IFS=$' \t\n'
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH LC_ALL=C TZ=UTC
umask 077

readonly WORKSPACE=/opt/actions-runner/_work/kaios_enterprise_repo/kaios_enterprise_repo
readonly HELPER_SOURCE="$WORKSPACE/scripts/production/kidults-production-evidence-root-helper"
readonly HELPER_TARGET=/usr/local/libexec/kidults-production-evidence-root-helper
readonly CONFIG=/etc/kaios/kidults-production-release/root-helper-pins.conf
readonly SUDOERS=/etc/sudoers.d/kidults-production-evidence-root-helper

fail() { printf 'ROOT_HELPER_INSTALL_FAIL:%s\n' "$1" >&2; exit 1; }
digest() { sha256sum -- "$WORKSPACE/$1" | awk '{print $1}'; }

[[ "$#" -eq 0 ]] || fail ARGUMENTS_FORBIDDEN
[[ "$(id -u)" -eq 0 ]] || fail ROOT_REQUIRED
[[ -d "$WORKSPACE" && ! -L "$WORKSPACE" ]] || fail WORKSPACE_INVALID
[[ "$(readlink -f -- "$WORKSPACE")" == "$WORKSPACE" ]] || fail WORKSPACE_REDIRECTED
[[ -f "$HELPER_SOURCE" && ! -L "$HELPER_SOURCE" ]] || fail HELPER_SOURCE_INVALID
command -v visudo >/dev/null || fail VISUDO_REQUIRED

source_sha="$(git -c safe.directory="$WORKSPACE" -C "$WORKSPACE" rev-parse HEAD)"
[[ "$source_sha" =~ ^[0-9a-f]{40}$ ]] || fail SOURCE_SHA_INVALID
origin="$(git -c safe.directory="$WORKSPACE" -C "$WORKSPACE" config --local --get remote.origin.url)"
[[ "$origin" == https://github.com/johnkim9524-collab/kaios_enterprise_repo.git ]] || fail ORIGIN_NOT_CANONICAL

install -d -o root -g root -m 0755 /usr/local/libexec
install -d -o root -g root -m 0750 /etc/kaios/kidults-production-release
install -o root -g root -m 0755 "$HELPER_SOURCE" "$HELPER_TARGET"

config_tmp="$(mktemp /etc/kaios/kidults-production-release/.root-helper-pins.XXXXXX)"
sudoers_tmp="$(mktemp /etc/sudoers.d/.kidults-production-evidence.XXXXXX)"
trap 'rm -f -- "${config_tmp:-}" "${sudoers_tmp:-}"' EXIT
{
  printf 'SOURCE_SHA=%q\n' "$source_sha"
  printf 'SEALER_SHA256=%q\n' "$(digest scripts/production/seal-kidults-production-evidence.sh)"
  printf 'GATE_SHA256=%q\n' "$(digest scripts/production/validate-kidults-production-release-v1.mjs)"
  printf 'POLICY_SHA256=%q\n' "$(digest coordination/kidults/source-intelligence/current-sold-sample-governance-v1.json)"
  printf 'CONTRACT_SHA256=%q\n' "$(digest contracts/certification/kidults-controlled-production-promotion.v1.json)"
} > "$config_tmp"
chown root:root "$config_tmp"
chmod 0600 "$config_tmp"

printf '%s\n' \
  'kidults-runner ALL=(root) NOPASSWD: /usr/local/libexec/kidults-production-evidence-root-helper' \
  > "$sudoers_tmp"
chown root:root "$sudoers_tmp"
chmod 0440 "$sudoers_tmp"
visudo -cf "$sudoers_tmp" >/dev/null

mv -f -- "$config_tmp" "$CONFIG"
mv -f -- "$sudoers_tmp" "$SUDOERS"
trap - EXIT
visudo -cf "$SUDOERS" >/dev/null
printf 'ROOT_HELPER_INSTALL_PASS\nsource_sha=%s\n' "$source_sha"
