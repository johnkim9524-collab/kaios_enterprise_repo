#!/usr/bin/env node
import fs from 'node:fs';

const path='scripts/production/install-kidults-production-evidence-root-helper.sh';
const text=fs.readFileSync(path,'utf8');
const STOP='fail HARD_DISABLED_PENDING_INDEPENDENT_ROOT_TRUST_ROOT';

function assert(condition,code){if(!condition)throw new Error(code);}
function validate(value){
  const stopMatches=value.match(/^fail HARD_DISABLED_PENDING_INDEPENDENT_ROOT_TRUST_ROOT$/gm)||[];
  assert(stopMatches.length===1,'ROOT_HELPER_HARD_STOP_CARDINALITY_INVALID');
  const stop=value.indexOf(STOP);
  assert(stop>=0,'ROOT_HELPER_HARD_STOP_MISSING');
  assert(value.includes('P0 #1694 containment'),'ROOT_HELPER_P0_RATIONALE_MISSING');
  // Bind ordering to executable reads/writes only. Variable assignments, function
  // definitions and rationale comments are declarations and must not be mistaken
  // for runner-workspace access.
  const dangerous=[
    '[[ -d "$WORKSPACE" && ! -L "$WORKSPACE" ]]',
    '[[ "$(readlink -f -- "$WORKSPACE")" == "$WORKSPACE" ]]',
    '[[ -f "$HELPER_SOURCE" && ! -L "$HELPER_SOURCE" ]]',
    'git -c safe.directory="$WORKSPACE" -C "$WORKSPACE" rev-parse HEAD',
    'git -c safe.directory="$WORKSPACE" -C "$WORKSPACE" config --local --get remote.origin.url',
    'install -d -o root -g root -m 0755 /usr/local/libexec',
    'install -o root -g root -m 0755 "$HELPER_SOURCE" "$HELPER_TARGET"',
    'mktemp /etc/kaios/kidults-production-release/.root-helper-pins.',
    'mktemp /etc/sudoers.d/.kidults-production-evidence.',
    'mv -f -- "$config_tmp" "$CONFIG"',
    'mv -f -- "$sudoers_tmp" "$SUDOERS"',
  ];
  for(const marker of dangerous){
    const pos=value.indexOf(marker);
    assert(pos>stop,`ROOT_HELPER_PRIVILEGED_OR_MUTABLE_SOURCE_PRECEDES_HARD_STOP:${marker}`);
  }
  return true;
}

validate(text);
const removed=text.replace(STOP,'true # removed hard stop');
try{validate(removed);throw new Error('ROOT_HELPER_HARD_STOP_REMOVAL_FALSE_GREEN');}catch(error){
  if(error.message==='ROOT_HELPER_HARD_STOP_REMOVAL_FALSE_GREEN')throw error;
}
const moved=text.replace(`${STOP}\n\n# Historical implementation retained below for audit/diff lineage only.\n# It is intentionally unreachable while #1694 remains open.\n`,
  '# Historical implementation retained below for audit/diff lineage only.\n# It is intentionally unreachable while #1694 remains open.\n').replace(
  'install -d -o root -g root -m 0755 /usr/local/libexec',
  `install -d -o root -g root -m 0755 /usr/local/libexec\n${STOP}`,
);
try{validate(moved);throw new Error('ROOT_HELPER_HARD_STOP_REORDER_FALSE_GREEN');}catch(error){
  if(error.message==='ROOT_HELPER_HARD_STOP_REORDER_FALSE_GREEN')throw error;
}
const preRead=text.replace(
  STOP,
  `[[ -d "$WORKSPACE" && ! -L "$WORKSPACE" ]] || fail WORKSPACE_INVALID\n${STOP}`,
);
try{validate(preRead);throw new Error('ROOT_HELPER_WORKSPACE_READ_REORDER_FALSE_GREEN');}catch(error){
  if(error.message==='ROOT_HELPER_WORKSPACE_READ_REORDER_FALSE_GREEN')throw error;
}
console.log(JSON.stringify({
  id:'kidults-production-root-helper-bootstrap-containment-v1',
  state:'VERIFIED_PASS',
  installer:path,
  legacy_bootstrap_executable:false,
  workspace_read_before_hard_stop:false,
  privileged_write_before_hard_stop:false,
  root_trust_replacement_authorized:false,
  production:'HOLD',public_release:'HOLD',g5:'HOLD'
},null,2));
