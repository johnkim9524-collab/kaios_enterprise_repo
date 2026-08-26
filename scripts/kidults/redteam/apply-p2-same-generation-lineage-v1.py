from pathlib import Path

p = Path('.github/workflows/kidults-asi-owned-source-intelligence-graph-v2.yml')
s = p.read_text()

old = 'concurrency:\n  group: kidults-asi-owned-source-intelligence-graph-v2-${{ github.ref }}\n  cancel-in-progress: true'
new = "concurrency:\n  # Distinct upstream completions must never cancel each other before exact-generation validation.\n  group: kidults-asi-owned-source-intelligence-graph-v2-${{ github.event_name }}-${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.run_id }}\n  cancel-in-progress: true"
if s.count(old) != 1:
    raise SystemExit('concurrency precondition mismatch')
s = s.replace(old, new)

start_marker = '          if [ -n "$P1_EVENT_RUN_ID" ]; then\n'
end_marker = "          gh api -H 'Accept: application/vnd.github+json' \\\n            \"/repos/${GITHUB_REPOSITORY}/actions/runs/${P1_RUN_ID}\" \\\n            > /tmp/p1-run.json\n"
start = s.find(start_marker)
end = s.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('restore selection block precondition mismatch')
replacement = '''          if [ -n "$P1_EVENT_RUN_ID" ]; then
            P1_SOURCE_SHA="$CURRENT_SHA"
            P1_EXPECTED_BRANCH=main
            if [[ "$P1_EVENT_SOURCE_SHA" == "$CURRENT_SHA" ]]; then
              P1_RUN_ID="$P1_EVENT_RUN_ID"
            else
              P1_RUN_ID=''
              for ATTEMPT in $(seq 1 60); do
                gh api --method GET -H 'Accept: application/vnd.github+json' \\
                  -f head_sha="$P1_SOURCE_SHA" -f status=success -f per_page=100 \\
                  "/repos/${GITHUB_REPOSITORY}/actions/workflows/kidults-asi-p1-source-preflight-v1.yml/runs" \\
                  > /tmp/p1-runs.json
                P1_RUN_ID=$(jq -r --arg sha "$P1_SOURCE_SHA" \\
                  '[.workflow_runs[] | select(.name=="KIDULTS ASI P1 Source Preflight v1" and .path==".github/workflows/kidults-asi-p1-source-preflight-v1.yml" and .head_branch=="main" and .head_sha==$sha and .status=="completed" and .conclusion=="success")] | if length>=1 then .[0].id else empty end' \\
                  /tmp/p1-runs.json)
                if [ -n "$P1_RUN_ID" ]; then break; fi
                if [ "$ATTEMPT" -eq 60 ]; then
                  echo "NO_SUCCESSFUL_CURRENT_SHA_P1_RUN:${P1_SOURCE_SHA}" >&2
                  exit 1
                fi
                sleep 10
              done
            fi
          elif [ "$GITHUB_EVENT_NAME" = pull_request ]; then
            P1_RUN_ID=''
            P1_SOURCE_SHA="$TARGET_SOURCE_SHA"
            P1_EXPECTED_BRANCH="$EXPECTED_P1_BRANCH"
            for ATTEMPT in $(seq 1 60); do
              gh api --method GET -H 'Accept: application/vnd.github+json' \\
                -f head_sha="$P1_SOURCE_SHA" -f status=success -f per_page=100 \\
                "/repos/${GITHUB_REPOSITORY}/actions/workflows/kidults-asi-p1-source-preflight-v1.yml/runs" \\
                > /tmp/p1-runs.json
              P1_RUN_ID=$(jq -r --arg sha "$P1_SOURCE_SHA" --arg branch "$P1_EXPECTED_BRANCH" \\
                '[.workflow_runs[] | select(.name=="KIDULTS ASI P1 Source Preflight v1" and .path==".github/workflows/kidults-asi-p1-source-preflight-v1.yml" and .head_branch==$branch and .head_sha==$sha and .status=="completed" and .conclusion=="success")] | if length>=1 then .[0].id else empty end' \\
                /tmp/p1-runs.json)
              if [ -n "$P1_RUN_ID" ]; then break; fi
              if [ "$ATTEMPT" -eq 60 ]; then
                echo "NO_SUCCESSFUL_SAME_SHA_P1_RUN:${P1_SOURCE_SHA}" >&2
                exit 1
              fi
              sleep 10
            done
          else
            P1_RUN_ID=''
            P1_SOURCE_SHA="$CURRENT_SHA"
            P1_EXPECTED_BRANCH=main
            for ATTEMPT in $(seq 1 60); do
              gh api --method GET -H 'Accept: application/vnd.github+json' \\
                -f head_sha="$P1_SOURCE_SHA" -f status=success -f per_page=100 \\
                "/repos/${GITHUB_REPOSITORY}/actions/workflows/kidults-asi-p1-source-preflight-v1.yml/runs" \\
                > /tmp/p1-runs.json
              P1_RUN_ID=$(jq -r --arg sha "$P1_SOURCE_SHA" \\
                '[.workflow_runs[] | select(.name=="KIDULTS ASI P1 Source Preflight v1" and .path==".github/workflows/kidults-asi-p1-source-preflight-v1.yml" and .head_branch=="main" and .head_sha==$sha and .status=="completed" and .conclusion=="success")] | if length>=1 then .[0].id else empty end' \\
                /tmp/p1-runs.json)
              if [ -n "$P1_RUN_ID" ]; then break; fi
              if [ "$ATTEMPT" -eq 60 ]; then
                echo "NO_SUCCESSFUL_CURRENT_SHA_P1_RUN:${P1_SOURCE_SHA}" >&2
                exit 1
              fi
              sleep 10
            done
          fi

          if [ "$GITHUB_EVENT_NAME" != pull_request ]; then
            test "$P1_EXPECTED_BRANCH" = main
            test "$P1_SOURCE_SHA" = "$CURRENT_SHA"
          fi

'''
s = s[:start] + replacement + s[end:]

path_marker = "      - 'scripts/kidults/redteam/validate-artifact-consumer-orchestration-v1.mjs'"
if s.count(path_marker) != 1:
    raise SystemExit('PR path precondition mismatch')
s = s.replace(path_marker, path_marker + "\n      - 'scripts/kidults/redteam/validate-p2-same-generation-lineage-v1.mjs'")

syntax_marker = '          node --check scripts/kidults/source-intelligence/validate-asi-owned-source-intelligence-graph-registry-v2.mjs'
if s.count(syntax_marker) != 1:
    raise SystemExit('syntax marker precondition mismatch')
s = s.replace(syntax_marker, syntax_marker + '\n          node --check scripts/kidults/redteam/validate-p2-same-generation-lineage-v1.mjs\n          node scripts/kidults/redteam/validate-p2-same-generation-lineage-v1.mjs')

p.write_text(s)

v = Path('scripts/kidults/redteam/validate-artifact-consumer-orchestration-v1.mjs')
t = v.read_text()
old = '''for (const [name, workflow] of Object.entries({ requirement, steering, ownedGraph })) {
  assert(!workflow.includes(globalArtifactListing), `${name.toUpperCase()}_GLOBAL_ARTIFACT_LISTING_FORBIDDEN`);
  assert(workflow.includes('/actions/runs/${'), `${name.toUpperCase()}_EXACT_RUN_ARTIFACT_QUERY_MISSING`);
  assert(workflow.includes('git merge-base --is-ancestor'), `${name.toUpperCase()}_ANCESTOR_BINDING_MISSING`);
}'''
new = '''for (const [name, workflow] of Object.entries({ requirement, steering })) {
  assert(!workflow.includes(globalArtifactListing), `${name.toUpperCase()}_GLOBAL_ARTIFACT_LISTING_FORBIDDEN`);
  assert(workflow.includes('/actions/runs/${'), `${name.toUpperCase()}_EXACT_RUN_ARTIFACT_QUERY_MISSING`);
  assert(workflow.includes('git merge-base --is-ancestor'), `${name.toUpperCase()}_ANCESTOR_BINDING_MISSING`);
}
assert(!ownedGraph.includes(globalArtifactListing), 'OWNEDGRAPH_GLOBAL_ARTIFACT_LISTING_FORBIDDEN');
assert(ownedGraph.includes('/actions/runs/${P1_RUN_ID}/artifacts'), 'OWNEDGRAPH_EXACT_RUN_ARTIFACT_QUERY_MISSING');
assert(ownedGraph.includes('P1_SOURCE_SHA="$CURRENT_SHA"') && ownedGraph.includes('test "$P1_SOURCE_SHA" = "$CURRENT_SHA"'), 'OWNEDGRAPH_EXACT_GENERATION_BINDING_MISSING');
assert(!ownedGraph.includes('git merge-base --is-ancestor "$P1_SOURCE_SHA" "$CURRENT_SHA"'), 'OWNEDGRAPH_ANCESTOR_GENERATION_FALLBACK_FORBIDDEN');
const ownedGraphConcurrencyContract = "group: kidults-asi-owned-source-intelligence-graph-v2-${{ github.event_name }}-${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.run_id }}";
assert(ownedGraph.includes(ownedGraphConcurrencyContract), 'OWNEDGRAPH_EVENT_SCOPED_CONCURRENCY_MISSING');'''
if t.count(old) != 1:
    raise SystemExit('aggregate validator precondition mismatch')
t = t.replace(old, new)

old = "assert((ownedGraph + globalArtifactListing).includes(globalArtifactListing), 'OWNED_GRAPH_GLOBAL_LISTING_MUTATION_NOT_DETECTED');"
new = old + '''
const ownedGraphGenerationMutation = ownedGraph.replace('test "$P1_SOURCE_SHA" = "$CURRENT_SHA"', 'git merge-base --is-ancestor "$P1_SOURCE_SHA" "$CURRENT_SHA"');
assert(ownedGraphGenerationMutation !== ownedGraph && !ownedGraphGenerationMutation.includes('test "$P1_SOURCE_SHA" = "$CURRENT_SHA"'), 'OWNED_GRAPH_GENERATION_MUTATION_NOT_DETECTED');
const ownedGraphConcurrencyMutation = ownedGraph.replace('github.event.workflow_run.id', 'github.ref');
assert(ownedGraphConcurrencyMutation !== ownedGraph && !ownedGraphConcurrencyMutation.includes(ownedGraphConcurrencyContract), 'OWNED_GRAPH_CONCURRENCY_MUTATION_NOT_DETECTED');'''
if t.count(old) != 1:
    raise SystemExit('mutation block precondition mismatch')
t = t.replace(old, new)
t = t.replace('adversarial_mutations_rejected: 9,', 'adversarial_mutations_rejected: 11,')
v.write_text(t)
