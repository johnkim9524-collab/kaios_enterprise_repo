import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Production helpers correctly require root-owned evidence. Hosted CI creates
// synthetic fixtures as its unprivileged runner account, so adapt only
// extracted test copies to that fixture owner. Static source checks below
// continue to bind the production helpers to literal root ownership guards.
const adaptExtractedCodeToFixtureOwner = code => {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  const gid = typeof process.getgid === 'function' ? process.getgid() : 0;
  if (uid === 0 && gid === 0) return code;
  return code
    .replaceAll('.st_uid != 0', `.st_uid != ${uid}`)
    .replaceAll('.st_gid != 0', `.st_gid != ${gid}`)
    .replaceAll('.st_uid == 0', `.st_uid == ${uid}`)
    .replaceAll('.st_gid == 0', `.st_gid == ${gid}`);
};

const contractPath = 'contracts/certification/kidults-controlled-production-promotion.v1.json';
const snapshotPath = 'scripts/production/capture-kidults-predeployment-snapshot.sh';
const sqliteSnapshotHelperPath = 'scripts/production/capture-kidults-sqlite-snapshot-v1.py';
const sqliteRestoreHelperPath = 'scripts/production/restore-kidults-sqlite-rollback-v1.py';
const promotionPath = 'scripts/production/promote-kidults-controlled.sh';
const rollbackPath = 'scripts/production/rollback-kidults-controlled.sh';
const sealPath = 'scripts/production/seal-kidults-production-evidence.sh';
const releaseGatePath = 'scripts/production/validate-kidults-production-release-v1.mjs';
const readinessFinalizerPath = 'scripts/production/finalize-kidults-production-readiness.py';
const validatorPath = 'scripts/kidults/kpmo/validate-production-rollback-contract-v1.mjs';

const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const sources = {
  snapshot: fs.readFileSync(snapshotPath, 'utf8'),
  sqliteHelper: fs.readFileSync(sqliteSnapshotHelperPath, 'utf8'),
  sqliteRestoreHelper: fs.readFileSync(sqliteRestoreHelperPath, 'utf8'),
  promotion: fs.readFileSync(promotionPath, 'utf8'),
  rollback: fs.readFileSync(rollbackPath, 'utf8'),
  seal: fs.readFileSync(sealPath, 'utf8'),
  releaseGate: fs.readFileSync(releaseGatePath, 'utf8'),
  readinessFinalizer: fs.readFileSync(readinessFinalizerPath, 'utf8'),
  validator: fs.readFileSync(validatorPath, 'utf8'),
};

const requiredMarkers = {
  snapshot: [
    'rollback_ready', 'rollback-images.json', 'docker image save --output',
    'rollback-images.tar.sha256', 'database-metadata.tsv', 'incomplete rollback snapshot',
    'SQLITE_ONLINE_BACKUP_API', 'capture-kidults-sqlite-snapshot-v1.py',
    'Predeployment snapshot capture requires the protected root executor',
    'snapshot directory already exists', 'getattr(os, "O_NOFOLLOW", 0)', 'os.fsync(descriptor)',
    'DATABASE_CAPTURE_RECORD', 'database-metadata.tsv',
    'SQLite held-inode metadata receipt does not match helper output',
    'SQLite snapshot helper bytes do not match the signed source SHA',
    'Live gateway image reference does not match captured compose',
    'os.O_RDONLY | os.O_NONBLOCK | getattr(os, "O_NOFOLLOW", 0)',
    '"captured_at": database_captured_at', '"snapshot_completed_at":',
  ],
  sqliteHelper: [
    'os.O_EXCL', 'getattr(os, "O_NOFOLLOW", 0)', 'source.backup(target)',
    'matching_open_descriptors', 'require_connection_descriptors',
    'SQLITE_SOURCE_CONNECTION_NOT_BOUND_TO_HELD_INODE',
    'SQLITE_TARGET_CONNECTION_NOT_BOUND_TO_HELD_INODE',
    'KIDULTS_SQLITE_SNAPSHOT_TEST_HOOKS',
    'Path(f"/proc/self/fd/{source_parent_fd}/{source_path.name}")',
    'Path(f"/proc/self/fd/{target_parent_fd}/{target_path.name}")',
    'database_metadata_identity(os.fstat(source_fd))', 'SQLITE_SOURCE_METADATA_CHANGED_DURING_BACKUP',
    'SQLITE_SOURCE_ENTRY_CHANGED_AFTER_BACKUP', 'SQLITE_SOURCE_METADATA_CHANGED_AFTER_BACKUP',
    'SQLITE_SOURCE_METADATA_UNSAFE', 'metadata_fd = os.open(', 'source_mode:04o',
    'os.O_RDONLY | os.O_NONBLOCK | getattr(os, "O_NOFOLLOW", 0)',
  ],
  sqliteRestoreHelper: [
    'os.O_EXCL | os.O_NOFOLLOW', 'dir_fd=args.source_dir_fd', 'write_from_source',
    'SQLITE_RESTORE_SOURCE_DIGEST_MISMATCH', 'os.fchown', 'os.fchmod',
    'os.fsync(temp_fd)', 'SQLITE_RESTORE_TEMP_IDENTITY_CHANGED',
    'SQLITE_RESTORE_DESTINATION_CHANGED_BEFORE_RENAME', 'os.replace(',
    'src_dir_fd=args.destination_dir_fd', 'dst_dir_fd=args.destination_dir_fd',
    'SQLITE_RESTORE_PUBLISHED_IDENTITY_OR_METADATA_MISMATCH',
    'KIDULTS_SQLITE_RESTORE_TEST_HOOKS', 'SQLITE_RESTORE_TEMP_COLLISION',
    '--receipt-dir-fd', 'prepare_sidecar_transaction', 'SQLITE_RESTORE_UNKNOWN_SIDECAR_NAMESPACE',
    'SQLITE_RESTORE_SIDECAR_NOT_REGULAR', 'SQLITE_RESTORE_SIDECAR_RECEIPT_COLLISION',
    'source_before.st_nlink != 1', 'require_sidecars_absent',
    'SIDECAR_RECEIPTS_DURABLE', 'rename_noreplace', 'RENAME_NOREPLACE',
    'ABORTED_SIDECARS_RESTORED', 'POST_PUBLISH_FAILURE_HOLD',
    'SQLITE_RESTORE_PREEXISTING_TRANSACTION_JOURNAL_HOLD',
    'os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK',
  ],
  promotion: [
    'readonly BASE_URL="https://kaios.kidults.com"', 'ROLLBACK_ARMED=false', 'ROLLBACK_ARMED=true',
    'trap on_error ERR', "trap 'rollback_and_exit SIGINT 130' INT", "trap 'rollback_and_exit SIGTERM 143' TERM",
    'KAIOS_EXECUTE_PRODUCTION_ROLLBACK=true', 'rollback_and_exit "SMOKE_FAILURE" 2',
    'snapshot.get("rollback_ready") is True', 'KAIOS_EXECUTE_PRODUCTION_ROLLBACK=false',
    "curl --proto '=https' --max-redirs 0", 'PROGRAM_OWNER_RELEASE_PUBLIC_KEY_FILE',
    'RELEASE_EXECUTOR_PUBLIC_KEY_FILE', 'REPLAY_CONSUMPTION_ROOT',
    '--consumption-attestation', '--expected-owner-key-id', '--expected-executor-key-id',
    '--execution-mode CONTROLLED_PRODUCTION_PROMOTION', 'verify-sealed-release',
    'current-sold-sample-governance-v1.json',
    'EXPECTED_ARCHIVE_SHA256', 'git -C "${ROOT_DIR}" diff --quiet',
    'PROD_SOURCE_SHA', 'Production runtime source does not match signed release source SHA',
    '--pull never', 'mktemp -d', '--connect-timeout 10', '--max-time 30',
    'LOCAL_CONSUMPTION_MARKER_ROOT', 'CONSUMED_BEFORE_FIRST_PRODUCTION_MUTATION',
    'revalidate_immediately_before_mutation', 'ls-remote --exit-code "${CANONICAL_REPOSITORY_ORIGIN}" refs/heads/main',
    '--predeployment-snapshot-manifest-sha256', '--deployment-manifest-sha256 "${DEPLOYMENT_MANIFEST_SHA256}"',
    'Production deployment manifest does not match Program Owner authorization',
    '"deployment_manifest_sha256": sys.argv[10]',
    'KAIOS_PREPARE_PRODUCTION_ROLLBACK=true', 'PREPARED_ROLLBACK_DIR',
    'Durable rollback manifest changed before mutation',
    'ROLLBACK_PIN_ROOT_ID', 'PREPARED_ROLLBACK_ID', 'verify_protected_directory_fd',
    'rollback_pin_root_identity', 'prepared_rollback_identity', 'PREPARED_ROLLBACK_STABLE',
    'rollback_and_exit "EXPLICIT_FAILURE" 1', 'DEPLOYED_GATEWAY_CONTAINER_ID',
    'DEPLOYED_SCHEDULER_CONTAINER_ID', 'deployed_gateway_container_id',
    'deployed_scheduler_container_id', 'set(payload) == expected_keys',
    "rollback_and_exit() {\n  # Once any failure/signal enters containment, a second ERR/INT/TERM must not\n  # restore default process termination before the bound rollback or exact\n  # terminal authority decision.  The bound rollback child inherits the\n  # ignored dispositions for this bounded containment invocation.\n  trap '' ERR INT TERM",
  ],
  rollback: [
    'KAIOS_EXECUTE_PRODUCTION_ROLLBACK', 'EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256',
    'KAIOS_PREPARE_PRODUCTION_ROLLBACK', 'A pre-mutation durable pinned rollback directory is required',
    'Prepared rollback input path is not digest-bound', 'PREDEPLOYMENT_SNAPSHOT_DIR="/proc/self/fd/8"',
    'ROLLBACK_AUTHORIZATION_ROOT', 'ROLLBACK_AUTHORIZATION_BINDING',
    'verify_protected_directory_chain_fd', 'os.O_NOFOLLOW', 'ROLLBACK_PIN_ROOT_STABLE',
    'PREPARED_ROLLBACK_ID', 'rollback_pin_root_identity', 'prepared_rollback_identity',
    'PREDEPLOYMENT_SNAPSHOT_DIR="/proc/self/fd/8"',
    'Unsafe captured database mode metadata', 'Captured database metadata timestamp binding mismatch',
    'verify_protected_database_parent_fd', 'exec 7<"${PROD_DB_PARENT_REAL}"',
    'restore-kidults-sqlite-rollback-v1.py', 'verify_sqlite_restore_helper_fd',
    'SQLite rollback restore helper is not the protected signed-source program',
    'SQLITE_RESTORE_HELPER_STABLE="/proc/self/fd/6/restore-kidults-sqlite-rollback-v1.py"',
    '--source-dir-fd 8', '--destination-dir-fd 7', '--expected-sha256 "${SNAPSHOT_DATABASE_SHA256}"',
    'Production database entry is unsafe before restore', 'Production database parent changed after atomic restore',
    'readonly ROLLBACK_RECEIPT_ROOT="/mnt/ih_prod_01/backups/production-certification/rollback-receipts"',
    'create_exclusive_receipt_directory_fd', 'secrets.token_hex(32)',
    'exec 5<"${ROLLBACK_RECEIPT_ROOT}"', 'exec 4<"${ROLLBACK_RECEIPT_ROOT_STABLE}/${RECEIPT_DIR_NAME}"',
    'copy_regular_path_to_receipt_fd', 'run_with_exclusive_receipt_stdout_fd',
    'curl_to_exclusive_receipt_fd', 'ROLLBACK_RECEIPT_FINAL_CLOSURE',
    'os.fsync(receipt_fd)', 'os.fsync(root_fd)',
    'target_fd = os.open("rollback-receipt.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW',
    'checksum_fd = os.open("rollback-receipt.json.sha256", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW',
    'ROLLBACK_FINAL_RECEIPT_IDENTITY_INVALID', 'ROLLBACK_RECEIPT_DURABILITY_PASS',
    'docker stop --time 30 "${BEFORE_GATEWAY_CONTAINER_ID}" "${BEFORE_SCHEDULER_CONTAINER_ID}"',
    'verify_runtime_containers_stopped "container-quiescence-after-stop.json"',
    'verify_runtime_containers_stopped "container-quiescence-before-restore.json"',
    'verify_runtime_containers_stopped "container-quiescence-after-restore.json"',
    'verify_runtime_containers_stopped "container-quiescence-before-startup.json"',
    '|| fail "Production rollback containers restarted immediately before forensic capture"\npython3 -I - 7 4 "$(basename "${PROD_DB}")"',
    '|| fail "Production rollback containers restarted immediately before atomic restore"\npython3 -I "${SQLITE_RESTORE_HELPER_STABLE}"',
    'verify_sqlite_sidecar_namespace_absent_fd',
    'ROLLBACK_SQLITE_KNOWN_SIDECAR_REAPPEARED',
    'ROLLBACK_SQLITE_UNKNOWN_SIDECAR_NAMESPACE',
    '.kidults-rollback-active-v1.json', 'rollback-transaction-v1.jsonl',
    'restart-policy-before.json', 'docker update --restart=no',
    'restart-no-compose-override.yml',
    'up --no-start --force-recreate --pull never --no-build --no-deps',
    'contain_exact_named_rollback_containers', 'EXACT_NAMED_PAIR_RESTART_DISABLED_AND_STOPPED',
    'rollback_failure_trap', 'rollback-error-receipt.json',
    'if [[ "${ROLLBACK_TRANSACTION_ACTIVE:-false}" == "true" ]]',
    'rollback_failure_trap 1 EXPLICIT_FAILURE',
    'rollback-error-manifest.json', 'ROLLBACK_ERROR_RECEIPT_COMMITTED_MANIFEST_LAST',
    'partial_cohort_exact_members', 'ROLLBACK_ERROR_RECEIPT_EXACT_CLOSURE',
    'TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING',
    'rollback-terminal-success-manifest.json', 'transition_rollback_pointer_to_terminal_success',
    'rollback_terminal_pointer_is_authoritative', 'ROLLBACK_TERMINAL_CLEANUP_PENDING_HOLD',
    'ROLLBACK_TERMINAL_SUCCESS_MANIFEST_DIGEST', 'ROLLBACK_TERMINAL_SUCCESS_MANIFEST_BINDING',
    'ROLLBACK_TERMINAL_SUCCESS_MANIFEST_HELD_FD_CONTEXT_BINDING',
    'ROLLBACK_TERMINAL_BOUND_MEMBER_CHANGED',
    'ROLLBACK_TERMINAL_POINTER_TRANSITION_RECOVERED_OLD_ACTIVE_STAGE',
    'ROLLBACK_ACTIVE_POINTER_CHANGED_DURING_READ',
    'def scan_member(name, capture_limit=None)', 'ROLLBACK_TERMINAL_MEMBER_CHANGED_DURING_SCAN',
    'ROLLBACK_TERMINAL_CLEANUP_MANIFEST_DIGEST_HOLD',
    'ROLLBACK_TERMINAL_CLEANUP_EXCHANGED_STAGE_BINDING_HOLD',
    '.kidults-rollback-terminal-v1.{sys.argv[2]}.json',
    'ROLLBACK_TERMINAL_ARCHIVE_RENAME_NOREPLACE_REQUIRED',
    "trap '' ERR INT TERM",
    'ROLLBACK_TERMINAL_MANIFEST_INJECTED_FAILURE',
    'failed-state-metadata.json', 'database-restore-order.json',
    'configuration-restore-transaction-v1.jsonl', 'rename_exchange',
    'CONFIG_RESTORE_INJECTED_FAILURE', 'ABORTED_ROLLED_BACK', 'ABORT_RECOVERY_HOLD',
    '--receipt-dir-fd 4',
    'PINNED_SNAPSHOT_MANIFEST_CHANGED', 'PINNED_SNAPSHOT_MEMBER_CHANGED',
    'snapshot_manifest_sha256', 'failed-kaios.db', 'docker load --input', '--pull never',
    'gateway_image_identity', 'scheduler_image_identity', 'rollback-receipt.json', 'artfund_change_executed',
    'EXACT_NAME_ENUMERATION_FAILED', 'item.get("Name") != expected_name',
    'Recovered gateway image identity query failed',
  ],
  seal: [
    'production-readiness-evidence-v1.json', 'program-owner-production-release-receipt-v1.json',
    'CANONICAL_ARCHIVE_ROOT="/mnt/ih_prod_01/backups/production-certification"',
    'Production seal output redirection is forbidden', 'ENABLED_ISOLATED_SAFE_TEST_ONLY',
    'open_protected_directory_chain', 'create_snapshot_directory', '.snapshot.tmp',
    'support_bindings = technical.get("support_evidence_bindings")',
    'snapshot_identities[member] = snapshot_write', 'revalidate_snapshot_member',
    'snapshot_path = f"/proc/self/fd/{snapshot_fd}"',
    'policy_fd_path = f"/proc/self/fd/{policy_fd}"',
    'pass_fds=(snapshot_fd, policy_fd, owner_key_fd)',
    'SEAL_EXACT_SNAPSHOT_RELEASE_GATE_RESULT', 'PROGRAM_OWNER_SIGNATURE_VERIFIED_UNCONSUMED',
    'os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW', 'metadata.st_nlink == 1',
    'SEAL_OWNER_KEY_CHANGED_BEFORE_PUBLISH', 'SEAL_POLICY_CHANGED_BEFORE_PUBLISH',
    'SEAL_ARCHIVE_ROOT_CHANGED_BEFORE_PUBLISH', 'SEAL_ARCHIVE_ROOT_CHANGED_AFTER_FINAL_FSYNC',
    'rename_noreplace', 'RENAME_NOREPLACE cannot clobber',
    'AFTER_SNAPSHOT_FSYNC', 'AFTER_ARCHIVE_CHECKSUM_PUBLISH',
    'explicit_program_owner_release_verified', 'sealed_release_candidate',
    'protected_executor_consumption_verified', 'Protected executor consumption remains HOLD',
    'os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK',
  ],
  releaseGate: [
    "run.trigger === 'schedule'", 'run.run_attempt === 1',
    'NATURAL_WORKFLOW_RUN_ID_DUPLICATE', 'NATURAL_SCHEDULE_SLOT_DUPLICATE',
    'NATURAL_RUN_SPAN_TOO_SHORT', 'NATURAL_EXECUTION_SPAN_TOO_SHORT',
    "slo.error_budget_status === 'WITHIN_BUDGET'",
    "recovery.pitr_status === 'VERIFIED'", "recovery.rollback_status === 'VERIFIED'",
    'readiness.production_promotion_authorized === false', "receipt.authority === 'PROGRAM_OWNER'",
    "receipt.signature_algorithm === 'ED25519'", 'PROGRAM_OWNER_SIGNATURE_INVALID',
    'SEALED_ARCHIVE_NON_REGULAR_MEMBER',
    'readStableRegularFile', 'fs.constants.O_NONBLOCK', 'opened.isFile()',
  ],
  readinessFinalizer: [
    'def read_stable_regular_json(',
    'os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK',
    'LEGACY_AUDIT_EVIDENCE_IDENTITY_INVALID',
    'LEGACY_AUDIT_EVIDENCE_CHANGED_DURING_READ',
  ],
  validator: [
    'compileQuotedPythonHeredocs',
    'embedded Python heredoc syntax validation failed',
    'quoted_python_heredocs_compiled',
    'prestart_sqlite_sidecar_held_fd_cases',
    'rollback_post_arm_explicit_failure_cases',
  ],
};

function validateText(current) {
  const findings = [];
  for (const [name, markers] of Object.entries(requiredMarkers)) {
    for (const marker of markers) if (!current[name].includes(marker)) findings.push(`${name}:missing:${marker}`);
  }
  if (current.promotion.includes('BASE_URL="${BASE_URL:-')) findings.push('promotion:environment-overridable-production-origin');
  if (current.promotion.includes('PROGRAM_OWNER_RELEASE_PUBLIC_KEY_FILE="${PROGRAM_OWNER_RELEASE_PUBLIC_KEY_FILE:-')) findings.push('promotion:environment-overridable-owner-trust-anchor');
  if (current.promotion.includes('RELEASE_EXECUTOR_PUBLIC_KEY_FILE="${RELEASE_EXECUTOR_PUBLIC_KEY_FILE:-')) findings.push('promotion:environment-overridable-executor-trust-anchor');
  if (/DB_TMP=|cp "\$\{PREDEPLOYMENT_SNAPSHOT_DIR\}\/kaios\.db"|chown "\$\{DB_UID\}:\$\{DB_GID\}" "\$\{DB_TMP\}"|mv -f "\$\{DB_TMP\}" "\$\{PROD_DB\}"/.test(current.rollback)) findings.push('rollback:path-based-database-restore');
  if (current.rollback.includes('ROLLBACK_RECEIPT_ROOT="${ROLLBACK_RECEIPT_ROOT:-')) findings.push('rollback:environment-overridable-receipt-root');
  const backupCompletedIndex = current.sqliteHelper.indexOf('source.backup(target)');
  const capturedAtIndex = current.sqliteHelper.indexOf('captured_at = datetime.now', backupCompletedIndex);
  const integrityIndex = current.sqliteHelper.indexOf('PRAGMA integrity_check', backupCompletedIndex);
  if (!(backupCompletedIndex >= 0 && backupCompletedIndex < capturedAtIndex && capturedAtIndex < integrityIndex)) findings.push('snapshot:captured-at-not-immediate-after-backup');
  for (const forbidden of [
    'mkdir -p "${RECEIPT_DIR}"',
    'chmod 700 "${RECEIPT_DIR}"',
    'cp -p "${PROD_ROOT}/.env.production" "${RECEIPT_DIR}/',
    '> "${RECEIPT_DIR}/docker-load.txt"',
    '-o "${RECEIPT_DIR}/health.json"',
    'Path(sys.argv[1]).write_text',
    'sha256sum "${RECEIPT_DIR}/rollback-receipt.json"',
  ]) if (current.rollback.includes(forbidden)) findings.push(`rollback:path-based-receipt-writer:${forbidden}`);
  if (/(?:>|>>)\s*"\$\{RECEIPT_DIR\}\//.test(current.rollback) || /\bcp\b[^\n]*\$\{RECEIPT_DIR\}\//.test(current.rollback) || /\bcurl\b[^\n]*(?:-o|--output)[^\n]*\$\{RECEIPT_DIR\}\//.test(current.rollback)) findings.push('rollback:path-based-receipt-writer:generic');
  if (/\bcp\s+-p\s+"\$\{PREDEPLOYMENT_SNAPSHOT_DIR\}\/env\.production\.snapshot"/.test(current.rollback)) findings.push('rollback:path-based-configuration-restore');
  if (current.rollback.includes('RECEIPT_DIR="${ROLLBACK_RECEIPT_ROOT}/kidults-rollback-${TIMESTAMP}"')) findings.push('rollback:predictable-receipt-directory');
  if (/docker stop[\s\S]{0,200}\|\| true/.test(current.rollback)) findings.push('rollback:container-stop-failure-ignored');
  const rollbackCommonPreflight = current.rollback.indexOf('if [[ "${EXECUTE}" == "true" || "${PREPARE_ONLY}" == "true" ]]; then');
  const rollbackHelperPreflight = current.rollback.indexOf('verify_sqlite_restore_helper_fd || fail "SQLite rollback restore helper is not the protected signed-source program"');
  const rollbackExecuteOnly = current.rollback.indexOf('if [[ "${EXECUTE}" == "true" ]]; then', rollbackCommonPreflight + 1);
  if (
    rollbackCommonPreflight < 0
    || rollbackHelperPreflight <= rollbackCommonPreflight
    || rollbackExecuteOnly <= rollbackHelperPreflight
  ) findings.push('rollback:restore-helper-not-proven-before-prepare');
  const stopIndex = current.rollback.indexOf('docker stop --time 30');
  const stoppedIndex = current.rollback.indexOf('container-quiescence-after-stop.json');
  const beforeRestoreIndex = current.rollback.indexOf('container-quiescence-before-restore.json');
  const restoreIndex = current.rollback.indexOf('python3 -I "${SQLITE_RESTORE_HELPER_STABLE}"');
  const afterRestoreIndex = current.rollback.indexOf('container-quiescence-after-restore.json');
  const beforeStartupIndex = current.rollback.indexOf('container-quiescence-before-startup.json');
  const sidecarStartupIndex = current.rollback.lastIndexOf('verify_sqlite_sidecar_namespace_absent_fd');
  const startupIndex = current.rollback.indexOf('docker start "${CURRENT_GATEWAY_CONTAINER_ID}" "${CURRENT_SCHEDULER_CONTAINER_ID}"');
  if (!(stopIndex >= 0 && stopIndex < stoppedIndex && stoppedIndex < beforeRestoreIndex && beforeRestoreIndex < restoreIndex && restoreIndex < afterRestoreIndex && afterRestoreIndex < beforeStartupIndex && beforeStartupIndex < sidecarStartupIndex && sidecarStartupIndex < startupIndex)) {
    findings.push('rollback:container-quiescence-order-invalid');
  }
  const sidecarPreParentIndex = current.rollback.lastIndexOf('Production database parent changed before recovery startup', sidecarStartupIndex);
  const sidecarPostParentIndex = current.rollback.indexOf('Production database parent changed during pre-start sidecar revalidation', sidecarStartupIndex);
  if (!(sidecarPreParentIndex >= 0 && sidecarPreParentIndex < sidecarStartupIndex && sidecarStartupIndex < sidecarPostParentIndex && sidecarPostParentIndex < startupIndex)) findings.push('rollback:prestart-sidecar-held-path-sandwich-invalid');
  const forensicOpenIndex = current.rollback.indexOf('python3 -I - 7 4 "$(basename "${PROD_DB}")"');
  const forensicAdjacentQuiescenceIndex = current.rollback.lastIndexOf('Production rollback containers restarted immediately before forensic capture', forensicOpenIndex);
  const helperRestoreIndex = current.rollback.indexOf('python3 -I "${SQLITE_RESTORE_HELPER_STABLE}"');
  const restoreAdjacentQuiescenceIndex = current.rollback.lastIndexOf('Production rollback containers restarted immediately before atomic restore', helperRestoreIndex);
  if (!(forensicAdjacentQuiescenceIndex >= 0 && forensicAdjacentQuiescenceIndex < forensicOpenIndex && restoreAdjacentQuiescenceIndex > forensicOpenIndex && restoreAdjacentQuiescenceIndex < helperRestoreIndex)) findings.push('rollback:forensic-or-restore-quiescence-not-adjacent');
  const errorReceiptPublishIndex = current.rollback.indexOf('rename_noreplace(stages["rollback-error-receipt.json"], "rollback-error-receipt.json")');
  const errorChecksumPublishIndex = current.rollback.indexOf('rename_noreplace(stages["rollback-error-receipt.json.sha256"], "rollback-error-receipt.json.sha256")');
  const errorManifestPublishIndex = current.rollback.indexOf('rename_noreplace(stages["rollback-error-manifest.json"], "rollback-error-manifest.json")');
  if (!(errorReceiptPublishIndex >= 0 && errorReceiptPublishIndex < errorChecksumPublishIndex && errorChecksumPublishIndex < errorManifestPublishIndex)) findings.push('rollback:error-receipt-manifest-not-published-last');
  const recoveryVerifiedIndex = current.rollback.indexOf('ROLLBACK_PHASE="RECOVERY_VERIFIED"');
  const terminalManifestIndex = current.rollback.indexOf('rollback-terminal-success-manifest.json', recoveryVerifiedIndex);
  const terminalPointerTransitionIndex = current.rollback.indexOf('transition_rollback_pointer_to_terminal_success', terminalManifestIndex);
  const priorPolicyRestoreIndex = current.rollback.indexOf('docker update --restart="${GATEWAY_RESTART_POLICY}"', recoveryVerifiedIndex);
  if (!(recoveryVerifiedIndex >= 0 && recoveryVerifiedIndex < terminalManifestIndex && terminalManifestIndex < terminalPointerTransitionIndex && terminalPointerTransitionIndex < priorPolicyRestoreIndex)) findings.push('rollback:restart-policy-restored-before-terminal-authority');
  const terminalAuthorityBeforeGateway = current.rollback.lastIndexOf('rollback_terminal_pointer_is_authoritative', priorPolicyRestoreIndex);
  const schedulerPolicyRestoreIndex = current.rollback.indexOf('docker update --restart="${SCHEDULER_RESTART_POLICY}"', priorPolicyRestoreIndex);
  const terminalAuthorityBeforeScheduler = current.rollback.lastIndexOf('rollback_terminal_pointer_is_authoritative', schedulerPolicyRestoreIndex);
  if (!(terminalAuthorityBeforeGateway > terminalPointerTransitionIndex && terminalAuthorityBeforeGateway < priorPolicyRestoreIndex && terminalAuthorityBeforeScheduler > priorPolicyRestoreIndex && terminalAuthorityBeforeScheduler < schedulerPolicyRestoreIndex)) findings.push('rollback:terminal-held-fd-authority-not-adjacent-to-each-policy-restore');
  const rollbackFailFunction = current.rollback.slice(current.rollback.indexOf('fail() {'), current.rollback.indexOf('\n}\n\n[[ "${EXECUTE}"'));
  if (!rollbackFailFunction.includes('if [[ "${ROLLBACK_TRANSACTION_ACTIVE:-false}" == "true" ]]') || !rollbackFailFunction.includes('rollback_failure_trap 1 EXPLICIT_FAILURE')) findings.push('rollback:post-arm-explicit-failure-bypasses-containment');
  const terminalDisarmIndex = current.rollback.lastIndexOf('ROLLBACK_TRANSACTION_ACTIVE=false');
  const activePointerClearIndex = current.rollback.lastIndexOf('renameat2(root_fd, os.fsencode(name), root_fd, os.fsencode(archive_name), 1)');
  if (!(activePointerClearIndex >= 0 && activePointerClearIndex < terminalDisarmIndex)) findings.push('rollback:transaction-disarmed-before-active-pointer-cleared');
  const archivePhaseIndex = current.rollback.lastIndexOf('ROLLBACK_PHASE="SEALED"', activePointerClearIndex);
  const archiveTrapMaskIndex = current.rollback.indexOf("trap '' ERR INT TERM", archivePhaseIndex);
  const archiveTrapResetIndex = current.rollback.indexOf('trap - ERR INT TERM', terminalDisarmIndex);
  const archiveWindow = current.rollback.slice(archivePhaseIndex, terminalDisarmIndex);
  if (!(archivePhaseIndex >= 0 && archivePhaseIndex < archiveTrapMaskIndex && archiveTrapMaskIndex < activePointerClearIndex && activePointerClearIndex < terminalDisarmIndex && terminalDisarmIndex < archiveTrapResetIndex) || archiveWindow.includes('trap - ERR')) findings.push('rollback:terminal-pointer-archive-has-signal-window');
  const terminalPublisherStart = current.rollback.indexOf('ROLLBACK_TERMINAL_SUCCESS_MANIFEST_SHA256="$(');
  const terminalPublisherEnd = current.rollback.indexOf('transition_rollback_pointer_to_terminal_success', terminalPublisherStart);
  const terminalPublisher = current.rollback.slice(terminalPublisherStart, terminalPublisherEnd);
  if (terminalPublisher.includes('1024 * 1024 * 1024') || terminalPublisher.includes('body += block')) findings.push('rollback:terminal-manifest-publisher-buffers-large-receipt-member');
  if (!terminalPublisher.includes('os.O_NONBLOCK') || !terminalPublisher.includes('ROLLBACK_TERMINAL_MANIFEST_INJECTED_FAILURE') || !current.rollback.slice(terminalPublisherEnd - 80, terminalPublisherEnd).includes('|| fail')) findings.push('rollback:terminal-manifest-failure-does-not-route-to-containment');
  const successWriteIndex = current.promotion.lastIndexOf('write_local_terminal_result "PROMOTION_SUCCEEDED"');
  const variableDisarmIndex = current.promotion.indexOf('ROLLBACK_ARMED=false', successWriteIndex);
  const trapAuthorityIndex = current.promotion.indexOf('if terminal_promotion_success_is_authoritative; then');
  const armedRollbackIndex = current.promotion.indexOf('if [[ "${ROLLBACK_ARMED}" == "true" ]]', trapAuthorityIndex);
  if (!(successWriteIndex >= 0 && successWriteIndex < variableDisarmIndex && trapAuthorityIndex >= 0 && trapAuthorityIndex < armedRollbackIndex)) findings.push('promotion:terminal-success-authority-order-invalid');
  const failFunction = current.promotion.slice(current.promotion.indexOf('fail() {'), current.promotion.indexOf('\n}\n\ncleanup_smoke_files()'));
  if (!failFunction.includes('if [[ "${ROLLBACK_ARMED}" == "true" ]]') || !failFunction.includes('rollback_and_exit "EXPLICIT_FAILURE" 1')) findings.push('promotion:post-arm-explicit-failure-bypasses-rollback');
  const rollbackHandlerStart = current.promotion.indexOf('rollback_and_exit() {');
  const rollbackHandlerEnd = current.promotion.indexOf('\n}\n\non_error()', rollbackHandlerStart);
  const rollbackHandler = current.promotion.slice(rollbackHandlerStart, rollbackHandlerEnd);
  const nestedSignalMaskIndex = rollbackHandler.indexOf("trap '' ERR INT TERM");
  const firstCleanupIndex = rollbackHandler.indexOf('if ! cleanup_smoke_files; then');
  const boundRollbackIndex = rollbackHandler.indexOf('KAIOS_EXECUTE_PRODUCTION_ROLLBACK=true');
  const terminalFailureIndex = rollbackHandler.indexOf('write_local_terminal_result "AUTOMATIC_ROLLBACK_FAILED"');
  const terminalSuccessIndex = rollbackHandler.indexOf('write_local_terminal_result "AUTOMATIC_ROLLBACK_SUCCEEDED"');
  if (
    rollbackHandlerStart < 0
    || rollbackHandlerEnd < 0
    || nestedSignalMaskIndex < 0
    || nestedSignalMaskIndex > rollbackHandler.indexOf('local trigger="$1"')
    || nestedSignalMaskIndex > firstCleanupIndex
    || firstCleanupIndex > boundRollbackIndex
    || boundRollbackIndex > terminalFailureIndex
    || terminalFailureIndex > terminalSuccessIndex
    || rollbackHandler.includes('trap - ERR INT TERM')
  ) findings.push('promotion:nested-signal-default-window-before-bound-rollback-or-terminal-outcome');
  const authorityStart = current.promotion.indexOf('terminal_promotion_success_is_authoritative()');
  const authorityEnd = current.promotion.indexOf('\n}\n\nrollback_and_exit()', authorityStart);
  const authority = current.promotion.slice(authorityStart, authorityEnd);
  const authorityFsyncIndex = authority.indexOf('os.fsync(parent_fd)');
  const authorityOpenIndex = authority.indexOf('descriptor = os.open(\n        "terminal-result.json"');
  if (!(authorityFsyncIndex >= 0 && authorityFsyncIndex < authorityOpenIndex)) findings.push('promotion:terminal-authority-does-not-fsync-parent-before-acceptance');
  for (const exactBinding of [
    'set(payload) == expected_keys',
    'payload.get("consumption_id") == sys.argv[2]',
    'payload.get("source_sha") == sys.argv[3]',
    'payload.get("predeployment_snapshot_manifest_sha256") == sys.argv[4]',
    'payload.get("target_gateway_image_id") == sys.argv[5]',
    'payload.get("target_scheduler_image_id") == sys.argv[6]',
    'payload.get("deployed_gateway_container_id") == sys.argv[7]',
    'payload.get("deployed_scheduler_container_id") == sys.argv[8]',
    'payload.get("deployment_manifest_sha256") == sys.argv[9]',
  ]) if (!authority.includes(exactBinding)) findings.push(`promotion:terminal-authority-missing-exact-binding:${exactBinding}`);
  const sidecarReceiptDurableIndex = current.sqliteRestoreHelper.indexOf('"SIDECAR_RECEIPTS_DURABLE"');
  const sidecarQuarantineIndex = current.sqliteRestoreHelper.indexOf('transaction = prepare_sidecar_transaction(');
  const databasePublishIndex = current.sqliteRestoreHelper.indexOf('os.replace(');
  const postPublishSidecarAbsenceIndex = current.sqliteRestoreHelper.indexOf('require_sidecars_absent(args.destination_dir_fd, args.destination_name)', databasePublishIndex);
  if (!(sidecarReceiptDurableIndex >= 0 && sidecarReceiptDurableIndex < sidecarQuarantineIndex && sidecarQuarantineIndex < databasePublishIndex && databasePublishIndex < postPublishSidecarAbsenceIndex)) {
    findings.push('sqliteRestoreHelper:sidecar-quarantine-order-invalid');
  }
  const forensicIndex = current.rollback.indexOf('KIDULTS_FAILED_DATABASE_FORENSIC_CAPTURE_V1');
  if (!(stopIndex >= 0 && stopIndex < stoppedIndex && stoppedIndex < beforeRestoreIndex && beforeRestoreIndex < forensicIndex && forensicIndex < restoreIndex)) {
    findings.push('rollback:forensic-quiescence-order-invalid');
  }
  if (contract.safety?.automatic_rollback_on_smoke_failure !== true) findings.push('contract:auto-rollback-not-true');
  if (contract.safety?.default_action !== 'dry-run') findings.push('contract:default-action-not-dry-run');
  if (contract.safety?.artfund_changes_forbidden !== true) findings.push('contract:artfund-isolation-not-required');
  if (contract.safety?.runtime_source_sha_must_match_signed_source_sha !== true) findings.push('contract:runtime-source-not-bound');
  if (contract.safety?.tracked_runtime_changes_forbidden !== true) findings.push('contract:runtime-dirty-state-allowed');
  if (contract.technical_readiness?.production_promotion_authorized !== false) findings.push('contract:technical-readiness-self-authorizes');
  if (contract.release_authority?.self_authorization_forbidden !== true) findings.push('contract:self-authorization-not-forbidden');
  if (contract.release_authority?.signature_algorithm !== 'ED25519') findings.push('contract:owner-signature-not-ed25519');
  if (contract.safety?.rollback_input_toctou?.durable_digest_named_pin_published_before_first_mutation !== true) findings.push('contract:durable-pre-mutation-pin-not-required');
  if (contract.safety?.rollback_input_toctou?.actual_rollback_must_use_prepared_pin_without_rereading_original !== true) findings.push('contract:actual-rollback-may-reread-original');
  if (contract.safety?.predeployment_snapshot?.captured_at_meaning !== 'SQLITE_ONLINE_BACKUP_COMPLETED_AT') findings.push('contract:snapshot-recovery-time-ambiguous');
  if (contract.safety?.predeployment_snapshot?.captured_at_sampled_immediately_after_sqlite_backup_returns_before_validation_or_durability_work !== true) findings.push('contract:snapshot-recovery-time-not-immediate');
  if (contract.safety?.predeployment_snapshot?.database_metadata_receipt_written_from_held_source_fd !== true) findings.push('contract:database-metadata-not-held-fd-bound');
  if (contract.safety?.predeployment_snapshot?.sqlite_main_connection_inode_and_stable_parent_namespace_bound !== true) findings.push('contract:sqlite-parent-namespace-not-bound');
  if (contract.safety?.predeployment_snapshot?.hostile_database_owner_sidecar_integrity_authority !== 'OUT_OF_SCOPE_SAME_PRINCIPAL_CAN_MUTATE_DATABASE_CONTENT') findings.push('contract:sqlite-sidecar-authority-overclaimed');
  if (contract.safety?.rollback_input_toctou?.rollback_pin_full_ancestor_chain_root_owned_non_writable_required !== true) findings.push('contract:rollback-pin-ancestry-not-required');
  if (contract.safety?.rollback_input_toctou?.rollback_pin_root_and_digest_directory_stable_fd_identity_required !== true) findings.push('contract:rollback-pin-stable-identity-not-required');
  if (contract.safety?.rollback_input_toctou?.local_consumption_receipt_binds_pin_root_and_digest_directory_identity !== true) findings.push('contract:rollback-pin-identity-not-receipt-bound');
  if (contract.safety?.rollback_database_restore?.held_source_and_destination_directory_fds_required !== true) findings.push('contract:database-restore-held-fds-not-required');
  if (contract.safety?.rollback_database_restore?.destination_parent_full_ancestor_chain_and_stable_identity_required !== true) findings.push('contract:database-restore-parent-identity-not-required');
  if (contract.safety?.rollback_database_restore?.source_and_destination_nofollow_regular_entry_required !== true) findings.push('contract:database-restore-nofollow-not-required');
  if (contract.safety?.rollback_database_restore?.random_exclusive_nofollow_temp_and_atomic_rename_required !== true) findings.push('contract:database-restore-atomic-temp-not-required');
  if (contract.safety?.rollback_database_restore?.stream_copy_digest_fchown_fchmod_fsync_required !== true) findings.push('contract:database-restore-copy-metadata-fsync-not-required');
  if (contract.safety?.rollback_database_restore?.destination_precondition_and_published_inode_revalidation_required !== true) findings.push('contract:database-restore-inode-revalidation-not-required');
  if (contract.safety?.rollback_database_restore?.restore_helper_signed_source_blob_and_protected_metadata_required_before_prepare !== true) findings.push('contract:database-restore-helper-not-preflighted');
  if (contract.safety?.rollback_database_restore?.destination_symlink_or_nonregular_entry_is !== 'HOLD') findings.push('contract:database-restore-unsafe-destination-not-hold');
  if (contract.safety?.rollback_database_restore?.predictable_path_restore_forbidden !== true) findings.push('contract:predictable-database-restore-not-forbidden');
  if (JSON.stringify(contract.safety?.rollback_database_restore?.exact_runtime_containers_bound_by_immutable_id_before_stop) !== JSON.stringify(['kidults-gateway', 'kidults-scheduler'])) findings.push('contract:rollback-container-set-not-exact');
  if (contract.safety?.rollback_database_restore?.container_stop_error_is !== 'HOLD') findings.push('contract:rollback-container-stop-not-hold');
  if (contract.safety?.rollback_database_restore?.container_id_name_binding_and_quiescence_revalidated_before_and_after_restore !== true) findings.push('contract:rollback-container-quiescence-not-revalidated');
  if (contract.safety?.rollback_database_restore?.forensic_open_and_restore_invocation_each_immediately_preceded_by_fresh_quiescence_proof !== true) findings.push('contract:forensic-restore-adjacent-quiescence-not-required');
  if (JSON.stringify(contract.safety?.rollback_database_restore?.sqlite_sidecars_exact_set) !== JSON.stringify(['kaios.db-wal', 'kaios.db-shm', 'kaios.db-journal'])) findings.push('contract:rollback-sidecar-set-not-exact');
  if (contract.safety?.rollback_database_restore?.unknown_sqlite_sidecar_namespace_is !== 'HOLD') findings.push('contract:unknown-sqlite-sidecar-not-hold');
  if (contract.safety?.rollback_database_restore?.sidecars_durably_quarantined_to_exclusive_receipt_before_main_database_publish !== true) findings.push('contract:sidecars-not-durably-quarantined');
  if (contract.safety?.rollback_database_restore?.all_sidecar_data_and_checksum_files_and_receipt_directory_fsynced_before_first_live_namespace_mutation !== true) findings.push('contract:sidecars-mutated-before-full-receipt-durability');
  if (contract.safety?.rollback_database_restore?.sidecars_moved_by_same_directory_no_replace_rename_not_unlinked_before_main_publish !== true) findings.push('contract:sidecars-not-reversibly-quarantined');
  if (contract.safety?.rollback_database_restore?.mirrored_destination_and_receipt_phase_journals_required !== true) findings.push('contract:sqlite-transaction-journal-not-mirrored');
  if (contract.safety?.rollback_database_restore?.preexisting_nonterminal_sqlite_transaction_journal_is !== 'HOLD') findings.push('contract:sqlite-preexisting-journal-not-hold');
  if (contract.safety?.rollback_database_restore?.prepublish_failure_restores_exact_quarantined_inodes_and_fsyncs_directory !== true) findings.push('contract:sqlite-prepublish-recovery-not-required');
  if (contract.safety?.rollback_database_restore?.postpublish_failure_forbids_restoring_stale_sidecars_and_requires_hold_journal !== true) findings.push('contract:sqlite-postpublish-failure-not-hold');
  if (contract.safety?.rollback_database_restore?.failed_main_forensic_capture_occurs_after_exact_container_quiescence_immediately_before_restore !== true) findings.push('contract:forensic-capture-order-not-required');
  if (contract.safety?.rollback_database_restore?.configuration_pair_staged_fsynced_and_rename_exchange_transaction_required !== true) findings.push('contract:configuration-transaction-not-required');
  if (contract.safety?.rollback_database_restore?.configuration_partial_publish_and_reverse_failure_fault_regressions_required !== true) findings.push('contract:configuration-fault-regressions-not-required');
  if (contract.safety?.rollback_database_restore?.outer_active_transaction_pointer_create_if_absent_before_mutation_required !== true) findings.push('contract:outer-rollback-journal-not-required');
  if (contract.safety?.rollback_database_restore?.err_int_term_terminal_error_receipt_and_stopped_containment_required !== true) findings.push('contract:rollback-error-receipt-not-required');
  if (contract.safety?.rollback_database_restore?.restart_no_verified_before_container_stop_and_while_transaction_nonterminal !== true) findings.push('contract:restart-containment-not-required');
  if (contract.safety?.rollback_database_restore?.recreated_containers_are_created_stopped_and_pinned_restart_no_before_start !== true) findings.push('contract:recreated-container-restart-gap');
  if (contract.safety?.rollback_database_restore?.sidecar_namespace_absence_revalidated_before_publish_and_restart !== true) findings.push('contract:sidecar-absence-not-revalidated');
  if (contract.safety?.rollback_database_restore?.prestart_sidecar_absence_held_fd_scan_sandwiched_by_canonical_parent_identity_revalidation !== true) findings.push('contract:prestart-sidecar-held-path-sandwich-not-required');
  if (contract.safety?.rollback_database_restore?.failure_containment_resolves_exact_named_replacement_container_ids !== true) findings.push('contract:replacement-container-containment-not-required');
  if (contract.safety?.rollback_database_restore?.docker_query_error_is !== 'CONTAINMENT_UNVERIFIED_HOLD_NEVER_ABSENT') findings.push('contract:docker-query-error-may-be-absence');
  if (contract.safety?.rollback_database_restore?.exact_name_enumeration_and_inspect_leading_slash_name_binding_required !== true) findings.push('contract:docker-exact-leading-slash-binding-not-required');
  if (contract.safety?.rollback_database_restore?.prior_restart_policies_restored_only_after_manifest_last_terminal_success_and_pointer_transition !== true) findings.push('contract:restart-policy-terminal-boundary-not-required');
  if (contract.safety?.rollback_database_restore?.terminal_manifest_and_bound_receipt_checksum_streamed_via_stable_nonblocking_held_fds_before_each_restart_policy_restore !== true) findings.push('contract:terminal-held-fd-receipt-binding-not-required');
  if (contract.safety?.rollback_database_restore?.terminal_large_receipt_member_validation_is_streaming !== true) findings.push('contract:terminal-large-member-streaming-not-required');
  if (contract.safety?.rollback_database_restore?.terminal_manifest_prepublish_failure_routes_to_manifest_last_error_receipt !== true) findings.push('contract:terminal-prepublish-error-receipt-not-required');
  if (contract.safety?.rollback_database_restore?.terminal_cleanup_pending_pointer_reentry_is !== 'HOLD_WITH_DETERMINISTIC_OPERATOR_RESUME') findings.push('contract:terminal-cleanup-reentry-not-defined');
  if (contract.safety?.rollback_database_restore?.terminal_pointer_exchange_stale_old_active_stage_exact_binding_auto_reconciled_and_root_fsynced !== true) findings.push('contract:terminal-exchange-stage-recovery-not-required');
  if (contract.safety?.rollback_database_restore?.terminal_pointer_archive_err_int_term_ignored_before_namespace_mutation_through_transaction_disarm !== true) findings.push('contract:terminal-archive-signal-mask-not-required');
  if (contract.safety?.rollback_database_restore?.error_receipt_checksum_and_exact_partial_cohort_digest_manifest_published_last_by_rename_noreplace !== true) findings.push('contract:error-manifest-transaction-not-required');
  if (contract.safety?.rollback_receipt_persistence?.canonical_non_overridable_root !== '/mnt/ih_prod_01/backups/production-certification/rollback-receipts') findings.push('contract:rollback-receipt-root-not-canonical');
  if (contract.safety?.rollback_receipt_persistence?.full_ancestor_chain_root_owned_non_writable_required !== true) findings.push('contract:rollback-receipt-ancestry-not-required');
  if (contract.safety?.rollback_receipt_persistence?.root_and_receipt_directory_stable_fd_identity_required !== true) findings.push('contract:rollback-receipt-stable-fds-not-required');
  if (contract.safety?.rollback_receipt_persistence?.random_fixed_length_exclusive_mkdirat_required !== true) findings.push('contract:rollback-receipt-exclusive-dir-not-required');
  if (contract.safety?.rollback_receipt_persistence?.every_member_fd_relative_exclusive_nofollow_regular_write_required !== true) findings.push('contract:rollback-receipt-exclusive-members-not-required');
  if (contract.safety?.rollback_receipt_persistence?.member_directory_and_root_fsync_required !== true) findings.push('contract:rollback-receipt-fsync-not-required');
  if (contract.safety?.rollback_receipt_persistence?.path_based_copy_redirection_curl_output_or_write_text_forbidden !== true) findings.push('contract:rollback-receipt-path-writers-not-forbidden');
  if (contract.safety?.rollback_receipt_persistence?.success_exact_member_closure_and_checksum_pair_validation_required !== true) findings.push('contract:rollback-receipt-closure-not-required');
  if (contract.safety?.rollback_receipt_persistence?.mutable_namespace_reads_use_nonblocking_nofollow_regular_file_gates !== true) findings.push('contract:rollback-nonblocking-regular-read-gates-not-required');
  if (contract.safety?.readiness_output_persistence?.rerun_may_atomically_replace_only_verified_single_link_regular_mode_0600_output !== true) findings.push('contract:readiness-rerun-persistence');
  if (contract.safety?.readiness_output_persistence?.legacy_input_members_read_through_nonblocking_stable_regular_held_fds !== true) findings.push('contract:readiness-input-held-fd-gate-not-required');
  if (contract.safety?.readiness_output_persistence?.release_gate_mutable_inputs_read_through_nonblocking_stable_regular_fds !== true) findings.push('contract:release-gate-nonblocking-regular-read-gates-not-required');
  if (contract.safety?.promotion_terminal_state?.promotion_success_marker_is_the_only_authoritative_disarm_state !== true) findings.push('contract:promotion-success-not-authoritative');
  if (contract.safety?.promotion_terminal_state?.post_arm_explicit_failure_routes_through_rollback_handler !== true) findings.push('contract:post-arm-explicit-failure-may-bypass-rollback');
  if (contract.safety?.promotion_terminal_state?.authority_fsyncs_held_parent_before_accepting_visible_success_marker !== true) findings.push('contract:terminal-authority-parent-fsync-not-required');
  if (contract.safety?.promotion_terminal_state?.signal_failpoints_before_rename_after_rename_and_after_parent_fsync_required !== true) findings.push('contract:terminal-signal-failpoints-not-required');
  if (contract.safety?.promotion_terminal_state?.nested_err_int_term_ignored_from_handler_entry_through_bound_rollback_and_terminal_outcome !== true) findings.push('contract:nested-signal-containment-not-required');
  if (contract.sealed_archive?.persistence?.canonical_non_overridable_root !== '/mnt/ih_prod_01/backups/production-certification') findings.push('contract:seal-root-not-canonical');
  if (contract.sealed_archive?.persistence?.archive_root_path_to_held_fd_identity_revalidated_before_each_publish_and_after_final_fsync !== true) findings.push('contract:seal-root-path-fd-revalidation-not-required');
  if (contract.sealed_archive?.persistence?.evidence_directory_path_to_held_fd_identity_required !== true) findings.push('contract:seal-evidence-root-binding-not-required');
  if (contract.sealed_archive?.persistence?.support_member_set_derived_only_from_captured_technical_bytes !== true) findings.push('contract:seal-support-set-not-derived-from-captured-technical');
  if (contract.sealed_archive?.persistence?.release_gate_runs_against_exact_immutable_snapshot_bytes_archived !== true) findings.push('contract:seal-gate-archive-byte-identity-not-required');
  if (contract.sealed_archive?.persistence?.canonical_policy_held_fd_digest_and_path_identity_revalidated_around_gate_and_publish !== true) findings.push('contract:seal-policy-binding-not-required');
  if (contract.sealed_archive?.persistence?.program_owner_key_and_key_id_held_nofollow_fd_required !== true) findings.push('contract:seal-owner-trust-fd-not-required');
  if (contract.sealed_archive?.persistence?.stage_and_final_members_are_regular_current_uid_gid_mode_0600_nlink_one !== true) findings.push('contract:seal-output-metadata-not-required');
  if (contract.sealed_archive?.persistence?.manifest_is_last_atomic_rename_noreplace_commit_marker !== true) findings.push('contract:seal-manifest-not-commit-marker');
  if (contract.sealed_archive?.persistence?.safe_test_mode_token !== 'ENABLED_ISOLATED_SAFE_TEST_ONLY') findings.push('contract:seal-test-mode-token-not-isolated');
  if (contract.sealed_archive?.persistence?.safe_test_mode_requires_unique_private_current_uid_mode_0700_anchor !== true) findings.push('contract:seal-test-anchor-not-private');
  if (contract.sealed_archive?.persistence?.safe_test_mode_has_production_authority !== false) findings.push('contract:seal-test-mode-has-production-authority');
  if (contract.sealed_archive?.persistence?.test_failpoints_and_source_mutation_hooks_available_in_production !== false) findings.push('contract:seal-test-hooks-available-in-production');
  if (contract.sealed_archive?.persistence?.stale_random_snapshot_stage_from_interrupted_attempt_is !== 'HOLD') findings.push('contract:seal-stale-snapshot-not-hold');
  if (contract.evidence_producer?.production_authority !== 'HARD_DISABLED') findings.push('contract:missing-producer-not-hard-disabled');
  return findings;
}

const baselineFindings = validateText(sources);
if (baselineFindings.length) throw new Error(`Production rollback contract invalid: ${baselineFindings.join('; ')}`);

for (const script of [snapshotPath, promotionPath, rollbackPath, sealPath]) {
  const result = spawnSync('bash', ['-n', script], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`shell syntax validation failed for ${script}: ${result.stderr}`);
}

function compileQuotedPythonHeredocs(source, label) {
  const lines = source.split('\n');
  let compiled = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const declaration = lines[index];
    const match = declaration.match(/<<'([A-Z][A-Z0-9_]*)'/);
    if (!match) continue;
    let commandStart = index;
    while (commandStart > 0 && lines[commandStart - 1].trimEnd().endsWith('\\')) commandStart -= 1;
    const logicalDeclaration = lines.slice(commandStart, index + 1).join(' ');
    if (!/\bpython3\b/.test(logicalDeclaration)) continue;
    const delimiter = match[1];
    let bodyStart = index + 1;
    let commandLine = declaration;
    while (commandLine.trimEnd().endsWith('\\')) {
      if (bodyStart >= lines.length) throw new Error(`unterminated Python heredoc command continuation: ${label}:${index + 1}`);
      commandLine = lines[bodyStart];
      bodyStart += 1;
    }
    let bodyEnd = bodyStart;
    while (bodyEnd < lines.length && lines[bodyEnd] !== delimiter) bodyEnd += 1;
    if (bodyEnd >= lines.length) throw new Error(`unterminated quoted Python heredoc: ${label}:${index + 1}:${delimiter}`);
    const code = lines.slice(bodyStart, bodyEnd).join('\n') + '\n';
    const result = spawnSync(
      'python3',
      ['-I', '-c', 'import sys; compile(sys.stdin.read(), sys.argv[1], "exec")', `${label}:heredoc:${index + 1}`],
      { encoding: 'utf8', input: code },
    );
    if (result.status !== 0) {
      throw new Error(`embedded Python heredoc syntax validation failed: ${label}:${index + 1}\n${result.stderr}`);
    }
    compiled += 1;
    index = bodyEnd;
  }
  return compiled;
}

let quotedPythonHeredocsCompiled = 0;
for (const [label, source] of Object.entries({
  snapshot: sources.snapshot,
  promotion: sources.promotion,
  rollback: sources.rollback,
  seal: sources.seal,
})) quotedPythonHeredocsCompiled += compileQuotedPythonHeredocs(source, label);
if (quotedPythonHeredocsCompiled === 0) throw new Error('quoted Python heredoc compile coverage is empty');
let embeddedPythonHeredocBoundaryNegativeCases = 0;
const nestedHeredocBoundaryMutation = sources.rollback.replace(
  'receipt_fd = int(sys.argv[3])',
  'accidentally_nested_shell_function() {\n  python3 -I - <<\'PY\'\npass\nPY\n}\nreceipt_fd = int(sys.argv[3])',
);
try {
  compileQuotedPythonHeredocs(nestedHeredocBoundaryMutation, 'rollback-nested-heredoc-mutation');
} catch (error) {
  embeddedPythonHeredocBoundaryNegativeCases += 1;
}
if (embeddedPythonHeredocBoundaryNegativeCases !== 1) {
  throw new Error('embedded Python heredoc boundary regression was not rejected');
}
const helperSyntax = spawnSync('python3', ['-I', '-c', 'import pathlib,sys; p=pathlib.Path(sys.argv[1]); compile(p.read_text(encoding="utf-8"), str(p), "exec")', sqliteSnapshotHelperPath], { encoding: 'utf8' });
if (helperSyntax.status !== 0) throw new Error(`SQLite snapshot helper syntax validation failed: ${helperSyntax.stderr}`);
const restoreHelperSyntax = spawnSync('python3', ['-I', '-c', 'import pathlib,sys; p=pathlib.Path(sys.argv[1]); compile(p.read_text(encoding="utf-8"), str(p), "exec")', sqliteRestoreHelperPath], { encoding: 'utf8' });
if (restoreHelperSyntax.status !== 0) throw new Error(`SQLite restore helper syntax validation failed: ${restoreHelperSyntax.stderr}`);

let terminalPublicationNegativeCases = 0;
let terminalAuthorityNegativeCases = 0;
let terminalSignalInjectionCases = 0;
let terminalFailurePublicationCases = 0;
let postArmExplicitFailureCases = 0;
let rollbackPostArmExplicitFailureCases = 0;
let promotionNestedSignalContainmentCases = 0;
const terminalWriterInvocation = sources.promotion.indexOf('  python3 -I - "${CONSUMPTION_MARKER_DIR}" "${result}" "${trigger}"');
const terminalWriterHeredoc = sources.promotion.indexOf("<<'PY'\n", terminalWriterInvocation);
const terminalWriterStart = terminalWriterHeredoc + "<<'PY'\n".length;
const terminalWriterEndMarker = '\nPY\n}\n\nterminal_promotion_success_is_authoritative()';
const terminalWriterEnd = sources.promotion.indexOf(terminalWriterEndMarker, terminalWriterStart);
if (terminalWriterInvocation < 0 || terminalWriterHeredoc < 0 || terminalWriterEnd < 0) throw new Error('promotion terminal writer is not extractable');
const terminalWriterCode = adaptExtractedCodeToFixtureOwner(sources.promotion.slice(terminalWriterStart, terminalWriterEnd));
const terminalAuthorityInvocation = sources.promotion.indexOf('  python3 -I - "${CONSUMPTION_MARKER_DIR}" "${CONSUMPTION_ID}" "${SOURCE_SHA}"', terminalWriterEnd);
const terminalAuthorityHeredoc = sources.promotion.indexOf("<<'PY'\n", terminalAuthorityInvocation);
const terminalAuthorityStart = terminalAuthorityHeredoc + "<<'PY'\n".length;
const terminalAuthorityEndMarker = '\nPY\n}\n\nrollback_and_exit()';
const terminalAuthorityEnd = sources.promotion.indexOf(terminalAuthorityEndMarker, terminalAuthorityStart);
if (terminalAuthorityInvocation < 0 || terminalAuthorityHeredoc < 0 || terminalAuthorityEnd < 0) throw new Error('promotion terminal authority checker is not extractable');
const terminalAuthorityCode = adaptExtractedCodeToFixtureOwner(sources.promotion.slice(terminalAuthorityStart, terminalAuthorityEnd));

const failFunctionStart = sources.promotion.indexOf('fail() {');
const failFunctionEnd = sources.promotion.indexOf('\n}\n\ncleanup_smoke_files()', failFunctionStart);
if (failFunctionStart < 0 || failFunctionEnd < 0) throw new Error('promotion fail function is not extractable');
const failFunctionCode = sources.promotion.slice(failFunctionStart, failFunctionEnd + 2);
const explicitFailureTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-post-arm-failure-'));
try {
  const sentinel = path.join(explicitFailureTemp, 'rollback-handler-called');
  const harness = [
    'set -Eeuo pipefail',
    'ROLLBACK_ARMED=true',
    'ROLLBACK_SENTINEL="$1"',
    'rollback_and_exit() { printf "%s\\t%s\\n" "$1" "$2" > "$ROLLBACK_SENTINEL"; exit "$2"; }',
    failFunctionCode,
    '[[ deployed = signed ]] || fail "deterministic post-arm explicit failure"',
  ].join('\n');
  const result = spawnSync('bash', ['-c', harness, 'post-arm-failure-harness', sentinel], { encoding: 'utf8' });
  postArmExplicitFailureCases += 1;
  if (result.status !== 1 || !fs.existsSync(sentinel) || fs.readFileSync(sentinel, 'utf8') !== 'EXPLICIT_FAILURE\t1\n') {
    throw new Error(`post-arm explicit failure bypassed rollback handler\n${result.stdout}\n${result.stderr}`);
  }
} finally {
  fs.rmSync(explicitFailureTemp, { recursive: true, force: true });
}

const rollbackFailFunctionStart = sources.rollback.indexOf('fail() {');
const rollbackFailFunctionEnd = sources.rollback.indexOf('\n}\n\n[[ "${EXECUTE}"', rollbackFailFunctionStart);
if (rollbackFailFunctionStart < 0 || rollbackFailFunctionEnd < 0) throw new Error('rollback fail function is not extractable');
const rollbackFailFunctionCode = sources.rollback.slice(rollbackFailFunctionStart, rollbackFailFunctionEnd + 2);
const rollbackExplicitFailureTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-rollback-explicit-failure-'));
try {
  const sentinel = path.join(rollbackExplicitFailureTemp, 'rollback-handler-called');
  const harness = [
    'set -Eeuo pipefail',
    'ROLLBACK_TRANSACTION_ACTIVE=true',
    'ROLLBACK_SENTINEL="$1"',
    'rollback_failure_trap() { printf "%s\\t%s\\n" "$1" "$2" > "$ROLLBACK_SENTINEL"; exit "$1"; }',
    rollbackFailFunctionCode,
    '[[ restored = verified ]] || fail "deterministic armed rollback explicit failure"',
  ].join('\n');
  const result = spawnSync('bash', ['-c', harness, 'rollback-explicit-failure-harness', sentinel], { encoding: 'utf8' });
  rollbackPostArmExplicitFailureCases += 1;
  if (result.status !== 1 || !fs.existsSync(sentinel) || fs.readFileSync(sentinel, 'utf8') !== '1\tEXPLICIT_FAILURE\n') {
    throw new Error(`armed rollback explicit failure bypassed containment handler\n${result.stdout}\n${result.stderr}`);
  }
} finally {
  fs.rmSync(rollbackExplicitFailureTemp, { recursive: true, force: true });
}

const promotionRollbackHandlerStart = sources.promotion.indexOf('rollback_and_exit() {');
const promotionRollbackHandlerEnd = sources.promotion.indexOf('\n}\n\non_error()', promotionRollbackHandlerStart);
if (promotionRollbackHandlerStart < 0 || promotionRollbackHandlerEnd < 0) throw new Error('promotion rollback handler is not extractable');
const promotionRollbackHandlerCode = sources.promotion.slice(
  promotionRollbackHandlerStart,
  promotionRollbackHandlerEnd + 2,
);
const nestedSignalTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-promotion-nested-signal-'));
try {
  const rollbackStub = path.join(nestedSignalTemp, 'bound-rollback.sh');
  fs.writeFileSync(rollbackStub, [
    '#!/usr/bin/env bash',
    'set -u',
    'if [[ "${NESTED_PHASE:-}" == "rollback" ]]; then',
    '  printf "entered\\n" > "$PHASE_STARTED"',
    '  while [[ ! -e "$RELEASE_PHASE" ]]; do :; done',
    'fi',
    'printf "%s\\n" "${ROLLBACK_TRIGGER:-MISSING}" >> "$BOUND_SENTINEL"',
    'exit "${STUB_ROLLBACK_STATUS:-0}"',
  ].join('\n') + '\n', { mode: 0o700 });
  const cases = [
    {
      label: 'term-during-cleanup', phase: 'cleanup', initial: 'TERM', nested: 'TERM', cleanupStatus: 0,
      authorityStatus: 1, rollbackStatus: 0, terminalWriteStatus: 0,
      expectedStatus: 143, expectedTrigger: 'SIGTERM', expectedOutcome: 'AUTOMATIC_ROLLBACK_SUCCEEDED',
      expectBound: true, expectedWarning: null,
    },
    {
      label: 'int-during-authority', phase: 'authority', initial: 'INT', nested: 'INT', cleanupStatus: 0,
      authorityStatus: 1, rollbackStatus: 0, terminalWriteStatus: 0,
      expectedStatus: 130, expectedTrigger: 'SIGINT', expectedOutcome: 'AUTOMATIC_ROLLBACK_SUCCEEDED',
      expectBound: true, expectedWarning: null,
    },
    {
      label: 'cleanup-failure-with-nested-int', phase: 'cleanup', initial: 'TERM', nested: 'INT', cleanupStatus: 1,
      authorityStatus: 1, rollbackStatus: 0, terminalWriteStatus: 0,
      expectedStatus: 143, expectedTrigger: 'SIGTERM', expectedOutcome: 'AUTOMATIC_ROLLBACK_SUCCEEDED',
      expectBound: true, expectedWarning: 'smoke-file cleanup failed',
    },
    {
      label: 'rollback-failure-with-nested-term', phase: 'rollback', initial: 'INT', nested: 'TERM', cleanupStatus: 0,
      authorityStatus: 1, rollbackStatus: 17, terminalWriteStatus: 0,
      expectedStatus: 90, expectedTrigger: 'SIGINT', expectedOutcome: 'AUTOMATIC_ROLLBACK_FAILED',
      expectBound: true, expectedWarning: 'automatic Production rollback failed',
    },
    {
      label: 'terminal-failure-publication-negative', phase: 'terminal', initial: 'TERM', nested: 'TERM', cleanupStatus: 0,
      authorityStatus: 1, rollbackStatus: 17, terminalWriteStatus: 1,
      expectedStatus: 92, expectedTrigger: 'SIGTERM', expectedOutcome: 'AUTOMATIC_ROLLBACK_FAILED',
      expectBound: true, expectedWarning: 'terminal evidence could not be persisted',
    },
    {
      label: 'durability-uncertain-terminal-hold', phase: 'authority', initial: 'INT', nested: 'INT', cleanupStatus: 0,
      authorityStatus: 75, rollbackStatus: 0, terminalWriteStatus: 0,
      expectedStatus: 93, expectedTrigger: 'SIGINT', expectedOutcome: null,
      expectBound: false, expectedWarning: 'operator HOLD is required',
    },
  ];
  for (const testCase of cases) {
    const caseRoot = path.join(nestedSignalTemp, testCase.label);
    fs.mkdirSync(caseRoot, { mode: 0o700 });
    const phaseStarted = path.join(caseRoot, 'phase-started');
    const releasePhase = path.join(caseRoot, 'release-phase');
    const boundSentinel = path.join(caseRoot, 'bound-rollback-reached');
    const terminalSentinel = path.join(caseRoot, 'terminal-outcome-attempted');
    const harness = [
      'set -Eeuo pipefail',
      'INITIAL_SIGNAL="$1"',
      'NESTED_SIGNAL="$2"',
      'NESTED_PHASE="$3"',
      'CLEANUP_STATUS="$4"',
      'AUTHORITY_STATUS="$5"',
      'STUB_ROLLBACK_STATUS="$6"',
      'TERMINAL_WRITE_STATUS="$7"',
      'PHASE_STARTED="$8"',
      'RELEASE_PHASE="$9"',
      'BOUND_SENTINEL="${10}"',
      'TERMINAL_SENTINEL="${11}"',
      'ROLLBACK_SCRIPT="${12}"',
      'export BOUND_SENTINEL STUB_ROLLBACK_STATUS NESTED_PHASE PHASE_STARTED RELEASE_PHASE',
      'ROLLBACK_ARMED=true',
      'ROOT_DIR=/synthetic/root',
      'PROD_ROOT=/synthetic/production',
      'PREPARED_ROLLBACK_DIR=/synthetic/prepared',
      `SNAPSHOT_MANIFEST_SHA256="sha256:${'a'.repeat(64)}"`,
      'CONSUMPTION_MARKER_DIR=/synthetic/consumption',
      'cleanup_smoke_files() {',
      '  if [[ "$NESTED_PHASE" == "cleanup" ]]; then',
      '    printf "entered\\n" > "$PHASE_STARTED"',
      '    while [[ ! -e "$RELEASE_PHASE" ]]; do :; done',
      '  fi',
      '  return "$CLEANUP_STATUS"',
      '}',
      'cleanup_target_override() { return 0; }',
      'terminal_promotion_success_is_authoritative() {',
      '  if [[ "$NESTED_PHASE" == "authority" ]]; then',
      '    printf "entered\\n" > "$PHASE_STARTED"',
      '    while [[ ! -e "$RELEASE_PHASE" ]]; do :; done',
      '  fi',
      '  return "$AUTHORITY_STATUS"',
      '}',
      'write_local_terminal_result() {',
      '  if [[ "$NESTED_PHASE" == "terminal" ]]; then',
      '    printf "entered\\n" > "$PHASE_STARTED"',
      '    while [[ ! -e "$RELEASE_PHASE" ]]; do :; done',
      '  fi',
      '  printf "%s\\t%s\\n" "$1" "$2" >> "$TERMINAL_SENTINEL"',
      '  return "$TERMINAL_WRITE_STATUS"',
      '}',
      promotionRollbackHandlerCode,
      "trap 'rollback_and_exit SIGINT 130' INT",
      "trap 'rollback_and_exit SIGTERM 143' TERM",
      '(',
      '  while [[ ! -e "$PHASE_STARTED" ]]; do :; done',
      '  kill -s "$NESTED_SIGNAL" "$$"',
      '  printf "released\\n" > "$RELEASE_PHASE"',
      ') &',
      'kill -s "$INITIAL_SIGNAL" "$$"',
      'exit 99',
    ].join('\n');
    const result = spawnSync('bash', [
      '-c', harness, `nested-signal-${testCase.label}`,
      testCase.initial, testCase.nested, testCase.phase, String(testCase.cleanupStatus),
      String(testCase.authorityStatus), String(testCase.rollbackStatus),
      String(testCase.terminalWriteStatus), phaseStarted, releasePhase,
      boundSentinel, terminalSentinel, rollbackStub,
    ], { encoding: 'utf8', timeout: 2_000 });
    promotionNestedSignalContainmentCases += 1;
    const boundReached = fs.existsSync(boundSentinel);
    const terminalLines = fs.existsSync(terminalSentinel)
      ? fs.readFileSync(terminalSentinel, 'utf8').trim().split('\n').filter(Boolean)
      : [];
    const expectedTerminalLine = testCase.expectedOutcome === null
      ? null
      : `${testCase.expectedOutcome}\t${testCase.expectedTrigger}`;
    if (
      result.status !== testCase.expectedStatus
      || result.signal !== null
      || boundReached !== testCase.expectBound
      || (boundReached && fs.readFileSync(boundSentinel, 'utf8') !== `${testCase.expectedTrigger}\n`)
      || (expectedTerminalLine === null ? terminalLines.length !== 0 : !terminalLines.includes(expectedTerminalLine))
      || (testCase.expectedWarning !== null && !result.stderr.includes(testCase.expectedWarning))
    ) {
      throw new Error(
        `nested ${testCase.initial}/${testCase.nested} containment failed: ${testCase.label}`
        + `\nstatus=${result.status} signal=${result.signal} bound=${boundReached}`
        + `\n${result.stdout}\n${result.stderr}`,
      );
    }
  }
} finally {
  fs.rmSync(nestedSignalTemp, { recursive: true, force: true });
}

const terminalTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-terminal-publication-'));
try {
  const args = [
    'PROMOTION_SUCCEEDED', 'POST_DEPLOYMENT_SMOKE_PASS', 'consumption-test', 'a'.repeat(40),
    `sha256:${'b'.repeat(64)}`, `sha256:${'c'.repeat(64)}`, `sha256:${'d'.repeat(64)}`,
    'e'.repeat(64), 'f'.repeat(64), `sha256:${'0'.repeat(64)}`,
  ];
  const authorityArgs = args.slice(2);
  const runWriter = (directory, code = terminalWriterCode, invocationArgs = args) => (
    spawnSync('python3', ['-I', '-c', code, directory, ...invocationArgs], { encoding: 'utf8' })
  );
  const runAuthority = (directory, code = terminalAuthorityCode, invocationArgs = authorityArgs) => (
    spawnSync('python3', ['-I', '-c', code, directory, ...invocationArgs], { encoding: 'utf8' })
  );
  const positiveDir = path.join(terminalTemp, 'positive');
  fs.mkdirSync(positiveDir, { mode: 0o700 });
  const positive = runWriter(positiveDir);
  if (positive.status !== 0) throw new Error(`promotion terminal publication positive failed\n${positive.stdout}\n${positive.stderr}`);
  const finalPath = path.join(positiveDir, 'terminal-result.json');
  const finalMetadata = fs.statSync(finalPath);
  if (
    finalMetadata.nlink !== 1
    || (finalMetadata.mode & 0o7777) !== 0o600
    || fs.readdirSync(positiveDir).some(name => name.startsWith('.terminal-result.'))
  ) throw new Error('promotion terminal publication left an nlink/temp crash window');
  const committedBytes = fs.readFileSync(finalPath);
  const positiveAuthority = runAuthority(positiveDir);
  if (positiveAuthority.status !== 0) throw new Error(`promotion terminal authority positive failed\n${positiveAuthority.stdout}\n${positiveAuthority.stderr}`);
  const rerun = runWriter(positiveDir);
  terminalPublicationNegativeCases += 1;
  if (rerun.status === 0 || !rerun.stderr.includes('LOCAL_TERMINAL_RESULT_ALREADY_EXISTS') || !fs.readFileSync(finalPath).equals(committedBytes)) {
    throw new Error('promotion terminal rerun did not preserve authoritative success marker');
  }

  const symlinkDir = path.join(terminalTemp, 'symlink');
  fs.mkdirSync(symlinkDir, { mode: 0o700 });
  const sentinel = path.join(terminalTemp, 'outside-sentinel');
  fs.writeFileSync(sentinel, 'terminal-sentinel\n', { mode: 0o600 });
  fs.symlinkSync(sentinel, path.join(symlinkDir, 'terminal-result.json'));
  const symlink = runWriter(symlinkDir);
  terminalPublicationNegativeCases += 1;
  if (symlink.status === 0 || fs.readFileSync(sentinel, 'utf8') !== 'terminal-sentinel\n' || !fs.lstatSync(path.join(symlinkDir, 'terminal-result.json')).isSymbolicLink()) {
    throw new Error('promotion terminal symlink collision changed its sentinel');
  }

  const interruptedDir = path.join(terminalTemp, 'interrupted');
  fs.mkdirSync(interruptedDir, { mode: 0o700 });
  const staleName = `.terminal-result.${'f'.repeat(64)}.tmp`;
  fs.writeFileSync(path.join(interruptedDir, staleName), 'interrupted-terminal-bytes\n', { mode: 0o600 });
  const interrupted = runWriter(interruptedDir);
  terminalPublicationNegativeCases += 1;
  if (
    interrupted.status === 0
    || !interrupted.stderr.includes('LOCAL_TERMINAL_RESULT_STALE_TEMP_HOLD')
    || fs.existsSync(path.join(interruptedDir, 'terminal-result.json'))
    || fs.readFileSync(path.join(interruptedDir, staleName), 'utf8') !== 'interrupted-terminal-bytes\n'
  ) throw new Error('promotion terminal interrupted-publish boundary was not fail closed');

  const signalLine = '    os.kill(os.getpid(), __import__("signal").SIGTERM)\n';
  const injectBefore = (code, marker) => {
    if (!code.includes(marker)) throw new Error(`terminal signal injection marker missing: ${marker}`);
    return code.replace(marker, `${signalLine}${marker}`);
  };
  const signalBeforeDir = path.join(terminalTemp, 'signal-before-rename');
  fs.mkdirSync(signalBeforeDir, { mode: 0o700 });
  const signalBefore = runWriter(signalBeforeDir, injectBefore(terminalWriterCode, '    libc = ctypes.CDLL(None, use_errno=True)\n'));
  terminalSignalInjectionCases += 1;
  const beforeTemps = fs.readdirSync(signalBeforeDir).filter(name => name.startsWith('.terminal-result.') && name.endsWith('.tmp'));
  if (signalBefore.signal !== 'SIGTERM' || fs.existsSync(path.join(signalBeforeDir, 'terminal-result.json')) || beforeTemps.length !== 1 || runAuthority(signalBeforeDir).status === 0) {
    throw new Error(`pre-rename SIGTERM did not leave a non-authoritative stale-temp HOLD boundary\n${signalBefore.stdout}\n${signalBefore.stderr}`);
  }
  const staleRetry = runWriter(signalBeforeDir);
  terminalPublicationNegativeCases += 1;
  if (staleRetry.status === 0 || !staleRetry.stderr.includes('LOCAL_TERMINAL_RESULT_STALE_TEMP_HOLD')) {
    throw new Error('pre-rename SIGTERM stale temp was not held on retry');
  }

  for (const [label, marker] of [
    ['after-rename-before-parent-fsync', '    final = os.stat("terminal-result.json", dir_fd=parent_fd, follow_symlinks=False)\n'],
    ['after-parent-fsync-before-return', '    published = True\n'],
  ]) {
    const directory = path.join(terminalTemp, label);
    fs.mkdirSync(directory, { mode: 0o700 });
    const signalled = runWriter(directory, injectBefore(terminalWriterCode, marker));
    terminalSignalInjectionCases += 1;
    const authority = runAuthority(directory);
    if (
      signalled.signal !== 'SIGTERM'
      || authority.status !== 0
      || !fs.existsSync(path.join(directory, 'terminal-result.json'))
      || fs.readdirSync(directory).some(name => name.startsWith('.terminal-result.'))
    ) throw new Error(`${label} SIGTERM did not converge on one fsynced authoritative success marker\n${signalled.stdout}\n${signalled.stderr}\n${authority.stderr}`);
  }

  for (const resultName of ['AUTOMATIC_ROLLBACK_SUCCEEDED', 'AUTOMATIC_ROLLBACK_FAILED']) {
    const directory = path.join(terminalTemp, resultName.toLowerCase());
    fs.mkdirSync(directory, { mode: 0o700 });
    const failureArgs = [resultName, 'ERR', ...args.slice(2)];
    const publication = runWriter(directory, terminalWriterCode, failureArgs);
    const receiptPath = path.join(directory, 'terminal-result.json');
    terminalFailurePublicationCases += 1;
    terminalAuthorityNegativeCases += 1;
    if (
      publication.status !== 0
      || JSON.parse(fs.readFileSync(receiptPath, 'utf8')).result !== resultName
      || runAuthority(directory).status === 0
      || fs.readdirSync(directory).some(name => name.startsWith('.terminal-result.'))
    ) throw new Error(`terminal rollback outcome publication invalid: ${resultName}\n${publication.stdout}\n${publication.stderr}`);
  }

  const baselinePayload = JSON.parse(committedBytes.toString('utf8'));
  const markerMutations = [
    ['consumption-context', payload => { payload.consumption_id = 'different-consumption'; }],
    ['source-context', payload => { payload.source_sha = '9'.repeat(40); }],
    ['snapshot-context', payload => { payload.predeployment_snapshot_manifest_sha256 = `sha256:${'7'.repeat(64)}`; }],
    ['target-gateway-image', payload => { payload.target_gateway_image_id = `sha256:${'9'.repeat(64)}`; }],
    ['target-scheduler-image', payload => { payload.target_scheduler_image_id = `sha256:${'8'.repeat(64)}`; }],
    ['gateway-container', payload => { payload.deployed_gateway_container_id = '7'.repeat(64); }],
    ['scheduler-container', payload => { payload.deployed_scheduler_container_id = '6'.repeat(64); }],
    ['deployment-context', payload => { payload.deployment_manifest_sha256 = `sha256:${'5'.repeat(64)}`; }],
    ['extra-field', payload => { payload.untrusted_extra = true; }],
  ];
  for (const [label, mutate] of markerMutations) {
    const directory = path.join(terminalTemp, `marker-${label}`);
    fs.mkdirSync(directory, { mode: 0o700 });
    const payload = structuredClone(baselinePayload);
    mutate(payload);
    fs.writeFileSync(path.join(directory, 'terminal-result.json'), `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
    const authority = runAuthority(directory);
    terminalAuthorityNegativeCases += 1;
    if (authority.status === 0) throw new Error(`terminal authority accepted divergent ${label} context`);
  }

  const fsyncFailureCode = terminalAuthorityCode.replace(
    '    os.fsync(parent_fd)\n',
    '    raise OSError("TERMINAL_PARENT_FSYNC_INJECTED")\n',
  );
  if (fsyncFailureCode === terminalAuthorityCode) throw new Error('terminal authority parent-fsync failpoint is not injectable');
  const fsyncFailure = runAuthority(positiveDir, fsyncFailureCode);
  terminalAuthorityNegativeCases += 1;
  if (fsyncFailure.status !== 75) {
    throw new Error(`terminal authority did not return the distinct durability-uncertain HOLD when held-parent fsync failed\n${fsyncFailure.stdout}\n${fsyncFailure.stderr}`);
  }

  const fifoDir = path.join(terminalTemp, 'fifo-collision');
  fs.mkdirSync(fifoDir, { mode: 0o700 });
  const fifoPath = path.join(fifoDir, 'terminal-result.json');
  const fifoCreate = spawnSync('python3', ['-I', '-c', 'import os,sys; os.mkfifo(sys.argv[1], 0o600)', fifoPath], { encoding: 'utf8' });
  if (fifoCreate.status !== 0) throw new Error(`terminal FIFO fixture creation failed\n${fifoCreate.stderr}`);
  const fifoAuthority = spawnSync('python3', ['-I', '-c', terminalAuthorityCode, fifoDir, ...authorityArgs], {
    encoding: 'utf8', timeout: 2_000,
  });
  terminalAuthorityNegativeCases += 1;
  if (fifoAuthority.status === 0 || fifoAuthority.signal === 'SIGTERM' || !fs.lstatSync(fifoPath).isFIFO()) {
    throw new Error(`terminal authority blocked on or accepted a FIFO collision\n${fifoAuthority.stdout}\n${fifoAuthority.stderr}`);
  }

  const fileFsyncDir = path.join(terminalTemp, 'writer-file-fsync-failure');
  fs.mkdirSync(fileFsyncDir, { mode: 0o700 });
  const fileFsyncFailureCode = terminalWriterCode.replace(
    '    os.fsync(descriptor)\n',
    '    raise OSError("LOCAL_TERMINAL_RESULT_FILE_FSYNC_INJECTED")\n',
  );
  if (fileFsyncFailureCode === terminalWriterCode) throw new Error('terminal writer file-fsync failpoint is not injectable');
  const fileFsyncFailure = runWriter(fileFsyncDir, fileFsyncFailureCode);
  terminalPublicationNegativeCases += 1;
  if (
    fileFsyncFailure.status === 0
    || !fileFsyncFailure.stderr.includes('LOCAL_TERMINAL_RESULT_FILE_FSYNC_INJECTED')
    || fs.existsSync(path.join(fileFsyncDir, 'terminal-result.json'))
    || fs.readdirSync(fileFsyncDir).some(name => name.startsWith('.terminal-result.'))
    || runAuthority(fileFsyncDir).status === 0
  ) throw new Error('terminal writer file-fsync failure did not remain non-authoritative and cleanup-complete');

  const cleanupFailureDir = path.join(terminalTemp, 'writer-cleanup-failure');
  fs.mkdirSync(cleanupFailureDir, { mode: 0o700 });
  const cleanupFailureCode = fileFsyncFailureCode.replace(
    '        os.unlink(temporary_name, dir_fd=parent_fd)\n',
    '        raise OSError("LOCAL_TERMINAL_RESULT_CLEANUP_INJECTED")\n',
  );
  if (cleanupFailureCode === fileFsyncFailureCode) throw new Error('terminal writer cleanup failpoint is not injectable');
  const cleanupFailure = runWriter(cleanupFailureDir, cleanupFailureCode);
  terminalPublicationNegativeCases += 1;
  const cleanupStages = fs.readdirSync(cleanupFailureDir).filter(name => name.startsWith('.terminal-result.') && name.endsWith('.tmp'));
  if (
    cleanupFailure.status === 0
    || !cleanupFailure.stderr.includes('LOCAL_TERMINAL_RESULT_CLEANUP_INJECTED')
    || fs.existsSync(path.join(cleanupFailureDir, 'terminal-result.json'))
    || cleanupStages.length !== 1
    || runAuthority(cleanupFailureDir).status === 0
  ) throw new Error('terminal writer cleanup failure did not preserve a detectable non-authoritative HOLD stage');
} finally {
  fs.rmSync(terminalTemp, { recursive: true, force: true });
}

let rollbackErrorReceiptFaultCases = 0;
const errorWriterFunctionStart = sources.rollback.indexOf('write_rollback_error_receipt() {');
const errorWriterHeredoc = sources.rollback.indexOf("<<'PY'\n", errorWriterFunctionStart);
const errorWriterStart = errorWriterHeredoc + "<<'PY'\n".length;
const errorWriterEndMarker = '\nPY\n}\n\nrollback_failure_trap()';
const errorWriterEnd = sources.rollback.indexOf(errorWriterEndMarker, errorWriterStart);
if (errorWriterFunctionStart < 0 || errorWriterHeredoc < 0 || errorWriterEnd < 0) throw new Error('rollback error receipt writer is not extractable');
const errorWriterCode = adaptExtractedCodeToFixtureOwner(sources.rollback.slice(errorWriterStart, errorWriterEnd));
const terminalManifestCommandStart = sources.rollback.indexOf('ROLLBACK_TERMINAL_SUCCESS_MANIFEST_SHA256="$(');
const terminalManifestHeredoc = sources.rollback.indexOf("<<'PY'\n", terminalManifestCommandStart);
const terminalManifestCodeStart = terminalManifestHeredoc + "<<'PY'\n".length;
const terminalManifestEndMarker = '\nPY\n)" || fail "Rollback terminal success manifest publication failed"';
const terminalManifestCodeEnd = sources.rollback.indexOf(terminalManifestEndMarker, terminalManifestCodeStart);
if (terminalManifestCommandStart < 0 || terminalManifestHeredoc < 0 || terminalManifestCodeEnd < 0) throw new Error('rollback terminal manifest publisher is not extractable');
const terminalManifestCode = sources.rollback.slice(terminalManifestCodeStart, terminalManifestCodeEnd);
const terminalManifestFixtureCode = adaptExtractedCodeToFixtureOwner(terminalManifestCode);
const errorWriterFixtureCode = adaptExtractedCodeToFixtureOwner(errorWriterCode);
const errorWriterTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-rollback-error-receipt-'));
try {
  const gatewayId = 'a'.repeat(64);
  const schedulerId = 'b'.repeat(64);
  const sourceSha = 'c'.repeat(40);
  const snapshotDigest = `sha256:${'d'.repeat(64)}`;
  const receiptDirectoryName = `kidults-rollback-20260831T000000Z-${'e'.repeat(64)}`;
  const fixtures = {
    'partial-a.txt': Buffer.from('partial-a\n'),
    'partial-b.bin': Buffer.from([0, 1, 2, 3, 255]),
  };
  const prepareDirectory = name => {
    const directory = path.join(errorWriterTemp, name);
    fs.mkdirSync(directory, { mode: 0o700 });
    for (const [member, bytes] of Object.entries(fixtures)) fs.writeFileSync(path.join(directory, member), bytes, { mode: 0o600 });
    return directory;
  };
  const runErrorWriter = (directory, { phase = '', guard = false } = {}) => {
    const receiptFd = fs.openSync(directory, fs.constants.O_RDONLY);
    const environment = { ...process.env };
    delete environment.KIDULTS_ROLLBACK_ERROR_RECEIPT_TEST_HOOKS;
    delete environment.KIDULTS_ROLLBACK_ERROR_RECEIPT_TEST_FAIL_PHASE;
    if (guard) environment.KIDULTS_ROLLBACK_ERROR_RECEIPT_TEST_HOOKS = 'ENABLED_FAIL_CLOSED_ONLY';
    if (phase) environment.KIDULTS_ROLLBACK_ERROR_RECEIPT_TEST_FAIL_PHASE = phase;
    try {
      return spawnSync('python3', [
        '-I', '-c', errorWriterFixtureCode,
        '3', '17', 'TEST_SIGNAL', 'TEST_PHASE', 'EXACT_NAMED_PAIR_RESTART_DISABLED_AND_STOPPED',
        gatewayId, schedulerId, 'false', sourceSha, snapshotDigest, receiptDirectoryName,
      ], { encoding: 'utf8', env: environment, stdio: ['ignore', 'pipe', 'pipe', receiptFd] });
    } finally {
      fs.closeSync(receiptFd);
    }
  };
  const positiveDirectory = prepareDirectory('positive');
  const positive = runErrorWriter(positiveDirectory);
  if (positive.status !== 0 || !positive.stdout.includes('ROLLBACK_ERROR_RECEIPT_COMMITTED_MANIFEST_LAST')) {
    throw new Error(`rollback error receipt positive failed\n${positive.stdout}\n${positive.stderr}`);
  }
  const positiveNames = new Set(fs.readdirSync(positiveDirectory));
  const finalErrorMembers = new Set([
    'rollback-error-receipt.json',
    'rollback-error-receipt.json.sha256',
    'rollback-error-manifest.json',
  ]);
  if ([...positiveNames].some(name => name.startsWith('.rollback-error-'))) throw new Error('rollback error receipt positive left a hidden stage');
  for (const name of finalErrorMembers) {
    if (!positiveNames.has(name)) throw new Error(`rollback error receipt positive missing ${name}`);
    const metadata = fs.statSync(path.join(positiveDirectory, name));
    if (!metadata.isFile() || metadata.nlink !== 1 || (metadata.mode & 0o7777) !== 0o600) throw new Error(`rollback error receipt unsafe final member ${name}`);
  }
  const positiveManifest = JSON.parse(fs.readFileSync(path.join(positiveDirectory, 'rollback-error-manifest.json'), 'utf8'));
  const expectedCohort = Object.entries(fixtures).sort(([left], [right]) => left.localeCompare(right)).map(([name, bytes]) => ({
    name,
    sha256: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
    size: bytes.length,
  }));
  if (
    positiveManifest.commit_marker !== true
    || positiveManifest.manifest_published_last !== true
    || JSON.stringify(positiveManifest.partial_cohort_exact_members) !== JSON.stringify(expectedCohort)
    || positiveManifest.partial_cohort_member_count !== expectedCohort.length
  ) throw new Error('rollback error manifest did not bind the exact partial cohort');

  for (const phase of [
    'after_receipt_stage',
    'after_checksum_stage',
    'after_receipt_publish',
    'after_checksum_publish',
    'before_manifest_publish',
    'after_manifest_publish',
  ]) {
    const directory = prepareDirectory(`fault-${phase}`);
    const result = runErrorWriter(directory, { phase, guard: true });
    rollbackErrorReceiptFaultCases += 1;
    if (result.status === 0 || !result.stderr.includes(`ROLLBACK_ERROR_RECEIPT_INJECTED_FAILURE:${phase}`)) {
      throw new Error(`rollback error receipt injected fault did not fail: ${phase}\n${result.stdout}\n${result.stderr}`);
    }
    const names = fs.readdirSync(directory);
    const manifestExists = names.includes('rollback-error-manifest.json');
    if (phase === 'after_manifest_publish') {
      if (!manifestExists || names.some(name => name.startsWith('.rollback-error-'))) throw new Error('post-manifest fault lost authoritative exact closure');
    } else if (manifestExists || !names.some(name => name.startsWith('.rollback-error-') || name.startsWith('rollback-error-'))) {
      throw new Error(`pre-manifest fault appeared terminal or left no detectable HOLD state: ${phase}`);
    }
    for (const [member, bytes] of Object.entries(fixtures)) {
      if (!fs.readFileSync(path.join(directory, member)).equals(bytes)) throw new Error(`rollback error fault changed partial cohort: ${phase}:${member}`);
    }
  }

  const unguardedDirectory = prepareDirectory('unguarded-hook');
  const unguarded = runErrorWriter(unguardedDirectory, { phase: 'after_receipt_stage' });
  rollbackErrorReceiptFaultCases += 1;
  if (unguarded.status === 0 || !unguarded.stderr.includes('ROLLBACK_ERROR_RECEIPT_TEST_HOOK_FORBIDDEN')) {
    throw new Error('rollback error receipt test hook was usable without its fail-closed guard');
  }

  const collisionDirectory = prepareDirectory('symlink-collision');
  const outsideSentinel = path.join(errorWriterTemp, 'outside-error-sentinel');
  fs.writeFileSync(outsideSentinel, 'error-sentinel\n', { mode: 0o600 });
  fs.symlinkSync(outsideSentinel, path.join(collisionDirectory, 'rollback-error-receipt.json'));
  const collision = runErrorWriter(collisionDirectory);
  rollbackErrorReceiptFaultCases += 1;
  if (
    collision.status === 0
    || !collision.stderr.includes('ROLLBACK_ERROR_RECEIPT_PREEXISTING_TRANSACTION_HOLD')
    || fs.readFileSync(outsideSentinel, 'utf8') !== 'error-sentinel\n'
    || !fs.lstatSync(path.join(collisionDirectory, 'rollback-error-receipt.json')).isSymbolicLink()
  ) throw new Error('rollback error receipt collision changed its outside sentinel');

  const regularCollisionDirectory = prepareDirectory('regular-final-collision');
  const preexistingFinal = path.join(regularCollisionDirectory, 'rollback-error-receipt.json');
  fs.writeFileSync(preexistingFinal, 'preexisting-error-final\n', { mode: 0o600 });
  const regularCollision = runErrorWriter(regularCollisionDirectory);
  rollbackErrorReceiptFaultCases += 1;
  if (
    regularCollision.status === 0
    || !regularCollision.stderr.includes('ROLLBACK_ERROR_RECEIPT_PREEXISTING_TRANSACTION_HOLD')
    || fs.readFileSync(preexistingFinal, 'utf8') !== 'preexisting-error-final\n'
  ) throw new Error('rollback error receipt regular final collision was not preserved');

  const staleStageDirectory = prepareDirectory('stale-stage');
  const staleStage = path.join(staleStageDirectory, `.rollback-error-${'f'.repeat(64)}-0.tmp`);
  fs.writeFileSync(staleStage, 'stale-error-stage\n', { mode: 0o600 });
  const staleStageResult = runErrorWriter(staleStageDirectory);
  rollbackErrorReceiptFaultCases += 1;
  if (
    staleStageResult.status === 0
    || !staleStageResult.stderr.includes('ROLLBACK_ERROR_RECEIPT_PREEXISTING_TRANSACTION_HOLD')
    || fs.readFileSync(staleStage, 'utf8') !== 'stale-error-stage\n'
    || fs.existsSync(path.join(staleStageDirectory, 'rollback-error-manifest.json'))
  ) throw new Error('rollback error receipt stale stage was not retained as a nonterminal HOLD');
} finally {
  fs.rmSync(errorWriterTemp, { recursive: true, force: true });
}

let terminalManifestFaultCases = 0;
let terminalAuthorityHeldFdCases = 0;
const terminalManifestTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-rollback-terminal-manifest-'));
try {
  const sourceSha = 'c'.repeat(40);
  const snapshotDigest = `sha256:${'d'.repeat(64)}`;
  const requiredSingles = [
    'docker-load.txt', 'health.json', 'portal.html', 'collector-unauth.json',
    'container-quiescence-after-stop.json', 'container-quiescence-before-restore.json',
    'container-quiescence-after-restore.json', 'container-quiescence-before-startup.json',
    'rollback-transaction-v1.jsonl', 'sqlite-restore-transaction-v1.jsonl',
    'configuration-restore-transaction-v1.jsonl',
  ];
  const checksumPairs = [
    ['restart-policy-before.json', 'restart-policy-before.json.sha256'],
    ['restart-no-compose-override.yml', 'restart-no-compose-override.yml.sha256'],
    ['failed-state-metadata.json', 'failed-state-metadata.json.sha256'],
    ['database-restore-order.json', 'database-restore-order.json.sha256'],
    ['rollback-receipt.json', 'rollback-receipt.json.sha256'],
  ];
  const prepareReceipt = (label, { large = false } = {}) => {
    const rootDir = path.join(terminalManifestTemp, label);
    const receiptName = `kidults-rollback-20260831T000000Z-${crypto.createHash('sha256').update(label).digest('hex')}`;
    const directory = path.join(rootDir, receiptName);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(rootDir, 0o700);
    fs.chmodSync(directory, 0o700);
    for (const name of requiredSingles) fs.writeFileSync(path.join(directory, name), `${name}\n`, { mode: 0o600 });
    for (const [dataName, checksumName] of checksumPairs) {
      const body = Buffer.from(`${dataName}:bound-terminal-data\n`);
      fs.writeFileSync(path.join(directory, dataName), body, { mode: 0o600 });
      fs.writeFileSync(
        path.join(directory, checksumName),
        `${crypto.createHash('sha256').update(body).digest('hex')}  ${dataName}\n`,
        { mode: 0o600 },
      );
    }
    if (large) {
      const largeName = 'failed-kaios.db';
      const largeBytes = Buffer.alloc(12 * 1024 * 1024, 0x6b);
      fs.writeFileSync(path.join(directory, largeName), largeBytes, { mode: 0o600 });
      fs.writeFileSync(
        path.join(directory, `${largeName}.sha256`),
        `${crypto.createHash('sha256').update(largeBytes).digest('hex')}  ${largeName}\n`,
        { mode: 0o600 },
      );
    }
    return { rootDir, receiptName, directory };
  };
  const runTerminalManifest = (fixture, { phase = '', guard = false, code = terminalManifestFixtureCode } = {}) => {
    const receiptFd = fs.openSync(fixture.directory, fs.constants.O_RDONLY);
    const environment = { ...process.env };
    delete environment.KIDULTS_ROLLBACK_TERMINAL_MANIFEST_TEST_HOOKS;
    delete environment.KIDULTS_ROLLBACK_TERMINAL_MANIFEST_TEST_FAIL_PHASE;
    if (guard) environment.KIDULTS_ROLLBACK_TERMINAL_MANIFEST_TEST_HOOKS = 'ENABLED_FAIL_CLOSED_ONLY';
    if (phase) environment.KIDULTS_ROLLBACK_TERMINAL_MANIFEST_TEST_FAIL_PHASE = phase;
    try {
      return spawnSync('python3', ['-I', '-c', code, '3', fixture.receiptName, sourceSha, snapshotDigest], {
        encoding: 'utf8', env: environment, stdio: ['ignore', 'pipe', 'pipe', receiptFd],
      });
    } finally {
      fs.closeSync(receiptFd);
    }
  };
  const runTerminalErrorWriter = fixture => {
    const receiptFd = fs.openSync(fixture.directory, fs.constants.O_RDONLY);
    try {
      return spawnSync('python3', [
        '-I', '-c', errorWriterCode,
        '3', '75', 'TERMINAL_MANIFEST_FAILURE', 'TERMINAL_SUCCESS_RECEIPT_WRITTEN',
        'CONTAINMENT_UNVERIFIED_HOLD', 'a'.repeat(64), 'b'.repeat(64), 'false',
        sourceSha, snapshotDigest, fixture.receiptName,
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe', receiptFd] });
    } finally {
      fs.closeSync(receiptFd);
    }
  };

  for (const phase of ['after_stage_write', 'after_stage_fsync', 'before_rename']) {
    const fixture = prepareReceipt(`fault-${phase}`);
    const publication = runTerminalManifest(fixture, { phase, guard: true });
    terminalManifestFaultCases += 1;
    if (
      publication.status === 0
      || !publication.stderr.includes(`ROLLBACK_TERMINAL_MANIFEST_INJECTED_FAILURE:${phase}`)
      || fs.existsSync(path.join(fixture.directory, 'rollback-terminal-success-manifest.json'))
      || fs.readdirSync(fixture.directory).some(name => name.startsWith('.rollback-terminal-success.'))
    ) throw new Error(`terminal manifest ${phase} fault did not remain nonterminal and cleanup-complete\n${publication.stdout}\n${publication.stderr}`);
    const errorReceipt = runTerminalErrorWriter(fixture);
    if (
      errorReceipt.status !== 0
      || !fs.existsSync(path.join(fixture.directory, 'rollback-error-manifest.json'))
      || fs.readdirSync(fixture.directory).some(name => name.startsWith('.rollback-error-'))
    ) throw new Error(`terminal manifest ${phase} fault did not publish a manifest-last error receipt\n${errorReceipt.stdout}\n${errorReceipt.stderr}`);
  }

  const cleanupFixture = prepareReceipt('fault-before-rename-cleanup-hold');
  const cleanupFailureCode = terminalManifestFixtureCode.replace(
    '            os.unlink(stage_name, dir_fd=receipt_fd)\n',
    '            raise OSError("ROLLBACK_TERMINAL_STAGE_CLEANUP_INJECTED")\n',
  );
  if (cleanupFailureCode === terminalManifestFixtureCode) throw new Error('terminal manifest cleanup failpoint is not injectable');
  const cleanupFailure = runTerminalManifest(cleanupFixture, { phase: 'before_rename', guard: true, code: cleanupFailureCode });
  terminalManifestFaultCases += 1;
  const hiddenStages = fs.readdirSync(cleanupFixture.directory).filter(name => name.startsWith('.rollback-terminal-success.') && name.endsWith('.tmp'));
  if (cleanupFailure.status === 0 || hiddenStages.length !== 1 || fs.existsSync(path.join(cleanupFixture.directory, 'rollback-terminal-success-manifest.json'))) {
    throw new Error(`terminal manifest cleanup fault did not preserve one detectable hidden stage\n${cleanupFailure.stdout}\n${cleanupFailure.stderr}`);
  }
  const cleanupErrorReceipt = runTerminalErrorWriter(cleanupFixture);
  const cleanupErrorManifest = JSON.parse(fs.readFileSync(path.join(cleanupFixture.directory, 'rollback-error-manifest.json'), 'utf8'));
  if (
    cleanupErrorReceipt.status !== 0
    || !cleanupErrorManifest.partial_cohort_exact_members.some(member => member.name === hiddenStages[0])
  ) throw new Error(`hidden terminal stage prevented manifest-last error receipt publication\n${cleanupErrorReceipt.stdout}\n${cleanupErrorReceipt.stderr}`);

  const authorityFixture = prepareReceipt('large-authority', { large: true });
  const publication = runTerminalManifest(authorityFixture);
  if (publication.status !== 0 || !/^sha256:[0-9a-f]{64}\n$/.test(publication.stdout)) {
    throw new Error(`large terminal receipt publication failed\n${publication.stdout}\n${publication.stderr}`);
  }
  const terminalDigest = publication.stdout.trim();
  const rootMetadata = fs.statSync(authorityFixture.rootDir);
  const receiptMetadata = fs.statSync(authorityFixture.directory);
  const rootIdentity = `${rootMetadata.dev}:${rootMetadata.ino}`;
  const receiptIdentity = `${receiptMetadata.dev}:${receiptMetadata.ino}`;
  const terminalPointer = {
    id: 'KIDULTS_PRODUCTION_ROLLBACK_ACTIVE_TRANSACTION_V1', version: '1.0.0',
    state: 'TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING',
    receipt_directory_name: authorityFixture.receiptName,
    source_sha: sourceSha, snapshot_manifest_sha256: snapshotDigest,
    receipt_root_identity: rootIdentity, receipt_directory_identity: receiptIdentity,
    created_at: '2026-08-31T00:00:00Z',
    terminal_success_manifest: 'rollback-terminal-success-manifest.json',
    terminal_success_manifest_sha256: terminalDigest,
    prior_restart_policy_restoration_permitted: true,
    nonterminal_rollback_pointer: false,
    transitioned_at: '2026-08-31T00:01:00Z',
  };
  const pointerPath = path.join(authorityFixture.rootDir, '.kidults-rollback-active-v1.json');
  fs.writeFileSync(pointerPath, `${JSON.stringify(terminalPointer, null, 2)}\n`, { mode: 0o600 });
  const authorityFunctionStart = sources.rollback.indexOf('rollback_terminal_pointer_is_authoritative() {');
  const authorityHeredoc = sources.rollback.indexOf("<<'PY'\n", authorityFunctionStart);
  const authorityCodeStart = authorityHeredoc + "<<'PY'\n".length;
  const authorityCodeEnd = sources.rollback.indexOf('\nPY\n}\n\ntransition_rollback_pointer_to_terminal_success()', authorityCodeStart);
  if (authorityFunctionStart < 0 || authorityHeredoc < 0 || authorityCodeEnd < 0) throw new Error('rollback terminal authority is not extractable');
  const rollbackTerminalAuthorityCode = adaptExtractedCodeToFixtureOwner(sources.rollback.slice(authorityCodeStart, authorityCodeEnd));
  const runRollbackTerminalAuthority = ({ timeout = undefined, expectedTerminalDigest = terminalDigest } = {}) => {
    const rootFd = fs.openSync(authorityFixture.rootDir, fs.constants.O_RDONLY);
    const receiptFd = fs.openSync(authorityFixture.directory, fs.constants.O_RDONLY);
    try {
      return spawnSync('python3', [
        '-I', '-c', rollbackTerminalAuthorityCode, '3', '4', authorityFixture.receiptName,
        sourceSha, snapshotDigest, expectedTerminalDigest, rootIdentity, receiptIdentity,
      ], { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe', rootFd, receiptFd] });
    } finally {
      fs.closeSync(receiptFd);
      fs.closeSync(rootFd);
    }
  };
  const largeAuthority = runRollbackTerminalAuthority();
  terminalAuthorityHeldFdCases += 1;
  if (largeAuthority.status !== 0 || !largeAuthority.stdout.includes('ROLLBACK_TERMINAL_SUCCESS_AUTHORITY_PASS')) {
    throw new Error(`large streaming terminal authority failed\n${largeAuthority.stdout}\n${largeAuthority.stderr}`);
  }
  const terminalManifestPath = path.join(authorityFixture.directory, 'rollback-terminal-success-manifest.json');
  const originalManifestBytes = fs.readFileSync(terminalManifestPath);
  const divergentManifest = JSON.parse(originalManifestBytes.toString('utf8'));
  divergentManifest.source_sha = '8'.repeat(40);
  const divergentManifestBytes = Buffer.from(`${JSON.stringify(divergentManifest, null, 2)}\n`);
  fs.writeFileSync(terminalManifestPath, divergentManifestBytes, { mode: 0o600 });
  const divergentManifestDigest = `sha256:${crypto.createHash('sha256').update(divergentManifestBytes).digest('hex')}`;
  fs.writeFileSync(pointerPath, `${JSON.stringify({ ...terminalPointer, terminal_success_manifest_sha256: divergentManifestDigest }, null, 2)}\n`, { mode: 0o600 });
  const divergentContext = runRollbackTerminalAuthority({ expectedTerminalDigest: divergentManifestDigest });
  terminalAuthorityHeldFdCases += 1;
  if (divergentContext.status === 0 || !divergentContext.stderr.includes('ROLLBACK_TERMINAL_SUCCESS_MANIFEST_BINDING')) {
    throw new Error('terminal authority accepted a digest-bound divergent manifest context');
  }
  fs.writeFileSync(terminalManifestPath, originalManifestBytes, { mode: 0o600 });
  fs.writeFileSync(pointerPath, `${JSON.stringify(terminalPointer, null, 2)}\n`, { mode: 0o600 });
  const receiptPath = path.join(authorityFixture.directory, 'rollback-receipt.json');
  fs.appendFileSync(receiptPath, 'mutated-after-terminal-boundary\n');
  const mutatedReceipt = runRollbackTerminalAuthority();
  terminalAuthorityHeldFdCases += 1;
  if (mutatedReceipt.status === 0 || !mutatedReceipt.stderr.includes('ROLLBACK_TERMINAL_SUCCESS_MANIFEST_HELD_FD_CONTEXT_BINDING')) {
    throw new Error('terminal authority accepted a receipt digest mutation');
  }
  fs.unlinkSync(receiptPath);
  const fifoCreate = spawnSync('python3', ['-I', '-c', 'import os,sys; os.mkfifo(sys.argv[1], 0o600)', receiptPath], { encoding: 'utf8' });
  if (fifoCreate.status !== 0) throw new Error(`terminal receipt FIFO fixture failed\n${fifoCreate.stderr}`);
  const fifoAuthority = runRollbackTerminalAuthority({ timeout: 2_000 });
  terminalAuthorityHeldFdCases += 1;
  if (fifoAuthority.status === 0 || fifoAuthority.signal === 'SIGTERM' || !fs.lstatSync(receiptPath).isFIFO()) {
    throw new Error(`terminal authority blocked on or accepted a receipt FIFO\n${fifoAuthority.stdout}\n${fifoAuthority.stderr}`);
  }
} finally {
  fs.rmSync(terminalManifestTemp, { recursive: true, force: true });
}

let terminalPointerExchangeRecoveryCases = 0;
const pointerTransitionStart = sources.rollback.indexOf('transition_rollback_pointer_to_terminal_success() {');
const pointerTransitionHeredoc = sources.rollback.indexOf("<<'PY'\n", pointerTransitionStart);
const pointerTransitionCodeStart = pointerTransitionHeredoc + "<<'PY'\n".length;
const pointerTransitionCodeEnd = sources.rollback.indexOf('\nPY\n}\n\nwrite_rollback_error_receipt()', pointerTransitionCodeStart);
if (pointerTransitionStart < 0 || pointerTransitionHeredoc < 0 || pointerTransitionCodeEnd < 0) throw new Error('rollback terminal pointer transition is not extractable');
const pointerTransitionCode = adaptExtractedCodeToFixtureOwner(sources.rollback.slice(pointerTransitionCodeStart, pointerTransitionCodeEnd));
const pointerTransitionTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-terminal-pointer-exchange-'));
try {
  const sourceSha = '1'.repeat(40);
  const snapshotDigest = `sha256:${'2'.repeat(64)}`;
  const terminalDigest = `sha256:${'3'.repeat(64)}`;
  const prepare = label => {
    const rootDir = path.join(pointerTransitionTemp, label);
    const receiptName = `kidults-rollback-20260831T000000Z-${crypto.createHash('sha256').update(label).digest('hex')}`;
    const receiptDir = path.join(rootDir, receiptName);
    fs.mkdirSync(receiptDir, { recursive: true, mode: 0o700 });
    fs.chmodSync(rootDir, 0o700);
    const rootMetadata = fs.statSync(rootDir);
    const receiptMetadata = fs.statSync(receiptDir);
    const rootIdentity = `${rootMetadata.dev}:${rootMetadata.ino}`;
    const receiptIdentity = `${receiptMetadata.dev}:${receiptMetadata.ino}`;
    const active = {
      id: 'KIDULTS_PRODUCTION_ROLLBACK_ACTIVE_TRANSACTION_V1', version: '1.0.0',
      state: 'ACTIVE_HOLD_ON_REENTRY', receipt_directory_name: receiptName,
      source_sha: sourceSha, snapshot_manifest_sha256: snapshotDigest,
      receipt_root_identity: rootIdentity, receipt_directory_identity: receiptIdentity,
      created_at: '2026-08-31T00:00:00Z',
    };
    const terminal = {
      ...active, state: 'TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING',
      terminal_success_manifest: 'rollback-terminal-success-manifest.json',
      terminal_success_manifest_sha256: terminalDigest,
      prior_restart_policy_restoration_permitted: true,
      nonterminal_rollback_pointer: false,
      transitioned_at: '2026-08-31T00:01:00Z',
    };
    return { rootDir, receiptName, rootIdentity, receiptIdentity, active, terminal };
  };
  const runTransition = fixture => {
    const rootFd = fs.openSync(fixture.rootDir, fs.constants.O_RDONLY);
    try {
      return spawnSync('python3', [
        '-I', '-c', pointerTransitionCode, '3', fixture.receiptName, sourceSha,
        snapshotDigest, fixture.rootIdentity, fixture.receiptIdentity, terminalDigest,
      ], { encoding: 'utf8', timeout: 2_000, stdio: ['ignore', 'pipe', 'pipe', rootFd] });
    } finally {
      fs.closeSync(rootFd);
    }
  };
  const writePointer = (fixture, name, payload) => fs.writeFileSync(path.join(fixture.rootDir, name), `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  const pointerName = '.kidults-rollback-active-v1.json';
  const stageName = `.kidults-rollback-active-v1.terminal.${'a'.repeat(64)}.tmp`;

  const afterExchange = prepare('after-exchange');
  writePointer(afterExchange, pointerName, afterExchange.terminal);
  writePointer(afterExchange, stageName, afterExchange.active);
  const recovered = runTransition(afterExchange);
  terminalPointerExchangeRecoveryCases += 1;
  if (
    recovered.status !== 0
    || !recovered.stdout.includes('ROLLBACK_TERMINAL_POINTER_TRANSITION_RECOVERED_OLD_ACTIVE_STAGE')
    || fs.existsSync(path.join(afterExchange.rootDir, stageName))
    || JSON.parse(fs.readFileSync(path.join(afterExchange.rootDir, pointerName), 'utf8')).state !== 'TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING'
  ) throw new Error(`post-exchange old-active stage did not reconcile safely\n${recovered.stdout}\n${recovered.stderr}`);

  const beforeExchange = prepare('before-exchange');
  writePointer(beforeExchange, pointerName, beforeExchange.active);
  writePointer(beforeExchange, stageName, beforeExchange.terminal);
  const retried = runTransition(beforeExchange);
  terminalPointerExchangeRecoveryCases += 1;
  if (
    retried.status !== 0
    || fs.existsSync(path.join(beforeExchange.rootDir, stageName))
    || JSON.parse(fs.readFileSync(path.join(beforeExchange.rootDir, pointerName), 'utf8')).state !== 'TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING'
  ) throw new Error(`pre-exchange terminal-intent stage did not retry safely\n${retried.stdout}\n${retried.stderr}`);

  const divergent = prepare('divergent-stage');
  writePointer(divergent, pointerName, divergent.terminal);
  writePointer(divergent, stageName, { ...divergent.active, source_sha: '9'.repeat(40) });
  const held = runTransition(divergent);
  terminalPointerExchangeRecoveryCases += 1;
  if (held.status === 0 || !fs.existsSync(path.join(divergent.rootDir, stageName))) {
    throw new Error('divergent post-exchange stage was not retained as HOLD');
  }

  const fifo = prepare('fifo-pointer');
  const fifoPath = path.join(fifo.rootDir, pointerName);
  const fifoCreate = spawnSync('python3', ['-I', '-c', 'import os,sys; os.mkfifo(sys.argv[1], 0o600)', fifoPath], { encoding: 'utf8' });
  if (fifoCreate.status !== 0) throw new Error(`terminal pointer FIFO fixture failed\n${fifoCreate.stderr}`);
  const fifoResult = runTransition(fifo);
  terminalPointerExchangeRecoveryCases += 1;
  if (fifoResult.status === 0 || fifoResult.signal === 'SIGTERM' || !fs.lstatSync(fifoPath).isFIFO()) {
    throw new Error(`terminal pointer transition blocked on or accepted a FIFO\n${fifoResult.stdout}\n${fifoResult.stderr}`);
  }
} finally {
  fs.rmSync(pointerTransitionTemp, { recursive: true, force: true });
}

let terminalPointerReentryRecoveryCases = 0;
const reentryCommandStart = sources.rollback.indexOf("python3 -I - 5 <<'PY' || fail \"A prior rollback pointer requires state-specific deterministic operator recovery\"");
const reentryHeredoc = sources.rollback.indexOf("<<'PY'", reentryCommandStart);
const reentryCodeStart = sources.rollback.indexOf('\n', reentryHeredoc) + 1;
const reentryCodeEnd = sources.rollback.indexOf('\nPY\nROLLBACK_RECEIPT_ROOT_STABLE=', reentryCodeStart);
if (reentryCommandStart < 0 || reentryHeredoc < 0 || reentryCodeEnd < 0) throw new Error('rollback pointer reentry checker is not extractable');
const reentryCode = adaptExtractedCodeToFixtureOwner(sources.rollback.slice(reentryCodeStart, reentryCodeEnd));
const reentryTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-terminal-pointer-reentry-'));
try {
  const prepareReentry = (label, { divergentStage = false } = {}) => {
    const rootDir = path.join(reentryTemp, label);
    const receiptName = `kidults-rollback-20260831T000000Z-${crypto.createHash('sha256').update(label).digest('hex')}`;
    const receiptDir = path.join(rootDir, receiptName);
    fs.mkdirSync(receiptDir, { recursive: true, mode: 0o700 });
    fs.chmodSync(rootDir, 0o700);
    const rootMetadata = fs.statSync(rootDir);
    const receiptMetadata = fs.statSync(receiptDir);
    const rootIdentity = `${rootMetadata.dev}:${rootMetadata.ino}`;
    const receiptIdentity = `${receiptMetadata.dev}:${receiptMetadata.ino}`;
    const sourceSha = '4'.repeat(40);
    const snapshotDigest = `sha256:${'5'.repeat(64)}`;
    const manifest = {
      id: 'KIDULTS_PRODUCTION_ROLLBACK_TERMINAL_SUCCESS_MANIFEST_V1',
      version: '1.0.0', state: 'TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING',
      commit_marker: true, manifest_published_last_at_terminal_boundary: true,
      restart_policy_at_commit: 'no', receipt_directory_name: receiptName,
      source_sha: sourceSha, snapshot_manifest_sha256: snapshotDigest,
      rollback_receipt_sha256: `sha256:${'6'.repeat(64)}`,
      rollback_receipt_checksum_sha256: `sha256:${'7'.repeat(64)}`,
      members_at_terminal_boundary: [], committed_at: '2026-08-31T00:01:00Z',
    };
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    const manifestDigest = `sha256:${crypto.createHash('sha256').update(manifestBytes).digest('hex')}`;
    fs.writeFileSync(path.join(receiptDir, 'rollback-terminal-success-manifest.json'), manifestBytes, { mode: 0o600 });
    const active = {
      id: 'KIDULTS_PRODUCTION_ROLLBACK_ACTIVE_TRANSACTION_V1', version: '1.0.0',
      state: 'ACTIVE_HOLD_ON_REENTRY', receipt_directory_name: receiptName,
      source_sha: divergentStage ? '9'.repeat(40) : sourceSha,
      snapshot_manifest_sha256: snapshotDigest, receipt_root_identity: rootIdentity,
      receipt_directory_identity: receiptIdentity, created_at: '2026-08-31T00:00:00Z',
    };
    const terminal = {
      ...active, source_sha: sourceSha,
      state: 'TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING',
      terminal_success_manifest: 'rollback-terminal-success-manifest.json',
      terminal_success_manifest_sha256: manifestDigest,
      prior_restart_policy_restoration_permitted: true,
      nonterminal_rollback_pointer: false, transitioned_at: '2026-08-31T00:01:00Z',
    };
    fs.writeFileSync(path.join(rootDir, '.kidults-rollback-active-v1.json'), `${JSON.stringify(terminal, null, 2)}\n`, { mode: 0o600 });
    const stageName = `.kidults-rollback-active-v1.terminal.${'b'.repeat(64)}.tmp`;
    fs.writeFileSync(path.join(rootDir, stageName), `${JSON.stringify(active, null, 2)}\n`, { mode: 0o600 });
    return { rootDir, stageName };
  };
  const runReentry = fixture => {
    const rootFd = fs.openSync(fixture.rootDir, fs.constants.O_RDONLY);
    try {
      return spawnSync('python3', ['-I', '-c', reentryCode, '3'], {
        encoding: 'utf8', timeout: 2_000, stdio: ['ignore', 'pipe', 'pipe', rootFd],
      });
    } finally {
      fs.closeSync(rootFd);
    }
  };
  const exact = prepareReentry('exact');
  const exactResult = runReentry(exact);
  terminalPointerReentryRecoveryCases += 1;
  if (
    exactResult.status === 0
    || !exactResult.stderr.includes('ROLLBACK_TERMINAL_CLEANUP_PENDING_HOLD')
    || !exactResult.stderr.includes('exchanged old-active stage reconciled and root fsynced')
    || fs.existsSync(path.join(exact.rootDir, exact.stageName))
  ) throw new Error(`terminal reentry did not reconcile exact exchanged stage before HOLD\n${exactResult.stdout}\n${exactResult.stderr}`);

  const divergent = prepareReentry('divergent', { divergentStage: true });
  const divergentResult = runReentry(divergent);
  terminalPointerReentryRecoveryCases += 1;
  if (divergentResult.status === 0 || !fs.existsSync(path.join(divergent.rootDir, divergent.stageName))) {
    throw new Error('terminal reentry removed a divergent exchanged stage');
  }

  const fifo = prepareReentry('fifo-pointer');
  const fifoPointer = path.join(fifo.rootDir, '.kidults-rollback-active-v1.json');
  fs.unlinkSync(fifoPointer);
  const fifoCreate = spawnSync('python3', ['-I', '-c', 'import os,sys; os.mkfifo(sys.argv[1], 0o600)', fifoPointer], { encoding: 'utf8' });
  if (fifoCreate.status !== 0) throw new Error(`reentry pointer FIFO fixture failed\n${fifoCreate.stderr}`);
  const fifoResult = runReentry(fifo);
  terminalPointerReentryRecoveryCases += 1;
  if (
    fifoResult.status === 0
    || fifoResult.signal === 'SIGTERM'
    || !fs.lstatSync(fifoPointer).isFIFO()
    || !fs.existsSync(path.join(fifo.rootDir, fifo.stageName))
  ) throw new Error(`terminal reentry blocked on or accepted a FIFO pointer\n${fifoResult.stdout}\n${fifoResult.stderr}`);
} finally {
  fs.rmSync(reentryTemp, { recursive: true, force: true });
}

let exactNameContainmentCases = 0;
const containmentFunctionStart = sources.rollback.indexOf('contain_exact_named_rollback_containers() {');
const containmentHeredoc = sources.rollback.indexOf("<<'PY'\n", containmentFunctionStart);
const containmentCodeStart = containmentHeredoc + "<<'PY'\n".length;
const containmentCodeEnd = sources.rollback.indexOf('\nPY\n}\n\nROLLBACK_PIN_ROOT_ID=', containmentCodeStart);
if (containmentFunctionStart < 0 || containmentHeredoc < 0 || containmentCodeEnd < 0) throw new Error('exact-name rollback containment is not extractable');
const containmentCode = adaptExtractedCodeToFixtureOwner(sources.rollback.slice(containmentCodeStart, containmentCodeEnd));
const containmentTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-exact-name-containment-'));
try {
  const mockBin = path.join(containmentTemp, 'bin');
  fs.mkdirSync(mockBin);
  const mockDocker = path.join(mockBin, 'docker');
  fs.writeFileSync(mockDocker, `#!/usr/bin/python3
import json, os, sys
args = sys.argv[1:]
mode = os.environ.get("MOCK_DOCKER_MODE", "present")
gateway = "a" * 64
scheduler = "b" * 64
if args[:3] == ["container", "ls", "-a"]:
    if mode == "enumeration-error":
        raise SystemExit(7)
    if mode == "absent":
        raise SystemExit(0)
    query = "gateway" if "kidults-gateway" in " ".join(args) else "scheduler"
    print((gateway if query == "gateway" else scheduler) + "\\t" + "kidults-" + query)
elif args and args[0] == "inspect":
    if mode == "inspect-error":
        raise SystemExit(8)
    identifier = args[1]
    role = "gateway" if identifier == gateway else "scheduler"
    name = "kidults-" + role if mode == "missing-leading-slash" else "/kidults-" + role
    print(json.dumps([{"Id": identifier, "Name": name, "HostConfig": {"RestartPolicy": {"Name": "no"}}, "State": {"Running": False, "Paused": False, "Restarting": False, "Pid": 0, "Status": "exited"}}]))
elif args and args[0] in {"update", "stop"}:
    raise SystemExit(0)
else:
    raise SystemExit(9)
`, { mode: 0o755 });
  const runContainment = mode => spawnSync('python3', ['-I', '-c', containmentCode], {
    encoding: 'utf8', timeout: 3_000,
    env: { ...process.env, PATH: `${mockBin}:${process.env.PATH}`, MOCK_DOCKER_MODE: mode },
  });
  const present = runContainment('present');
  exactNameContainmentCases += 1;
  if (present.status !== 0 || !present.stdout.startsWith(`EXACT_NAMED_PAIR_RESTART_DISABLED_AND_STOPPED\t${'a'.repeat(64)}\t${'b'.repeat(64)}`)) {
    throw new Error(`exact-name containment positive failed\n${present.stdout}\n${present.stderr}`);
  }
  const absent = runContainment('absent');
  exactNameContainmentCases += 1;
  if (absent.status !== 0 || absent.stdout.trim() !== 'NO_EXACT_NAMED_CONTAINERS_PRESENT_HOLD\tABSENT\tABSENT') {
    throw new Error(`exact-name containment absence failed\n${absent.stdout}\n${absent.stderr}`);
  }
  for (const [mode, expected] of [
    ['enumeration-error', 'EXACT_NAME_ENUMERATION_FAILED'],
    ['inspect-error', 'INSPECT_FAILED'],
    ['missing-leading-slash', 'ID_OR_NAME_REBOUND'],
  ]) {
    const result = runContainment(mode);
    exactNameContainmentCases += 1;
    if (result.status === 0 || !result.stderr.includes(expected) || result.stdout.includes('ABSENT')) {
      throw new Error(`Docker ${mode} was treated as absence or accepted\n${result.stdout}\n${result.stderr}`);
    }
  }
} finally {
  fs.rmSync(containmentTemp, { recursive: true, force: true });
}

let configurationRestoreFaultCases = 0;
const configurationRestoreStartMarker = "python3 -I - 8 10 4 <<'PY'\n";
const configurationRestoreStart = sources.rollback.indexOf(configurationRestoreStartMarker);
const configurationRestoreEndMarker = '\nPY\nappend_rollback_transaction_event "CONFIGURATION_COMMITTED"';
const configurationRestoreEnd = sources.rollback.indexOf(
  configurationRestoreEndMarker,
  configurationRestoreStart + configurationRestoreStartMarker.length,
);
if (configurationRestoreStart < 0 || configurationRestoreEnd < 0) throw new Error('configuration restore transaction is not extractable');
const configurationRestoreCode = adaptExtractedCodeToFixtureOwner(sources.rollback.slice(
  configurationRestoreStart + configurationRestoreStartMarker.length,
  configurationRestoreEnd,
));
const configurationRestoreTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-configuration-restore-'));
try {
  const sourceBytes = {
    'env.production.snapshot': Buffer.from('NEW_ENV=true\n'),
    'docker-compose.production.yml': Buffer.from('services:\n  restored: {}\n'),
  };
  const originalBytes = {
    '.env.production': Buffer.from('OLD_ENV=true\n'),
    'docker-compose.production.yml': Buffer.from('services:\n  failed: {}\n'),
  };
  const prepareTransaction = name => {
    const base = path.join(configurationRestoreTemp, name);
    const source = path.join(base, 'source');
    const destination = path.join(base, 'destination');
    const receipt = path.join(base, 'receipt');
    fs.mkdirSync(source, { recursive: true, mode: 0o700 });
    fs.mkdirSync(destination, { mode: 0o700 });
    fs.mkdirSync(receipt, { mode: 0o700 });
    for (const [member, bytes] of Object.entries(sourceBytes)) fs.writeFileSync(path.join(source, member), bytes, { mode: 0o600 });
    for (const [member, bytes] of Object.entries(originalBytes)) fs.writeFileSync(path.join(destination, member), bytes, { mode: 0o600 });
    const identities = Object.fromEntries(Object.keys(originalBytes).map(member => {
      const metadata = fs.statSync(path.join(destination, member));
      return [member, { dev: metadata.dev, ino: metadata.ino }];
    }));
    return { source, destination, receipt, identities };
  };
  const runConfigurationRestore = (fixture, { phase = '', guard = false } = {}) => {
    const sourceFd = fs.openSync(fixture.source, fs.constants.O_RDONLY);
    const destinationFd = fs.openSync(fixture.destination, fs.constants.O_RDONLY);
    const receiptFd = fs.openSync(fixture.receipt, fs.constants.O_RDONLY);
    const environment = { ...process.env };
    delete environment.KIDULTS_CONFIG_RESTORE_TEST_HOOKS;
    delete environment.KIDULTS_CONFIG_RESTORE_TEST_FAIL_PHASE;
    if (guard) environment.KIDULTS_CONFIG_RESTORE_TEST_HOOKS = 'ENABLED_FAIL_CLOSED_ONLY';
    if (phase) environment.KIDULTS_CONFIG_RESTORE_TEST_FAIL_PHASE = phase;
    try {
      return spawnSync('python3', ['-I', '-c', configurationRestoreCode, '3', '4', '5'], {
        encoding: 'utf8', env: environment,
        stdio: ['ignore', 'pipe', 'pipe', sourceFd, destinationFd, receiptFd],
      });
    } finally {
      fs.closeSync(receiptFd);
      fs.closeSync(destinationFd);
      fs.closeSync(sourceFd);
    }
  };
  const journalPhases = receipt => fs.readFileSync(path.join(receipt, 'configuration-restore-transaction-v1.jsonl'), 'utf8')
    .trim().split('\n').filter(Boolean).map(line => JSON.parse(line).phase);
  const positiveFixture = prepareTransaction('positive');
  const positive = runConfigurationRestore(positiveFixture);
  if (positive.status !== 0) throw new Error(`configuration restore positive failed\n${positive.stdout}\n${positive.stderr}`);
  for (const [destinationName, sourceName] of [['.env.production', 'env.production.snapshot'], ['docker-compose.production.yml', 'docker-compose.production.yml']]) {
    if (!fs.readFileSync(path.join(positiveFixture.destination, destinationName)).equals(sourceBytes[sourceName])) throw new Error(`configuration restore positive bytes mismatch: ${destinationName}`);
  }
  if (
    fs.existsSync(path.join(positiveFixture.destination, '.kidults-config-restore-transaction-v1.jsonl'))
    || fs.readdirSync(positiveFixture.destination).some(name => name.startsWith('.kidults-config-restore.') && name.endsWith('.tmp'))
    || !journalPhases(positiveFixture.receipt).includes('COMMITTED')
  ) throw new Error('configuration restore positive did not close its two-file transaction');

  const reversedFixture = prepareTransaction('partial-publish-reversed');
  const reversed = runConfigurationRestore(reversedFixture, { phase: 'after_first_publish', guard: true });
  configurationRestoreFaultCases += 1;
  if (reversed.status === 0 || !reversed.stderr.includes('CONFIG_RESTORE_INJECTED_FAILURE:after_first_publish')) {
    throw new Error(`configuration partial-publish fault did not fail\n${reversed.stdout}\n${reversed.stderr}`);
  }
  for (const [member, bytes] of Object.entries(originalBytes)) {
    const candidate = path.join(reversedFixture.destination, member);
    const metadata = fs.statSync(candidate);
    if (
      !fs.readFileSync(candidate).equals(bytes)
      || metadata.dev !== reversedFixture.identities[member].dev
      || metadata.ino !== reversedFixture.identities[member].ino
    ) throw new Error(`configuration reverse exchange did not restore exact original inode/bytes: ${member}`);
  }
  if (
    fs.existsSync(path.join(reversedFixture.destination, '.kidults-config-restore-transaction-v1.jsonl'))
    || fs.readdirSync(reversedFixture.destination).some(name => name.startsWith('.kidults-config-restore.') && name.endsWith('.tmp'))
    || journalPhases(reversedFixture.receipt).at(-1) !== 'ABORTED_ROLLED_BACK'
  ) throw new Error('configuration partial-publish reversal did not reach durable ABORTED_ROLLED_BACK closure');

  const holdFixture = prepareTransaction('reverse-failure-hold');
  const hold = runConfigurationRestore(holdFixture, { phase: 'after_first_publish_reverse_failure', guard: true });
  configurationRestoreFaultCases += 1;
  if (hold.status === 0 || !hold.stderr.includes('CONFIG_RESTORE_INJECTED_FAILURE:after_first_publish_reverse_failure')) {
    throw new Error(`configuration reverse-failure injection did not fail\n${hold.stdout}\n${hold.stderr}`);
  }
  if (
    !fs.existsSync(path.join(holdFixture.destination, '.kidults-config-restore-transaction-v1.jsonl'))
    || journalPhases(holdFixture.receipt).at(-1) !== 'ABORT_RECOVERY_HOLD'
    || !fs.readdirSync(holdFixture.destination).some(name => name.startsWith('.kidults-config-restore.') && name.endsWith('.tmp'))
  ) throw new Error('configuration reverse-exchange failure did not retain a deterministic HOLD journal and prior-inode temp');

  const unguardedFixture = prepareTransaction('unguarded');
  const unguarded = runConfigurationRestore(unguardedFixture, { phase: 'after_first_publish' });
  configurationRestoreFaultCases += 1;
  if (unguarded.status === 0 || !unguarded.stderr.includes('CONFIG_RESTORE_TEST_HOOK_FORBIDDEN')) {
    throw new Error('configuration restore test hook was usable without its fail-closed guard');
  }
} finally {
  fs.rmSync(configurationRestoreTemp, { recursive: true, force: true });
}

const restoreProofHeredocStart = '  python3 -I - 6 "restore-kidults-sqlite-rollback-v1.py" "${EXPECTED_SQLITE_RESTORE_HELPER_BLOB}" <<\'PY\'\n';
const restoreProofStart = sources.rollback.indexOf(restoreProofHeredocStart);
const restoreProofEndMarker = '\nPY\n}\n\ncreate_exclusive_receipt_directory_fd()';
const restoreProofEnd = sources.rollback.indexOf(restoreProofEndMarker, restoreProofStart + restoreProofHeredocStart.length);
if (restoreProofStart < 0 || restoreProofEnd < 0) throw new Error('SQLite restore helper preflight is not extractable for regression testing');
const restoreProofCode = adaptExtractedCodeToFixtureOwner(sources.rollback.slice(restoreProofStart + restoreProofHeredocStart.length, restoreProofEnd));
const gitBlobSha1 = raw => crypto.createHash('sha1').update(Buffer.concat([
  Buffer.from(`blob ${raw.length}\0`, 'ascii'), raw,
])).digest('hex');
let restoreHelperPreflightNegativeCases = 0;
const restoreProofTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-restore-helper-proof-'));
try {
  const helperName = 'restore-kidults-sqlite-rollback-v1.py';
  const helperPath = path.join(restoreProofTemp, helperName);
  const helperBytes = fs.readFileSync(sqliteRestoreHelperPath);
  const expectedBlob = gitBlobSha1(helperBytes);
  const runRestoreProof = blob => {
    const directoryFd = fs.openSync(restoreProofTemp, fs.constants.O_RDONLY);
    try {
      return spawnSync('python3', ['-I', '-c', restoreProofCode, '6', helperName, blob], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe', 'ignore', 'ignore', 'ignore', directoryFd],
      });
    } finally {
      fs.closeSync(directoryFd);
    }
  };
  const expectProofFailure = (label, blob, expectedError) => {
    const result = runRestoreProof(blob);
    restoreHelperPreflightNegativeCases += 1;
    if (result.status === 0 || !result.stderr.includes(expectedError)) {
      throw new Error(`SQLite restore helper preflight negative failed: ${label}\n${result.stdout}\n${result.stderr}`);
    }
  };

  fs.writeFileSync(helperPath, helperBytes, { mode: 0o644 });
  const positive = runRestoreProof(expectedBlob);
  if (positive.status !== 0) throw new Error(`SQLite restore helper preflight positive failed\n${positive.stdout}\n${positive.stderr}`);

  fs.chmodSync(helperPath, 0o664);
  expectProofFailure('group-writable-mode', expectedBlob, 'SQLITE_RESTORE_HELPER_PERMISSIONS_OR_IDENTITY');

  fs.chmodSync(helperPath, 0o644);
  fs.appendFileSync(helperPath, '# altered after signed source\n');
  expectProofFailure('signed-source-blob-drift', expectedBlob, 'SQLITE_RESTORE_HELPER_BLOB_MISMATCH');

  const invalidSyntax = Buffer.from('def invalid(:\n');
  fs.writeFileSync(helperPath, invalidSyntax, { mode: 0o644 });
  expectProofFailure('invalid-syntax-with-rebound-blob', gitBlobSha1(invalidSyntax), 'SyntaxError');

  const sentinelPath = path.join(restoreProofTemp, 'helper-symlink-sentinel.py');
  fs.writeFileSync(sentinelPath, helperBytes, { mode: 0o644 });
  fs.unlinkSync(helperPath);
  fs.symlinkSync(sentinelPath, helperPath);
  expectProofFailure('helper-symlink', expectedBlob, 'Too many levels of symbolic links');
  if (!fs.readFileSync(sentinelPath).equals(helperBytes) || !fs.lstatSync(helperPath).isSymbolicLink()) {
    throw new Error('SQLite restore helper preflight symlink rejection changed its sentinel');
  }
} finally {
  fs.rmSync(restoreProofTemp, { recursive: true, force: true });
}

const chainHeredocStart = '  python3 -I - "${candidate}" "${held_fd}" <<\'PY\'\n';
const chainStart = sources.rollback.indexOf(chainHeredocStart);
const chainEndMarker = '\nPY\n}\n\nverify_protected_database_parent_fd()';
const chainEnd = sources.rollback.indexOf(chainEndMarker, chainStart + chainHeredocStart.length);
if (chainStart < 0 || chainEnd < 0) throw new Error('protected rollback directory-chain validator is not extractable for regression testing');
const chainCode = sources.rollback.slice(chainStart + chainHeredocStart.length, chainEnd);
function runDirectoryChain(candidate, heldPath) {
  const descriptor = fs.openSync(heldPath, fs.constants.O_RDONLY);
  try {
    return spawnSync('python3', ['-I', '-c', chainCode, candidate, '3'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe', descriptor],
    });
  } finally {
    fs.closeSync(descriptor);
  }
}
let rollbackPinNegativeCases = 0;
const protectedRoot = runDirectoryChain('/', '/');
if (protectedRoot.status !== 0 || !/^[0-9]+:[0-9]+\n$/.test(protectedRoot.stdout)) {
  throw new Error(`protected root directory-chain positive control failed\n${protectedRoot.stdout}\n${protectedRoot.stderr}`);
}
for (const [name, candidate, heldPath, expected] of [
  ['stable-identity-substitution', '/', '/etc', 'PROTECTED_DIRECTORY_STABLE_IDENTITY_MISMATCH'],
  ['writable-ancestor', '/tmp', '/tmp', 'PROTECTED_DIRECTORY_ANCESTOR:tmp'],
  ['symlink-ancestor', '/proc/self', '/proc/self', 'Not a directory'],
]) {
  const result = runDirectoryChain(candidate, heldPath);
  rollbackPinNegativeCases += 1;
  if (result.status === 0 || !result.stderr.includes(expected)) {
    throw new Error(`rollback pin directory-chain negative failed: ${name}\n${result.stdout}\n${result.stderr}`);
  }
}

let rollbackReceiptNegativeCases = 0;
const receiptCreateStartMarker = '  python3 -I - 5 "${TIMESTAMP}" <<\'PY\'\n';
const receiptCreateStart = sources.rollback.indexOf(receiptCreateStartMarker);
const receiptCreateEndMarker = '\nPY\n}\n\ncopy_regular_path_to_receipt_fd()';
const receiptCreateEnd = sources.rollback.indexOf(receiptCreateEndMarker, receiptCreateStart + receiptCreateStartMarker.length);
if (receiptCreateStart < 0 || receiptCreateEnd < 0) throw new Error('exclusive rollback receipt directory creator is not extractable');
const receiptCreateCode = adaptExtractedCodeToFixtureOwner(sources.rollback.slice(receiptCreateStart + receiptCreateStartMarker.length, receiptCreateEnd));
const receiptCopyStartMarker = '  python3 -I - 4 "${source_path}" "${receipt_name}" <<\'PY\'\n';
const receiptCopyStart = sources.rollback.indexOf(receiptCopyStartMarker);
const receiptCopyEndMarker = '\nPY\n}\n\nrun_with_exclusive_receipt_stdout_fd()';
const receiptCopyEnd = sources.rollback.indexOf(receiptCopyEndMarker, receiptCopyStart + receiptCopyStartMarker.length);
if (receiptCopyStart < 0 || receiptCopyEnd < 0) throw new Error('exclusive rollback receipt member copier is not extractable');
const receiptCopyCode = adaptExtractedCodeToFixtureOwner(sources.rollback.slice(receiptCopyStart + receiptCopyStartMarker.length, receiptCopyEnd));
const receiptPrimitiveTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-receipt-primitives-'));
try {
  const rootDir = path.join(receiptPrimitiveTemp, 'root');
  const outsideDir = path.join(receiptPrimitiveTemp, 'outside');
  fs.mkdirSync(rootDir);
  fs.mkdirSync(outsideDir);
  const timestamp = '20260831T000000Z';
  const sentinelFile = path.join(outsideDir, 'sentinel');
  const sentinelDir = path.join(outsideDir, 'sentinel-dir');
  fs.writeFileSync(sentinelFile, 'receipt-sentinel\n', { mode: 0o640 });
  fs.mkdirSync(sentinelDir, { mode: 0o750 });
  const fingerprint = candidate => {
    const metadata = fs.statSync(candidate);
    return JSON.stringify({
      bytes: metadata.isFile() ? fs.readFileSync(candidate).toString('hex') : null,
      uid: metadata.uid, gid: metadata.gid, mode: metadata.mode & 0o7777,
    });
  };
  const sentinelFileFingerprint = fingerprint(sentinelFile);
  const sentinelDirFingerprint = fingerprint(sentinelDir);
  const runReceiptCreate = (code = receiptCreateCode) => {
    const rootFd = fs.openSync(rootDir, fs.constants.O_RDONLY);
    try {
      return spawnSync('python3', ['-I', '-c', code, '3', timestamp], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe', rootFd],
      });
    } finally {
      fs.closeSync(rootFd);
    }
  };
  const legacyPredictable = path.join(rootDir, `kidults-rollback-${timestamp}`);
  fs.symlinkSync(sentinelDir, legacyPredictable);
  const created = runReceiptCreate();
  if (created.status !== 0) throw new Error(`exclusive rollback receipt directory positive failed\n${created.stdout}\n${created.stderr}`);
  const createdName = created.stdout.trim();
  if (!new RegExp(`^kidults-rollback-${timestamp}-[0-9a-f]{64}$`).test(createdName)) throw new Error(`rollback receipt random name invalid: ${createdName}`);
  const createdMetadata = fs.statSync(path.join(rootDir, createdName));
  if (
    !createdMetadata.isDirectory()
    || (createdMetadata.mode & 0o7777) !== 0o700
    || !fs.lstatSync(legacyPredictable).isSymbolicLink()
    || fingerprint(sentinelDir) !== sentinelDirFingerprint
  ) throw new Error('exclusive rollback receipt directory touched predictable-name sentinel or has unsafe mode');

  const collisionSuffix = 'c'.repeat(64);
  const collisionName = `kidults-rollback-${timestamp}-${collisionSuffix}`;
  fs.symlinkSync(sentinelDir, path.join(rootDir, collisionName));
  const forcedCollisionCode = receiptCreateCode.replace('secrets.token_hex(32)', "'c' * 64");
  const collision = runReceiptCreate(forcedCollisionCode);
  rollbackReceiptNegativeCases += 1;
  if (collision.status === 0 || !collision.stderr.includes('ROLLBACK_RECEIPT_RANDOM_DIRECTORY_EXHAUSTED')) {
    throw new Error(`rollback receipt directory collision was not fail closed\n${collision.stdout}\n${collision.stderr}`);
  }
  if (!fs.lstatSync(path.join(rootDir, collisionName)).isSymbolicLink() || fingerprint(sentinelDir) !== sentinelDirFingerprint) {
    throw new Error('rollback receipt directory collision changed outside sentinel');
  }

  const heldPath = path.join(rootDir, `${createdName}.held`);
  const createdPath = path.join(rootDir, createdName);
  const heldFd = fs.openSync(createdPath, fs.constants.O_RDONLY);
  fs.renameSync(createdPath, heldPath);
  fs.symlinkSync(sentinelDir, createdPath);
  const rootFd = fs.openSync(rootDir, fs.constants.O_RDONLY);
  const identitySubstitution = spawnSync('python3', ['-I', '-c', [
    'import os,stat,sys',
    'root_fd=int(sys.argv[1]); held_fd=int(sys.argv[2]); name=sys.argv[3]',
    'entry=os.stat(name,dir_fd=root_fd,follow_symlinks=False); held=os.fstat(held_fd)',
    'raise SystemExit(0 if stat.S_ISDIR(entry.st_mode) and (entry.st_dev,entry.st_ino)==(held.st_dev,held.st_ino) else "ROLLBACK_RECEIPT_DIRECTORY_STABLE_IDENTITY_MISMATCH")',
  ].join('\n'), '3', '4', createdName], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe', rootFd, heldFd],
  });
  fs.closeSync(rootFd);
  fs.closeSync(heldFd);
  rollbackReceiptNegativeCases += 1;
  if (identitySubstitution.status === 0 || !identitySubstitution.stderr.includes('ROLLBACK_RECEIPT_DIRECTORY_STABLE_IDENTITY_MISMATCH')) {
    throw new Error(`rollback receipt directory substitution was not rejected\n${identitySubstitution.stdout}\n${identitySubstitution.stderr}`);
  }
  if (fingerprint(sentinelDir) !== sentinelDirFingerprint) throw new Error('rollback receipt directory substitution changed sentinel');

  const safeReceiptDir = heldPath;
  const sourcePath = path.join(receiptPrimitiveTemp, 'source');
  fs.writeFileSync(sourcePath, 'safe-receipt-source\n', { mode: 0o600 });
  const runReceiptCopy = memberName => {
    const receiptFd = fs.openSync(safeReceiptDir, fs.constants.O_RDONLY);
    try {
      return spawnSync('python3', ['-I', '-c', receiptCopyCode, '3', sourcePath, memberName], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe', receiptFd],
      });
    } finally {
      fs.closeSync(receiptFd);
    }
  };
  fs.symlinkSync(sentinelFile, path.join(safeReceiptDir, 'member-symlink'));
  const memberSymlink = runReceiptCopy('member-symlink');
  rollbackReceiptNegativeCases += 1;
  if (memberSymlink.status === 0 || fingerprint(sentinelFile) !== sentinelFileFingerprint || !fs.lstatSync(path.join(safeReceiptDir, 'member-symlink')).isSymbolicLink()) {
    throw new Error('rollback receipt member symlink collision was not fail closed');
  }
  fs.writeFileSync(path.join(safeReceiptDir, 'member-regular'), 'preexisting\n', { mode: 0o600 });
  const memberRegular = runReceiptCopy('member-regular');
  rollbackReceiptNegativeCases += 1;
  if (memberRegular.status === 0 || fs.readFileSync(path.join(safeReceiptDir, 'member-regular'), 'utf8') !== 'preexisting\n') {
    throw new Error('rollback receipt regular member collision was not fail closed');
  }
  const memberPositive = runReceiptCopy('member-positive');
  const memberPositiveMetadata = fs.statSync(path.join(safeReceiptDir, 'member-positive'));
  if (memberPositive.status !== 0 || fs.readFileSync(path.join(safeReceiptDir, 'member-positive'), 'utf8') !== 'safe-receipt-source\n' || (memberPositiveMetadata.mode & 0o7777) !== 0o600) {
    throw new Error(`rollback receipt member positive failed\n${memberPositive.stdout}\n${memberPositive.stderr}`);
  }
} finally {
  fs.rmSync(receiptPrimitiveTemp, { recursive: true, force: true });
}

let containerQuiescenceNegativeCases = 0;
const quiescenceStartMarker = '  python3 -I - "${CURRENT_GATEWAY_CONTAINER_ID}" "${CURRENT_SCHEDULER_CONTAINER_ID}" 4 "${receipt_name}" <<\'PY\'\n';
const quiescenceStart = sources.rollback.indexOf(quiescenceStartMarker);
const quiescenceEndMarker = '\nPY\n}\n\nverify_sqlite_sidecar_namespace_absent_fd() {';
const quiescenceEnd = sources.rollback.indexOf(quiescenceEndMarker, quiescenceStart + quiescenceStartMarker.length);
if (quiescenceStart < 0 || quiescenceEnd < 0) throw new Error('rollback container quiescence proof is not extractable');
const quiescenceCode = adaptExtractedCodeToFixtureOwner(sources.rollback.slice(quiescenceStart + quiescenceStartMarker.length, quiescenceEnd));
const quiescenceTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-container-quiescence-'));
try {
  const mockBin = path.join(quiescenceTemp, 'bin');
  const receiptDir = path.join(quiescenceTemp, 'receipt');
  fs.mkdirSync(mockBin);
  fs.mkdirSync(receiptDir);
  const mockDocker = path.join(mockBin, 'docker');
  fs.writeFileSync(mockDocker, '#!/usr/bin/env bash\nif [[ "${MOCK_DOCKER_EXIT:-0}" != 0 ]]; then exit "${MOCK_DOCKER_EXIT}"; fi\nprintf "%s" "${MOCK_DOCKER_JSON}"\n', { mode: 0o755 });
  const gatewayId = 'a'.repeat(64);
  const schedulerId = 'b'.repeat(64);
  const stoppedState = { Running: false, Paused: false, Restarting: false, Pid: 0, Status: 'exited' };
  const validPayload = [
    { Id: gatewayId, Name: '/kidults-gateway', State: { ...stoppedState } },
    { Id: schedulerId, Name: '/kidults-scheduler', State: { ...stoppedState } },
  ];
  const runQuiescence = (payload, { exitCode = 0, receiptName = '' } = {}) => {
    const receiptFd = fs.openSync(receiptDir, fs.constants.O_RDONLY);
    try {
      return spawnSync('python3', ['-I', '-c', quiescenceCode, gatewayId, schedulerId, '3', receiptName], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${mockBin}:${process.env.PATH}`, MOCK_DOCKER_EXIT: String(exitCode), MOCK_DOCKER_JSON: JSON.stringify(payload) },
        stdio: ['ignore', 'pipe', 'pipe', receiptFd],
      });
    } finally {
      fs.closeSync(receiptFd);
    }
  };
  const quiescent = runQuiescence(validPayload);
  if (quiescent.status !== 0 || !quiescent.stdout.includes('ROLLBACK_RUNTIME_QUIESCENCE_PASS')) {
    throw new Error(`rollback container quiescence positive failed\n${quiescent.stdout}\n${quiescent.stderr}`);
  }
  const negativeStates = [
    ['inspect-error', validPayload, { exitCode: 7 }, 'ROLLBACK_CONTAINER_INSPECT_FAILED'],
    ['running', [{ ...validPayload[0], State: { ...stoppedState, Running: true, Pid: 42, Status: 'running' } }, validPayload[1]], {}, 'ROLLBACK_CONTAINER_NOT_QUIESCENT'],
    ['paused', [{ ...validPayload[0], State: { ...stoppedState, Paused: true } }, validPayload[1]], {}, 'ROLLBACK_CONTAINER_NOT_QUIESCENT'],
    ['restarting', [{ ...validPayload[0], State: { ...stoppedState, Restarting: true } }, validPayload[1]], {}, 'ROLLBACK_CONTAINER_NOT_QUIESCENT'],
    ['pid-remains', [{ ...validPayload[0], State: { ...stoppedState, Pid: 1 } }, validPayload[1]], {}, 'ROLLBACK_CONTAINER_NOT_QUIESCENT'],
    ['dead-status', [{ ...validPayload[0], State: { ...stoppedState, Status: 'dead' } }, validPayload[1]], {}, 'ROLLBACK_CONTAINER_NOT_QUIESCENT'],
    ['name-rebound', [{ ...validPayload[0], Name: '/attacker-rebound' }, validPayload[1]], {}, 'ROLLBACK_CONTAINER_ID_OR_NAME_REBOUND'],
    ['duplicate-closure', [validPayload[0], validPayload[0]], {}, 'ROLLBACK_CONTAINER_ID_OR_NAME_REBOUND'],
  ];
  for (const [label, payload, options, expected] of negativeStates) {
    const result = runQuiescence(payload, options);
    containerQuiescenceNegativeCases += 1;
    if (result.status === 0 || !result.stderr.includes(expected)) {
      throw new Error(`rollback container quiescence negative failed: ${label}\n${result.stdout}\n${result.stderr}`);
    }
  }
  const outsideSentinel = path.join(quiescenceTemp, 'outside-sentinel');
  fs.writeFileSync(outsideSentinel, 'quiescence-sentinel\n', { mode: 0o640 });
  fs.symlinkSync(outsideSentinel, path.join(receiptDir, 'container-quiescence-test.json'));
  const collision = runQuiescence(validPayload, { receiptName: 'container-quiescence-test.json' });
  containerQuiescenceNegativeCases += 1;
  if (collision.status === 0 || fs.readFileSync(outsideSentinel, 'utf8') !== 'quiescence-sentinel\n' || !fs.lstatSync(path.join(receiptDir, 'container-quiescence-test.json')).isSymbolicLink()) {
    throw new Error('rollback container quiescence receipt collision changed outside sentinel');
  }
} finally {
  fs.rmSync(quiescenceTemp, { recursive: true, force: true });
}

let prestartSqliteSidecarHeldFdCases = 0;
const sidecarScanStartMarker = '  python3 -I - 7 "$(basename "${PROD_DB}")" <<\'PY\'\n';
const sidecarFunctionStart = sources.rollback.indexOf('verify_sqlite_sidecar_namespace_absent_fd() {');
const sidecarScanStart = sources.rollback.indexOf(sidecarScanStartMarker, sidecarFunctionStart);
const sidecarScanEndMarker = '\nPY\n}\n\ncontain_exact_named_rollback_containers() {';
const sidecarScanEnd = sources.rollback.indexOf(sidecarScanEndMarker, sidecarScanStart + sidecarScanStartMarker.length);
if (sidecarFunctionStart < 0 || sidecarScanStart < 0 || sidecarScanEnd < 0) throw new Error('rollback prestart SQLite sidecar held-fd proof is not extractable');
const sidecarScanCode = adaptExtractedCodeToFixtureOwner(sources.rollback.slice(sidecarScanStart + sidecarScanStartMarker.length, sidecarScanEnd));
const sidecarScanTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-prestart-sidecar-held-fd-'));
try {
  const runScan = (directory, cwd) => {
    const heldFd = fs.openSync(directory, fs.constants.O_RDONLY);
    try {
      return spawnSync('python3', ['-I', '-c', sidecarScanCode, '3', 'kaios.db'], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe', heldFd],
      });
    } finally {
      fs.closeSync(heldFd);
    }
  };
  const cleanDir = path.join(sidecarScanTemp, 'held-clean');
  const poisonedCwd = path.join(sidecarScanTemp, 'cwd-poisoned');
  fs.mkdirSync(cleanDir);
  fs.mkdirSync(poisonedCwd);
  fs.writeFileSync(path.join(poisonedCwd, 'kaios.db-wal'), 'cwd-only-poison\n', { mode: 0o600 });
  const clean = runScan(cleanDir, poisonedCwd);
  prestartSqliteSidecarHeldFdCases += 1;
  if (clean.status !== 0 || !clean.stdout.includes('ROLLBACK_SQLITE_SIDECAR_NAMESPACE_ABSENT')) {
    throw new Error(`rollback prestart sidecar scan did not use the supplied clean directory fd\n${clean.stdout}\n${clean.stderr}`);
  }

  const knownDir = path.join(sidecarScanTemp, 'held-known');
  fs.mkdirSync(knownDir);
  fs.writeFileSync(path.join(knownDir, 'kaios.db-wal'), 'held-known\n', { mode: 0o600 });
  const known = runScan(knownDir, cleanDir);
  prestartSqliteSidecarHeldFdCases += 1;
  if (known.status === 0 || !known.stderr.includes('ROLLBACK_SQLITE_KNOWN_SIDECAR_REAPPEARED:kaios.db-wal')) {
    throw new Error(`rollback prestart held-fd known sidecar was not rejected\n${known.stdout}\n${known.stderr}`);
  }

  const unknownDir = path.join(sidecarScanTemp, 'held-unknown');
  fs.mkdirSync(unknownDir);
  fs.writeFileSync(path.join(unknownDir, 'kaios.db-unexpected'), 'held-unknown\n', { mode: 0o600 });
  const unknown = runScan(unknownDir, cleanDir);
  prestartSqliteSidecarHeldFdCases += 1;
  if (unknown.status === 0 || !unknown.stderr.includes('ROLLBACK_SQLITE_UNKNOWN_SIDECAR_NAMESPACE:kaios.db-unexpected')) {
    throw new Error(`rollback prestart held-fd unknown sidecar was not rejected\n${unknown.stdout}\n${unknown.stderr}`);
  }
} finally {
  fs.rmSync(sidecarScanTemp, { recursive: true, force: true });
}

let mutationCases = 0;
for (const [name, markers] of Object.entries(requiredMarkers)) {
  for (const marker of markers) {
    const mutated = { ...sources, [name]: sources[name].split(marker).join(`REMOVED_${crypto.randomUUID()}`) };
    mutationCases += 1;
    if (validateText(mutated).length === 0) throw new Error(`rollback mutation guard missed ${name}:${marker}`);
  }
}
{
  const mutated = { ...sources, promotion: sources.promotion.replace('readonly BASE_URL="https://kaios.kidults.com"', 'BASE_URL="${BASE_URL:-https://kaios.kidults.com}"') };
  mutationCases += 1;
  if (!validateText(mutated).includes('promotion:environment-overridable-production-origin')) throw new Error('rollback mutation guard missed environment-overridable Production origin');
}
{
  const mutated = { ...sources, rollback: sources.rollback.replace('  || fail "Production rollback container stop failed"', '  || true') };
  mutationCases += 1;
  if (!validateText(mutated).includes('rollback:container-stop-failure-ignored')) throw new Error('rollback mutation guard missed ignored container-stop failure');
}
{
  const mutated = { ...sources, rollback: sources.rollback.replace(
    'readonly ROLLBACK_RECEIPT_ROOT="/mnt/ih_prod_01/backups/production-certification/rollback-receipts"',
    'ROLLBACK_RECEIPT_ROOT="${ROLLBACK_RECEIPT_ROOT:-/mnt/ih_prod_01/backups/production-certification/rollback-receipts}"',
  ) };
  mutationCases += 1;
  if (!validateText(mutated).includes('rollback:environment-overridable-receipt-root')) throw new Error('rollback mutation guard missed environment-overridable receipt root');
}

let databaseRestoreNegativeCases = 0;
const restoreTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-sqlite-restore-validator-'));
try {
  const sourceDir = path.join(restoreTemp, 'source');
  const destinationDir = path.join(restoreTemp, 'destination');
  const receiptDir = path.join(restoreTemp, 'receipt');
  const outsideDir = path.join(restoreTemp, 'outside');
  fs.mkdirSync(sourceDir);
  fs.mkdirSync(destinationDir);
  fs.mkdirSync(receiptDir);
  fs.mkdirSync(outsideDir);
  const sourceDatabase = path.join(sourceDir, 'kaios.db');
  const destinationDatabase = path.join(destinationDir, 'kaios.db');
  const sentinel = path.join(outsideDir, 'must-not-change');
  const legacyPredictableTemp = path.join(destinationDir, 'kaios.db.rollback.20260831T000000Z.tmp');
  const collisionTemp = path.join(destinationDir, '.kaios.db.restore.test-collision.tmp');
  const sourceBytes = Buffer.from('signed-rollback-database\n');
  const oldDestinationBytes = Buffer.from('failed-production-database\n');
  fs.writeFileSync(sourceDatabase, sourceBytes, { mode: 0o600 });
  fs.writeFileSync(destinationDatabase, oldDestinationBytes, { mode: 0o600 });
  fs.writeFileSync(sentinel, 'sentinel-must-not-change\n', { mode: 0o640 });
  fs.symlinkSync(sentinel, legacyPredictableTemp);
  const expectedDigest = `sha256:${crypto.createHash('sha256').update(sourceBytes).digest('hex')}`;
  const sourceMetadata = fs.statSync(sourceDatabase);
  const restoreUid = sourceMetadata.uid;
  const restoreGid = sourceMetadata.gid;
  const sentinelFingerprint = () => {
    const metadata = fs.statSync(sentinel);
    return {
      bytes: fs.readFileSync(sentinel).toString('hex'),
      uid: metadata.uid,
      gid: metadata.gid,
      mode: metadata.mode & 0o7777,
    };
  };
  const originalSentinel = sentinelFingerprint();
  const removeEntry = candidate => {
    try { fs.unlinkSync(candidate); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
  const resetSource = () => {
    removeEntry(sourceDatabase);
    fs.writeFileSync(sourceDatabase, sourceBytes, { mode: 0o600 });
  };
  const resetDestination = () => {
    removeEntry(destinationDatabase);
    fs.writeFileSync(destinationDatabase, oldDestinationBytes, { mode: 0o600 });
  };
  const clearReceipt = () => {
    for (const name of fs.readdirSync(receiptDir)) fs.unlinkSync(path.join(receiptDir, name));
  };
  const runRestore = ({ expected = expectedDigest, testTempName, testFailPhase, enableTestHook = false, timeout = undefined } = {}) => {
    const sourceFd = fs.openSync(sourceDir, fs.constants.O_RDONLY);
    const destinationFd = fs.openSync(destinationDir, fs.constants.O_RDONLY);
    const receiptFd = fs.openSync(receiptDir, fs.constants.O_RDONLY);
    const environment = { ...process.env };
    delete environment.KIDULTS_SQLITE_RESTORE_TEST_HOOKS;
    if (enableTestHook) environment.KIDULTS_SQLITE_RESTORE_TEST_HOOKS = 'ENABLED_FAIL_CLOSED_ONLY';
    const args = [
      '-I', sqliteRestoreHelperPath,
      '--source-dir-fd', '3', '--source-name', 'kaios.db',
      '--destination-dir-fd', '4', '--destination-name', 'kaios.db',
      '--receipt-dir-fd', '5',
      '--expected-sha256', expected,
      '--uid', String(restoreUid), '--gid', String(restoreGid), '--mode', '0600',
    ];
    if (testTempName) args.push('--test-temp-name', testTempName);
    if (testFailPhase) args.push('--test-fail-phase', testFailPhase);
    try {
      return spawnSync('python3', args, {
        encoding: 'utf8',
        timeout,
        env: environment,
        stdio: ['ignore', 'pipe', 'pipe', sourceFd, destinationFd, receiptFd],
      });
    } finally {
      fs.closeSync(receiptFd);
      fs.closeSync(destinationFd);
      fs.closeSync(sourceFd);
    }
  };
  const expectRestoreFailure = (label, options, expectedError) => {
    const result = runRestore(options);
    databaseRestoreNegativeCases += 1;
    if (result.status === 0 || !result.stderr.includes(expectedError)) {
      throw new Error(`SQLite restore negative failed: ${label}\n${result.stdout}\n${result.stderr}`);
    }
    if (JSON.stringify(sentinelFingerprint()) !== JSON.stringify(originalSentinel)) {
      throw new Error(`SQLite restore negative changed outside sentinel: ${label}`);
    }
    return result;
  };

  const sidecarFixtures = {
    'kaios.db-wal': Buffer.from('stale-wal\n'),
    'kaios.db-shm': Buffer.from('stale-shm\n'),
    'kaios.db-journal': Buffer.from('stale-journal\n'),
  };
  for (const [name, bytes] of Object.entries(sidecarFixtures)) fs.writeFileSync(path.join(destinationDir, name), bytes, { mode: 0o600 });
  const positiveRestore = runRestore();
  if (positiveRestore.status !== 0 || !positiveRestore.stdout.includes(`SQLITE_ROLLBACK_RESTORE_PASS ${expectedDigest}`)) {
    throw new Error(`SQLite restore positive failed\n${positiveRestore.stdout}\n${positiveRestore.stderr}`);
  }
  const positiveMetadata = fs.statSync(destinationDatabase);
  if (
    !fs.readFileSync(destinationDatabase).equals(sourceBytes)
    || (positiveMetadata.mode & 0o7777) !== 0o600
    || positiveMetadata.uid !== restoreUid
    || positiveMetadata.gid !== restoreGid
    || !positiveRestore.stdout.includes('quarantined_sidecars=3')
    || !fs.lstatSync(legacyPredictableTemp).isSymbolicLink()
    || JSON.stringify(sentinelFingerprint()) !== JSON.stringify(originalSentinel)
  ) {
    throw new Error('SQLite restore positive did not preserve exact bytes/metadata or predictable-name sentinel');
  }
  for (const [name, bytes] of Object.entries(sidecarFixtures)) {
    if (fs.existsSync(path.join(destinationDir, name))) throw new Error(`SQLite restore left stale sidecar ${name}`);
    const receiptName = `failed-${name}`;
    if (!fs.readFileSync(path.join(receiptDir, receiptName)).equals(bytes)) throw new Error(`SQLite restore sidecar receipt bytes mismatch ${name}`);
    const expectedChecksum = `${crypto.createHash('sha256').update(bytes).digest('hex')}  ${receiptName}\n`;
    if (fs.readFileSync(path.join(receiptDir, `${receiptName}.sha256`), 'utf8') !== expectedChecksum) throw new Error(`SQLite restore sidecar checksum mismatch ${name}`);
  }
  clearReceipt();

  const resetSidecars = () => {
    for (const name of Object.keys(sidecarFixtures)) removeEntry(path.join(destinationDir, name));
    for (const name of fs.readdirSync(destinationDir)) {
      if (name.startsWith('.kaios.db.sidecar-quarantine.')) removeEntry(path.join(destinationDir, name));
    }
    removeEntry(path.join(destinationDir, '.kaios.db.restore.transaction-v1.jsonl'));
    for (const [name, bytes] of Object.entries(sidecarFixtures)) fs.writeFileSync(path.join(destinationDir, name), bytes, { mode: 0o600 });
  };
  for (const phase of [
    'after_first_sidecar_receipt_pair',
    'before_sidecar_receipt_directory_fsync',
    'after_sidecar_receipt_directory_fsync',
    'after_first_sidecar_quarantine_rename',
    'before_main_database_publish',
  ]) {
    resetDestination();
    resetSidecars();
    clearReceipt();
    expectRestoreFailure(
      `fault-${phase}`,
      { testFailPhase: phase, enableTestHook: true },
      `SQLITE_RESTORE_INJECTED_FAILURE:${phase}`,
    );
    if (!fs.readFileSync(destinationDatabase).equals(oldDestinationBytes)) throw new Error(`SQLite restore prepublish fault changed main database: ${phase}`);
    if (fs.existsSync(path.join(destinationDir, '.kaios.db.restore.transaction-v1.jsonl'))) throw new Error(`SQLite restore prepublish fault left active destination journal: ${phase}`);
    for (const [name, bytes] of Object.entries(sidecarFixtures)) {
      if (!fs.existsSync(path.join(destinationDir, name)) || !fs.readFileSync(path.join(destinationDir, name)).equals(bytes)) {
        throw new Error(`SQLite restore prepublish fault lost sidecar ${name}: ${phase}`);
      }
    }
  }

  resetDestination();
  resetSidecars();
  clearReceipt();
  expectRestoreFailure(
    'fault-after-main-database-publish',
    { testFailPhase: 'after_main_database_publish', enableTestHook: true },
    'SQLITE_RESTORE_INJECTED_FAILURE:after_main_database_publish',
  );
  if (!fs.readFileSync(destinationDatabase).equals(sourceBytes)) throw new Error('SQLite restore postpublish fault did not preserve published known-good database');
  if (!fs.existsSync(path.join(destinationDir, '.kaios.db.restore.transaction-v1.jsonl'))) throw new Error('SQLite restore postpublish fault lost durable HOLD journal');
  for (const name of Object.keys(sidecarFixtures)) {
    if (fs.existsSync(path.join(destinationDir, name))) throw new Error(`SQLite restore postpublish fault restored stale sidecar ${name}`);
  }
  expectRestoreFailure('preexisting-postpublish-journal', {}, 'SQLITE_RESTORE_PREEXISTING_TRANSACTION_JOURNAL_HOLD');

  resetDestination();
  for (const name of Object.keys(sidecarFixtures)) removeEntry(path.join(destinationDir, name));
  for (const name of fs.readdirSync(destinationDir)) {
    if (name.startsWith('.kaios.db.sidecar-quarantine.')) removeEntry(path.join(destinationDir, name));
  }
  removeEntry(path.join(destinationDir, '.kaios.db.restore.transaction-v1.jsonl'));
  clearReceipt();

  removeEntry(destinationDatabase);
  fs.symlinkSync(sentinel, destinationDatabase);
  expectRestoreFailure('destination-symlink', {}, 'SQLITE_RESTORE_DESTINATION_NOT_REGULAR');
  if (!fs.lstatSync(destinationDatabase).isSymbolicLink()) throw new Error('SQLite restore replaced destination symlink on rejection');

  resetDestination();
  clearReceipt();
  fs.symlinkSync(sentinel, collisionTemp);
  expectRestoreFailure(
    'exclusive-temp-collision',
    { testTempName: path.basename(collisionTemp), enableTestHook: true },
    'SQLITE_RESTORE_TEMP_COLLISION',
  );
  if (!fs.readFileSync(destinationDatabase).equals(oldDestinationBytes) || !fs.lstatSync(collisionTemp).isSymbolicLink()) {
    throw new Error('SQLite restore collision changed destination or collision sentinel');
  }

  expectRestoreFailure(
    'test-hook-without-guard',
    { testTempName: path.basename(collisionTemp) },
    'SQLITE_RESTORE_TEST_HOOK_FORBIDDEN',
  );

  removeEntry(collisionTemp);
  removeEntry(sourceDatabase);
  fs.symlinkSync(sentinel, sourceDatabase);
  expectRestoreFailure('source-symlink', {}, 'SQLITE_RESTORE_SOURCE_OPEN_FAILED');
  if (!fs.readFileSync(destinationDatabase).equals(oldDestinationBytes)) throw new Error('SQLite restore source-symlink rejection changed destination');

  removeEntry(sourceDatabase);
  const sourceFifo = spawnSync('python3', ['-I', '-c', 'import os,sys; os.mkfifo(sys.argv[1], 0o600)', sourceDatabase], { encoding: 'utf8' });
  if (sourceFifo.status !== 0) throw new Error(`SQLite restore source FIFO fixture failed\n${sourceFifo.stderr}`);
  expectRestoreFailure('source-fifo', { timeout: 2_000 }, 'SQLITE_RESTORE_SOURCE_NOT_REGULAR');
  if (!fs.lstatSync(sourceDatabase).isFIFO() || !fs.readFileSync(destinationDatabase).equals(oldDestinationBytes)) {
    throw new Error('SQLite restore source-FIFO rejection changed destination');
  }

  resetSource();
  resetDestination();
  clearReceipt();
  expectRestoreFailure('source-digest-mismatch', { expected: `sha256:${'f'.repeat(64)}` }, 'SQLITE_RESTORE_SOURCE_DIGEST_MISMATCH');
  if (!fs.readFileSync(destinationDatabase).equals(oldDestinationBytes)) throw new Error('SQLite restore digest rejection changed destination');
  const unexpectedTemps = fs.readdirSync(destinationDir).filter(name => name.startsWith('.kaios.db.restore.'));
  if (unexpectedTemps.length !== 0) throw new Error(`SQLite restore left temporary entries: ${unexpectedTemps.join(',')}`);

  resetDestination();
  clearReceipt();
  const walPath = path.join(destinationDir, 'kaios.db-wal');
  fs.symlinkSync(sentinel, walPath);
  expectRestoreFailure('sidecar-symlink', {}, 'SQLITE_RESTORE_SIDECAR_NOT_REGULAR:-wal');
  if (!fs.lstatSync(walPath).isSymbolicLink() || !fs.readFileSync(destinationDatabase).equals(oldDestinationBytes)) {
    throw new Error('SQLite restore sidecar-symlink rejection changed destination state');
  }

  removeEntry(walPath);
  fs.writeFileSync(path.join(destinationDir, 'kaios.db-unknown'), 'unknown-sidecar\n', { mode: 0o600 });
  expectRestoreFailure('unknown-sidecar-namespace', {}, 'SQLITE_RESTORE_UNKNOWN_SIDECAR_NAMESPACE');
  if (!fs.readFileSync(destinationDatabase).equals(oldDestinationBytes)) throw new Error('SQLite restore unknown-sidecar rejection published database');

  removeEntry(path.join(destinationDir, 'kaios.db-unknown'));
  fs.writeFileSync(walPath, 'unsafe-mode-wal\n', { mode: 0o660 });
  fs.chmodSync(walPath, 0o660);
  expectRestoreFailure('sidecar-unsafe-mode', {}, 'SQLITE_RESTORE_SIDECAR_METADATA_OR_IDENTITY_INVALID');
  if (!fs.existsSync(walPath) || !fs.readFileSync(destinationDatabase).equals(oldDestinationBytes)) {
    throw new Error('SQLite restore unsafe-sidecar-mode rejection removed sidecar or published database');
  }

  removeEntry(walPath);
  fs.linkSync(sentinel, walPath);
  expectRestoreFailure('sidecar-hardlink', {}, 'SQLITE_RESTORE_SIDECAR_METADATA_OR_IDENTITY_INVALID');
  if (!fs.existsSync(walPath) || !fs.readFileSync(destinationDatabase).equals(oldDestinationBytes)) {
    throw new Error('SQLite restore sidecar-hardlink rejection removed sidecar or published database');
  }

  removeEntry(walPath);
  fs.writeFileSync(walPath, 'stale-wal\n', { mode: 0o600 });
  fs.symlinkSync(sentinel, path.join(receiptDir, 'failed-kaios.db-wal'));
  expectRestoreFailure('sidecar-receipt-member-collision', {}, 'SQLITE_RESTORE_SIDECAR_RECEIPT_COLLISION');
  if (!fs.existsSync(walPath) || !fs.readFileSync(destinationDatabase).equals(oldDestinationBytes)) {
    throw new Error('SQLite restore sidecar receipt collision removed sidecar or published database');
  }
} finally {
  fs.rmSync(restoreTemp, { recursive: true, force: true });
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-rollback-validator-'));
try {
  const snapshotDir = path.join(temp, 'snapshot');
  const prodRoot = path.join(temp, 'prod');
  const dataDir = path.join(temp, 'data');
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.mkdirSync(prodRoot, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  for (const args of [
    ['init', '--quiet'],
    ['config', 'user.name', 'Kidults Synthetic Validator'],
    ['config', 'user.email', 'kidults-validator@example.invalid'],
  ]) {
    const git = spawnSync('git', args, { cwd: prodRoot, encoding: 'utf8' });
    if (git.status !== 0) throw new Error(`synthetic Production git setup failed: git ${args.join(' ')}\n${git.stderr}`);
  }
  fs.writeFileSync(path.join(prodRoot, 'tracked-runtime.txt'), 'synthetic-runtime\n');
  for (const args of [['add', 'tracked-runtime.txt'], ['commit', '--quiet', '-m', 'synthetic runtime']]) {
    const git = spawnSync('git', args, { cwd: prodRoot, encoding: 'utf8' });
    if (git.status !== 0) throw new Error(`synthetic Production git commit failed: git ${args.join(' ')}\n${git.stderr}`);
  }
  const syntheticSourceSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: prodRoot, encoding: 'utf8' }).stdout.trim();

  const required = [
    'kaios.db', 'kaios.db.sha256', 'database-metadata.tsv', 'database-integrity.txt',
    'env.production.snapshot', 'env.production.snapshot.sha256', 'docker-compose.production.yml',
    'docker-compose.production.yml.sha256', 'docker-inspect.json', 'rollback-images.json',
    'rollback-images.tar', 'rollback-images.tar.sha256', 'rollback-plan.txt',
  ];
  const capturedAt = '2026-08-31T00:00:00Z';
  const write = (name, content) => fs.writeFileSync(path.join(snapshotDir, name), content);
  write('kaios.db', 'synthetic-db');
  write('database-metadata.tsv', `${capturedAt}\t1000\t1000\t0600\n`);
  write('database-integrity.txt', 'ok\n');
  write('env.production.snapshot', 'SYNTHETIC=true\n');
  write('docker-compose.production.yml', 'services: {}\n');
  write('docker-inspect.json', '[]\n');
  write('rollback-images.json', JSON.stringify({
    'kidults-gateway': { image_id: `sha256:${'a'.repeat(64)}`, image_ref: 'synthetic-gateway:test' },
    'kidults-scheduler': { image_id: `sha256:${'b'.repeat(64)}`, image_ref: 'synthetic-scheduler:test' },
  }, null, 2));
  write('rollback-images.tar', 'synthetic-image-archive');
  write('rollback-plan.txt', 'synthetic rollback plan\n');

  const shaLine = name => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(snapshotDir, name))).digest('hex')}  ${name}\n`;
  write('kaios.db.sha256', shaLine('kaios.db'));
  write('env.production.snapshot.sha256', shaLine('env.production.snapshot'));
  write('docker-compose.production.yml.sha256', shaLine('docker-compose.production.yml'));
  write('rollback-images.tar.sha256', shaLine('rollback-images.tar'));

  const files = {};
  for (const name of required) files[name] = crypto.createHash('sha256').update(fs.readFileSync(path.join(snapshotDir, name))).digest('hex');
  write('manifest.json', JSON.stringify({
    id: 'KIDULTS_PREDEPLOYMENT_SNAPSHOT_V1', version: '1.0.0',
    producer_id: 'KIDULTS_PREDEPLOYMENT_SNAPSHOT_COLLECTOR_V1',
    status: 'captured', vertical: 'kidults', rollback_ready: true,
    captured_at: capturedAt, snapshot_completed_at: capturedAt,
    source_sha: syntheticSourceSha,
    production_root: fs.realpathSync(prodRoot),
    production_database: path.join(fs.realpathSync(dataDir), 'kaios.db'),
    database_capture_method: 'SQLITE_ONLINE_BACKUP_API',
    database_integrity: 'ok',
    database_sha256: files['kaios.db'],
    environment_sha256: files['env.production.snapshot'],
    compose_sha256: files['docker-compose.production.yml'],
    gateway_image_id: `sha256:${'a'.repeat(64)}`,
    scheduler_image_id: `sha256:${'b'.repeat(64)}`,
    snapshot_directory: fs.realpathSync(snapshotDir),
    production_change_executed: false, artfund_change_executed: false,
    required_rollback_files: required, files,
  }, null, 2));
  const expectedSnapshotManifestSha256 = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(path.join(snapshotDir, 'manifest.json'))).digest('hex')}`;
  const dryRunEnvironment = {
    ...process.env,
    PYTHONOPTIMIZE: '2',
    ROOT_DIR: process.cwd(),
    PROD_ROOT: prodRoot,
    PROD_DB: path.join(dataDir, 'kaios.db'),
    PREDEPLOYMENT_SNAPSHOT_DIR: snapshotDir,
    EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256: expectedSnapshotManifestSha256,
    KAIOS_EXECUTE_PRODUCTION_ROLLBACK: 'false',
  };

  const dryRun = spawnSync('bash', [rollbackPath], {
    cwd: process.cwd(), encoding: 'utf8',
    env: dryRunEnvironment,
  });
  if (dryRun.status !== 0 || !dryRun.stdout.includes('ROLLBACK DRY RUN COMPLETE')) throw new Error(`rollback synthetic dry-run failed: status=${dryRun.status}\n${dryRun.stdout}\n${dryRun.stderr}`);

  const metadataPath = path.join(snapshotDir, 'database-metadata.tsv');
  const manifestPath = path.join(snapshotDir, 'manifest.json');
  const rebindMetadata = (content) => {
    fs.writeFileSync(metadataPath, content);
    const currentManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    currentManifest.files['database-metadata.tsv'] = crypto.createHash('sha256').update(content).digest('hex');
    fs.writeFileSync(manifestPath, JSON.stringify(currentManifest, null, 2));
    return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex')}`;
  };
  const literalEscapeDigest = rebindMetadata(`${capturedAt}\\t1000\\t1000\\t0600\n`);
  const literalEscapeMetadata = spawnSync('bash', [rollbackPath], {
    cwd: process.cwd(), encoding: 'utf8',
    env: { ...dryRunEnvironment, EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256: literalEscapeDigest },
  });
  if (literalEscapeMetadata.status === 0 || !literalEscapeMetadata.stderr.includes('Invalid captured database ownership/mode metadata')) {
    throw new Error(`rollback accepted literal backslash database metadata\n${literalEscapeMetadata.stdout}\n${literalEscapeMetadata.stderr}`);
  }
  const unsafeDatabaseModes = ['0660', '0602', '4600', '2600', '1600'];
  for (const unsafeMode of unsafeDatabaseModes) {
    const unsafeModeDigest = rebindMetadata(`${capturedAt}\t1000\t1000\t${unsafeMode}\n`);
    const unsafeModeResult = spawnSync('bash', [rollbackPath], {
      cwd: process.cwd(), encoding: 'utf8',
      env: { ...dryRunEnvironment, EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256: unsafeModeDigest },
    });
    if (unsafeModeResult.status === 0 || !unsafeModeResult.stderr.includes('Unsafe captured database mode metadata')) {
      throw new Error(`rollback accepted unsafe database mode ${unsafeMode}\n${unsafeModeResult.stdout}\n${unsafeModeResult.stderr}`);
    }
  }
  const timestampMismatchDigest = rebindMetadata('2026-08-30T23:59:59Z\t1000\t1000\t0600\n');
  const timestampMismatch = spawnSync('bash', [rollbackPath], {
    cwd: process.cwd(), encoding: 'utf8',
    env: { ...dryRunEnvironment, EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256: timestampMismatchDigest },
  });
  if (timestampMismatch.status === 0 || !timestampMismatch.stderr.includes('Captured database metadata timestamp binding mismatch')) {
    throw new Error(`rollback accepted a metadata timestamp from a different capture\n${timestampMismatch.stdout}\n${timestampMismatch.stderr}`);
  }
  dryRunEnvironment.EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256 = rebindMetadata(`${capturedAt}\t1000\t1000\t0600\n`);

  const wrongDigest = spawnSync('bash', [rollbackPath], {
    cwd: process.cwd(), encoding: 'utf8',
    env: { ...dryRunEnvironment, EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256: `sha256:${'f'.repeat(64)}` },
  });
  if (wrongDigest.status === 0 || !wrongDigest.stderr.includes('signed snapshot manifest digest mismatch')) {
    throw new Error(`rollback accepted a caller-substituted snapshot digest\n${wrongDigest.stdout}\n${wrongDigest.stderr}`);
  }

  const originalDatabasePath = path.join(snapshotDir, 'kaios.db');
  const movedDatabasePath = path.join(temp, 'symlink-target-kaios.db');
  fs.renameSync(originalDatabasePath, movedDatabasePath);
  fs.symlinkSync(movedDatabasePath, originalDatabasePath);
  const symlinkMember = spawnSync('bash', [rollbackPath], {
    cwd: process.cwd(), encoding: 'utf8', env: dryRunEnvironment,
  });
  if (symlinkMember.status === 0 || !symlinkMember.stderr.includes('Too many levels of symbolic links')) {
    throw new Error(`rollback accepted a symlink-substituted snapshot member\n${symlinkMember.stdout}\n${symlinkMember.stderr}`);
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log(JSON.stringify({
  suite: 'KIDULTS_PRODUCTION_ROLLBACK_CONTRACT_V1', result: 'PASS', governing_issue: 955,
  canonical_production_origin_fail_closed: true, automatic_rollback_contract: true,
  rollback_armed_before_first_runtime_mutation: true, err_interrupt_termination_traps: true,
  smoke_failure_automatic_rollback: true, exact_snapshot_digest_verification: true,
  sqlite_online_backup_required: true, sqlite_connection_inode_binding: true,
  database_metadata_capture_parser_integration: 'PASS',
  database_metadata_unsafe_mode_negative_cases: 5,
  pinned_single_open_rollback_inputs: true, durable_pre_mutation_rollback_pin: true,
  rollback_pin_ancestor_and_stable_identity_negative_cases: rollbackPinNegativeCases,
  actual_rollback_rereads_original_snapshot: false,
  atomic_fd_database_restore: true,
  restore_helper_preprepare_proof_negative_cases: restoreHelperPreflightNegativeCases,
  database_restore_symlink_collision_and_digest_negative_cases: databaseRestoreNegativeCases,
  runtime_container_quiescence_negative_cases: containerQuiescenceNegativeCases,
  prestart_sqlite_sidecar_held_fd_cases: prestartSqliteSidecarHeldFdCases,
  rollback_receipt_directory_and_member_negative_cases: rollbackReceiptNegativeCases,
  rollback_receipt_path_writers: 'FORBIDDEN',
  predictable_restore_name_external_sentinel: 'UNCHANGED',
  python_optimization_bypass_rejected: true,
  signed_snapshot_digest_negative: 'PASS', symlink_snapshot_member_negative: 'PASS',
  exact_prior_image_archive_and_identity_restore: true, upstream_pull_during_rollback: 'PROHIBITED',
  current_sold_production_readiness_gate: true, natural_run_dedupe_and_window_gate: true,
  slo_error_budget_and_pitr_rollback_gate: true, explicit_program_owner_ed25519_receipt: true,
  technical_readiness_self_authorization: 'FORBIDDEN', sealed_archive_revalidated_at_promotion: true,
  promotion_terminal_publication_negative_cases: terminalPublicationNegativeCases,
  rollback_error_receipt_fault_and_collision_cases: rollbackErrorReceiptFaultCases,
  rollback_terminal_manifest_fault_to_error_receipt_cases: terminalManifestFaultCases,
  rollback_terminal_authority_held_fd_cases: terminalAuthorityHeldFdCases,
  rollback_terminal_pointer_exchange_recovery_cases: terminalPointerExchangeRecoveryCases,
  rollback_terminal_pointer_reentry_recovery_cases: terminalPointerReentryRecoveryCases,
  rollback_exact_name_containment_cases: exactNameContainmentCases,
  configuration_restore_partial_publish_negative_cases: configurationRestoreFaultCases,
  promotion_terminal_authority_negative_cases: terminalAuthorityNegativeCases,
  promotion_terminal_signal_injection_cases: terminalSignalInjectionCases,
  promotion_nested_signal_containment_cases: promotionNestedSignalContainmentCases,
  promotion_terminal_failure_publication_cases: terminalFailurePublicationCases,
  promotion_post_arm_explicit_failure_cases: postArmExplicitFailureCases,
  rollback_post_arm_explicit_failure_cases: rollbackPostArmExplicitFailureCases,
  failed_state_forensic_preservation: true, recovery_receipt: 'REQUIRED', shell_syntax_validated: true,
  quoted_python_heredocs_compiled: quotedPythonHeredocsCompiled,
  embedded_python_heredoc_boundary_negative_cases: embeddedPythonHeredocBoundaryNegativeCases,
  mutation_cases_detected: mutationCases, synthetic_dry_run: 'PASS', production_execution: 'NONE',
  public: 'HOLD', g5: 'EXPLICIT_APPROVAL_REQUIRED',
}, null, 2));
