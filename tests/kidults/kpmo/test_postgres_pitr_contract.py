from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import textwrap

import pytest


ROOT = Path(__file__).resolve().parents[3]
SOURCE_VERIFIER = ROOT / "scripts/staging/verify-remote-postgres-persistence-pitr.sh"
RESTORE_VERIFIER = ROOT / "scripts/staging/verify-postgres-target-time-restore.sh"
TUNNEL_HELPER = ROOT / "scripts/staging/run-postgres-verifier-through-ssh-tunnel.sh"
SOURCE_WORKFLOW = ROOT / ".github/workflows/p0-remote-postgres-persistence-pitr.yml"
RESTORE_WORKFLOW = ROOT / ".github/workflows/p0-postgres-target-time-restore-verification.yml"

SOURCE_DSN = "postgresql://source-user:source-password@source.invalid:5432/kaios"
RESTORE_DSN = "postgresql://restore-user:restore-password@restore.invalid:5432/kaios"
TARGET_TIME = "2026-08-27T22:00:00Z"
BEFORE_DIGEST = "a" * 64
AFTER_DIGEST = "b" * 64
SWITCHED_WAL = "00000001000000000000000A"
PREVIOUS_WAL = "000000010000000000000009"


FAKE_PSQL = r"""#!/usr/bin/env python3
import json
import os
from pathlib import Path
import sys


def fail(message, code=97):
    print(message, file=sys.stderr)
    raise SystemExit(code)


args = sys.argv[1:]
expected_database = os.environ.get("FAKE_EXPECT_PGDATABASE", "")
if expected_database:
    if os.environ.get("PGDATABASE") != expected_database:
        fail("fake psql expected the DSN in PGDATABASE")
    if any(expected_database in argument for argument in args):
        fail("fake psql observed the DSN in a process argument")

command = ""
for index, argument in enumerate(args):
    if argument.startswith("--command="):
        command = argument.split("=", 1)[1]
        break
    if argument == "--command" and index + 1 < len(args):
        command = args[index + 1]
        break

state_path = Path(os.environ["FAKE_PSQL_STATE"])
state = json.loads(state_path.read_text()) if state_path.exists() else {}


def save_state():
    state_path.write_text(json.dumps(state))


def emit(value):
    print(value)
    raise SystemExit(0)


if not command:
    sql = sys.stdin.read().lower()
    if "pitr_probe" not in sql:
        fail(f"fake psql received an unknown mutation: {sql!r}")
    if "--output=/dev/null" not in args:
        print("CREATE TABLE")
        print("INSERT 0 1")
        print("CHECKPOINT")
    raise SystemExit(0)

sql = " ".join(command.lower().split())

if "json_build_object" in sql and "pg_is_in_recovery" in sql:
    emit(json.dumps({
        "before_count": int(os.environ.get("FAKE_BEFORE_COUNT", "1")),
        "before_digest": os.environ.get(
            "FAKE_DB_BEFORE_DIGEST",
            os.environ.get("KAIOS_PITR_BEFORE_MARKER_DIGEST", ""),
        ),
        "before_phase": os.environ.get("FAKE_BEFORE_PHASE", "BEFORE_TARGET"),
        "before_guard_verified": os.environ.get(
            "FAKE_BEFORE_GUARD_VERIFIED", "true"
        ).lower() == "true",
        "after_count": int(os.environ.get("FAKE_AFTER_COUNT", "0")),
        "data_checksums": os.environ.get("FAKE_DATA_CHECKSUMS", "on"),
        "force_rls_tables": int(os.environ.get("FAKE_RLS_FORCED", "4")),
        "migration_rows": int(os.environ.get("FAKE_MIGRATION_COUNT", "1")),
        "endpoint_in_recovery": os.environ.get(
            "FAKE_ENDPOINT_IN_RECOVERY", "false"
        ).lower() == "true",
    }))

if sql == "show server_version":
    emit("16.4")
if sql == "show wal_level":
    emit("replica")
if sql == "show archive_mode":
    emit("on")
if sql == "show data_checksums":
    emit(os.environ.get("FAKE_DATA_CHECKSUMS", "on"))
if "to_regnamespace('kaios_runtime') is not null" in sql:
    emit("t")
if "relforcerowsecurity" in sql:
    emit(os.environ.get("FAKE_RLS_FORCED", "4"))
if "schema_migrations" in sql:
    emit(os.environ.get("FAKE_MIGRATION_COUNT", "1"))
if "has_function_privilege" in sql and "pg_switch_wal" in sql:
    emit(os.environ.get("FAKE_PG_SWITCH_WAL_AUTHORIZED", "t"))
if "to_char(date_trunc('second', clock_timestamp()" in sql or "clock_timestamp() at time zone" in sql:
    emit(os.environ.get("FAKE_TARGET_TIME", "2026-08-27T22:00:00Z"))
if "pg_walfile_name" in sql and "pg_switch_wal" in sql:
    state["switched"] = True
    save_state()
    emit(os.environ.get("FAKE_SWITCHED_WAL", "00000001000000000000000A"))
if "pg_switch_wal" in sql:
    state["switched"] = True
    save_state()
    emit("0/2000000")
if "pg_walfile_name" in sql:
    emit(os.environ.get("FAKE_SWITCHED_WAL", "00000001000000000000000A"))
if "pg_current_wal_lsn()" in sql:
    calls = int(state.get("lsn_calls", 0))
    state["lsn_calls"] = calls + 1
    save_state()
    emit("0/1000000" if calls == 0 else "0/3000000")
if "from pg_stat_archiver" in sql:
    switched = bool(state.get("switched"))
    if not switched:
        archived_count = os.environ.get("FAKE_ARCHIVED_COUNT_BEFORE", "7")
        failed_count = os.environ.get("FAKE_FAILED_COUNT_BEFORE", "0")
        last_archived_wal = os.environ.get(
            "FAKE_LAST_ARCHIVED_WAL_BEFORE", "000000010000000000000009"
        )
        stats_reset = os.environ.get(
            "FAKE_STATS_RESET_BEFORE", "2026-08-27 00:00:00+00"
        )
    else:
        poll_calls = int(state.get("archive_poll_calls", 0)) + 1
        state["archive_poll_calls"] = poll_calls
        save_state()
        ready_after = int(os.environ.get("FAKE_ARCHIVE_READY_AFTER", "1"))
        ready = poll_calls >= ready_after
        archived_count = os.environ.get(
            "FAKE_ARCHIVED_COUNT_AFTER" if ready else "FAKE_ARCHIVED_COUNT_BEFORE",
            "8" if ready else "7",
        )
        failed_count = os.environ.get(
            "FAKE_FAILED_COUNT_AFTER" if ready else "FAKE_FAILED_COUNT_BEFORE", "0"
        )
        last_archived_wal = os.environ.get(
            "FAKE_LAST_ARCHIVED_WAL_AFTER" if ready else "FAKE_LAST_ARCHIVED_WAL_BEFORE",
            "00000001000000000000000A" if ready else "000000010000000000000009",
        )
        stats_reset = os.environ.get(
            "FAKE_STATS_RESET_AFTER" if ready else "FAKE_STATS_RESET_BEFORE",
            "2026-08-27 00:00:00+00",
        )
    if "last_archived_wal" in sql and "stats_reset" in sql:
        emit(f"{archived_count}|{failed_count}|{last_archived_wal}|{stats_reset}")
    if "last_archived_wal" in sql and "archived_count" in sql:
        emit(f"{archived_count}|{failed_count}|{last_archived_wal}")
    if "stats_reset" in sql:
        emit(f"{archived_count}|{failed_count}|{stats_reset}")
    if "last_archived_wal" in sql:
        emit(last_archived_wal)
    emit(f"{archived_count}|{failed_count}")
if "coalesce(max(marker_digest)" in sql and "pitr_probe" in sql:
    digest = os.environ.get(
        "FAKE_DB_BEFORE_DIGEST", os.environ.get("KAIOS_PITR_BEFORE_MARKER_DIGEST", "")
    )
    emit(
        "|".join(
            [
                os.environ.get("FAKE_BEFORE_COUNT", "1"),
                digest,
                os.environ.get("FAKE_BEFORE_PHASE", "BEFORE_TARGET"),
                os.environ.get("FAKE_BEFORE_AT_OR_BEFORE_TARGET", "t"),
            ]
        )
    )
if "created_at <" in sql and "created_at >" in sql and "pitr_probe" in sql:
    emit(os.environ.get("FAKE_MARKER_BOUNDARY_ORDER", "t|t"))
if "count(*)" in sql and "pitr_probe" in sql:
    if os.environ.get("FAKE_MODE") == "restore":
        emit(os.environ.get("FAKE_AFTER_COUNT", "0"))
    emit("1")

fail(f"fake psql received an unknown query: {command}")
"""


FAKE_PG_ISREADY = r"""#!/usr/bin/env python3
import os
import sys

expected = os.environ.get("FAKE_EXPECT_PGDATABASE", "")
if expected and os.environ.get("PGDATABASE") != expected:
    print("fake pg_isready expected the DSN in PGDATABASE", file=sys.stderr)
    raise SystemExit(97)
if expected and any(expected in argument for argument in sys.argv[1:]):
    print("fake pg_isready observed the DSN in a process argument", file=sys.stderr)
    raise SystemExit(97)
raise SystemExit(0)
"""


FAKE_SSH_TUNNEL = r"""#!/usr/bin/env python3
import re
import signal
import socket
import sys

args = sys.argv[1:]
try:
    forward = args[args.index("-L") + 1]
except (ValueError, IndexError):
    print("fake ssh requires -L", file=sys.stderr)
    raise SystemExit(97)
match = re.match(r"^127\.0\.0\.1:([0-9]+):", forward)
if not match:
    print("fake ssh received an invalid local forward", file=sys.stderr)
    raise SystemExit(97)

running = True
def stop(_signum, _frame):
    global running
    running = False

signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", int(match.group(1))))
    listener.listen()
    listener.settimeout(0.1)
    while running:
        try:
            connection, _ = listener.accept()
        except TimeoutError:
            continue
        connection.close()
"""


def _write_executable(path: Path, source: str) -> None:
    path.write_text(textwrap.dedent(source), encoding="utf-8")
    path.chmod(0o755)


def _fake_environment(tmp_path: Path, *, mode: str, dsn: str) -> dict[str, str]:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    _write_executable(fake_bin / "psql", FAKE_PSQL)
    _write_executable(fake_bin / "pg_isready", FAKE_PG_ISREADY)
    _write_executable(fake_bin / "sleep", "#!/usr/bin/env bash\nexit 0\n")

    environment = os.environ.copy()
    environment.update(
        {
            "PATH": f"{fake_bin}{os.pathsep}{environment['PATH']}",
            "FAKE_MODE": mode,
            "FAKE_EXPECT_PGDATABASE": dsn,
            "FAKE_PSQL_STATE": str(tmp_path / "psql-state.json"),
            "KAIOS_ENVIRONMENT": "staging",
            "KAIOS_PRODUCTION_PROMOTION_AUTHORIZED": "false",
            "KAIOS_PITR_ARCHIVE_POLL_ATTEMPTS": "2",
            "KAIOS_PITR_ARCHIVE_POLL_INTERVAL_SECONDS": "0",
        }
    )
    return environment


def _run_source_verifier(
    tmp_path: Path, overrides: dict[str, str] | None = None
) -> subprocess.CompletedProcess[str]:
    environment = _fake_environment(tmp_path, mode="source", dsn=SOURCE_DSN)
    environment["KAIOS_POSTGRES_DSN"] = SOURCE_DSN
    environment.update(overrides or {})
    return subprocess.run(
        ["bash", str(SOURCE_VERIFIER)],
        cwd=ROOT,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )


def _run_restore_verifier(
    tmp_path: Path,
    overrides: dict[str, str] | None = None,
    *,
    unset: tuple[str, ...] = (),
) -> subprocess.CompletedProcess[str]:
    environment = _fake_environment(tmp_path, mode="restore", dsn=RESTORE_DSN)
    environment.update(
        {
            "KAIOS_POSTGRES_PITR_RESTORE_DSN": RESTORE_DSN,
            "KAIOS_PITR_BEFORE_MARKER": "pitr-before-contract-test",
            "KAIOS_PITR_AFTER_MARKER": "pitr-after-contract-test",
            "KAIOS_PITR_BEFORE_MARKER_DIGEST": BEFORE_DIGEST,
            "KAIOS_PITR_AFTER_MARKER_DIGEST": AFTER_DIGEST,
            "KAIOS_PITR_TARGET_TIME": TARGET_TIME,
        }
    )
    environment.update(overrides or {})
    for name in unset:
        environment.pop(name, None)
    return subprocess.run(
        ["bash", str(RESTORE_VERIFIER)],
        cwd=ROOT,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )


def _one_json_line(result: subprocess.CompletedProcess[str]) -> dict[str, object]:
    assert result.returncode == 0, result.stderr
    lines = result.stdout.splitlines()
    assert len(lines) == 1, f"expected one JSON line, got stdout={result.stdout!r}"
    return json.loads(lines[0])


def test_source_verifier_emits_one_pure_json_receipt(tmp_path: Path) -> None:
    result = _run_source_verifier(tmp_path)
    receipt = _one_json_line(result)

    assert SOURCE_DSN not in result.stdout
    assert SOURCE_DSN not in result.stderr
    assert receipt["status"] == "PASS"
    assert receipt["environment"] == "STAGING"
    assert receipt["production_touch"] is False
    assert receipt["data_checksums"] == "on"
    assert receipt["pitr_probe_table"] == "kaios_runtime.pitr_probe_v2"
    assert int(receipt["archived_count_before"]) == 7
    assert int(receipt["archived_count"]) == 8
    assert int(receipt["archived_count"]) > int(receipt["archived_count_before"])
    assert int(receipt["failed_archive_count"]) == 0
    assert int(receipt["failed_archive_count_before"]) == 0
    assert receipt["archive_stats_reset"] == "2026-08-27 00:00:00+00"
    assert receipt["pg_switch_wal_authorized"] is True
    assert receipt["archive_observation_attempted"] is True
    assert receipt["wal_archive_event_verified"] is True
    assert receipt["switched_wal"] == SWITCHED_WAL
    assert receipt["last_archived_wal"] == SWITCHED_WAL
    assert receipt["switched_wal_archived"] is True
    assert receipt["pitr_target_time"] == TARGET_TIME
    assert receipt["target_time_precision"] == "WHOLE_SECOND_UTC"
    assert receipt["marker_target_guard_seconds_minimum"] == 2
    assert receipt["marker_boundary_order_verified"] is True
    assert receipt["fixture_state"] == (
        "TARGET_BOUNDARY_FIXTURE_AND_WAL_ARCHIVE_EVENT_VERIFIED"
    )
    assert receipt["pitr_capability"] == "NOT_VERIFIED"
    assert receipt["base_backup_verified"] is False
    assert receipt["archive_restore_path_verified"] is False
    assert receipt["restore_capability_verified"] is False
    assert receipt["restore_actuator_configured"] is False
    assert receipt["restore_performed_by_this_script"] is False

    before_marker = str(receipt["pitr_before_marker"])
    after_marker = str(receipt["pitr_after_marker"])
    assert receipt["pitr_before_marker_digest"] == hashlib.sha256(
        before_marker.encode()
    ).hexdigest()
    assert receipt["pitr_after_marker_digest"] == hashlib.sha256(
        after_marker.encode()
    ).hexdigest()


def test_source_verifier_reads_wal_switch_privilege_without_checkpoint_requirement() -> None:
    source = SOURCE_VERIFIER.read_text(encoding="utf-8")
    assert "CHECKPOINT" not in source
    assert source.index("has_function_privilege") < source.index("CREATE TABLE")


@pytest.mark.parametrize(
    ("overrides", "error"),
    [
        ({"FAKE_DATA_CHECKSUMS": "off"}, "data_checksums must be enabled"),
        (
            {"FAKE_FAILED_COUNT_BEFORE": "1", "FAKE_FAILED_COUNT_AFTER": "2"},
            "new WAL archive failure observed",
        ),
        (
            {"FAKE_STATS_RESET_AFTER": "2026-08-27 01:00:00+00"},
            "pg_stat_archiver reset",
        ),
        (
            {"FAKE_ARCHIVED_COUNT_BEFORE": "7", "FAKE_ARCHIVED_COUNT_AFTER": "7"},
            "switched WAL was not archived",
        ),
        (
            {"FAKE_LAST_ARCHIVED_WAL_AFTER": PREVIOUS_WAL},
            "switched WAL was not archived",
        ),
        ({"FAKE_MARKER_BOUNDARY_ORDER": "t|f"}, "do not satisfy the two-second target guard"),
    ],
)
def test_source_verifier_rejects_incomplete_integrity_or_archive_evidence(
    tmp_path: Path, overrides: dict[str, str], error: str
) -> None:
    result = _run_source_verifier(tmp_path, overrides)

    assert result.returncode != 0
    assert error in result.stderr
    assert '"status":"PASS"' not in result.stdout
    assert SOURCE_DSN not in result.stdout
    assert SOURCE_DSN not in result.stderr


def test_source_verifier_preserves_fixture_when_managed_role_cannot_switch_wal(
    tmp_path: Path,
) -> None:
    result = _run_source_verifier(
        tmp_path, {"FAKE_PG_SWITCH_WAL_AUTHORIZED": "f"}
    )
    receipt = _one_json_line(result)
    assert receipt["fixture_state"] == (
        "TARGET_BOUNDARY_FIXTURE_VERIFIED__WAL_ARCHIVE_EVENT_NOT_VERIFIED"
    )
    assert receipt["pg_switch_wal_authorized"] is False
    assert receipt["archive_observation_attempted"] is False
    assert receipt["wal_archive_event_verified"] is False
    assert receipt["switched_wal_archived"] is False
    for key in (
        "archived_count_before",
        "archived_count",
        "failed_archive_count_before",
        "failed_archive_count",
        "archive_stats_reset",
        "switched_wal",
        "last_archived_wal",
    ):
        assert receipt[key] is None
    assert receipt["pitr_capability"] == "NOT_VERIFIED"


def test_restore_verifier_emits_canonical_migration_rows_receipt(tmp_path: Path) -> None:
    result = _run_restore_verifier(tmp_path)
    receipt = _one_json_line(result)

    assert RESTORE_DSN not in result.stdout
    assert RESTORE_DSN not in result.stderr
    assert receipt["status"] == "PASS"
    assert receipt["environment"] == "STAGING"
    assert receipt["production_touch"] is False
    assert receipt["target_time"] == TARGET_TIME
    assert receipt["pre_target_marker_count"] == 1
    assert receipt["post_target_marker_count"] == 0
    assert receipt["pre_target_marker_digest"] == BEFORE_DIGEST
    assert receipt["expected_post_target_marker_digest"] == AFTER_DIGEST
    assert receipt["pre_target_marker_at_or_before_target_time"] is True
    assert receipt["pre_target_marker_guard_seconds_minimum"] == 2
    assert receipt["data_checksums"] == "on"
    assert receipt["pitr_probe_table"] == "kaios_runtime.pitr_probe_v2"
    assert receipt["force_rls_tables"] == 4
    assert receipt["migration_rows"] == 1
    assert receipt["endpoint_in_recovery"] is False
    assert receipt["consistent_snapshot_scope"] == "SINGLE_POSTGRESQL_STATEMENT"
    assert "schema_migrations" not in receipt
    assert receipt["target_boundary_data_state_observed"] is True
    assert receipt["restore_method_verified"] is False
    assert receipt["provider_control_plane_receipt_verified"] is False
    assert receipt["pitr"] == "NOT_VERIFIED"


@pytest.mark.parametrize(
    ("overrides", "unset", "error"),
    [
        ({}, ("KAIOS_PITR_BEFORE_MARKER_DIGEST",), "BEFORE_MARKER_DIGEST is required"),
        ({"KAIOS_PITR_BEFORE_MARKER_DIGEST": "invalid"}, (), "invalid BEFORE digest"),
        ({"FAKE_BEFORE_COUNT": "0"}, (), "pre-target marker missing"),
        ({"FAKE_DB_BEFORE_DIGEST": "c" * 64}, (), "pre-target marker digest mismatch"),
        ({"FAKE_BEFORE_PHASE": "AFTER_TARGET"}, (), "pre-target marker phase mismatch"),
        (
            {"FAKE_BEFORE_GUARD_VERIFIED": "false"},
            (),
            "pre-target marker does not satisfy the two-second target guard",
        ),
        ({"FAKE_AFTER_COUNT": "1"}, (), "post-target marker present"),
        ({"FAKE_DATA_CHECKSUMS": "off"}, (), "data checksums are not enabled"),
        ({"FAKE_RLS_FORCED": "3"}, (), "RLS missing at target-boundary probe"),
        ({"FAKE_MIGRATION_COUNT": "0"}, (), "migration ledger missing"),
        (
            {"FAKE_ENDPOINT_IN_RECOVERY": "true"},
            (),
            "endpoint is still in recovery",
        ),
        (
            {"KAIOS_PITR_TARGET_TIME": "2026-08-27 22:00:00"},
            (),
            "canonical whole-second UTC RFC3339",
        ),
    ],
)
def test_restore_verifier_rejects_invalid_restore_evidence(
    tmp_path: Path,
    overrides: dict[str, str],
    unset: tuple[str, ...],
    error: str,
) -> None:
    result = _run_restore_verifier(tmp_path, overrides, unset=unset)

    assert result.returncode != 0
    assert error in result.stderr
    assert '"status":"PASS"' not in result.stdout
    assert RESTORE_DSN not in result.stdout
    assert RESTORE_DSN not in result.stderr


def _validate_source_workflow_contract(source: str) -> None:
    assert "WAITING_FOR_EXTERNAL_RESTORE" in source
    assert "KIDULTS_STAGING_POSTGRES_PITR_RESTORE_DSN" not in source
    assert "verify-postgres-target-time-restore.sh" not in source
    assert "TARGET_TIME_RESTORE_VERIFIED" not in source
    assert "'restore_capability_verified':False" in source
    assert "'external_provider_spend_authorized_by_this_workflow':False" in source


def _restore_verifier_invocation_block(source: str) -> str:
    script_name = "verify-postgres-target-time-restore.sh"
    tunnel_invocation = "run-postgres-verifier-through-ssh-tunnel.sh restore"
    invocation_marker = (
        tunnel_invocation if tunnel_invocation in source else script_name
    )
    invocation = source.rfind(invocation_marker)
    assert invocation >= 0, "restore verifier invocation missing"
    block_start = source.rfind("        run: |", 0, invocation)
    assert block_start >= 0, "restore verifier must run from an explicit shell step"
    block = source[block_start : invocation + len(invocation_marker)]
    assert script_name in block, "restore verifier path is not bound in the shell step"
    return block


def _validate_restore_workflow_contract(source: str) -> None:
    block = _restore_verifier_invocation_block(source)
    for variable, local_name, fixture_key in (
        (
            "KAIOS_PITR_BEFORE_MARKER_DIGEST",
            "BEFORE_MARKER_DIGEST",
            "before_marker_digest",
        ),
        (
            "KAIOS_PITR_AFTER_MARKER_DIGEST",
            "AFTER_MARKER_DIGEST",
            "after_marker_digest",
        ),
    ):
        assert re.search(
            rf"^\s*{local_name}:\s*\$\{{\{{\s*needs\.bind-source-fixture\.outputs\.{fixture_key}\s*\}}\}}\s*$",
            source,
            flags=re.MULTILINE,
        ), f"{local_name} is not bound from fixture output {fixture_key}"
        assert re.search(
            rf"export\s+{re.escape(variable)}=\"\${local_name}\"", block
        ), f"{variable} is not exported in the verifier shell"

    assert re.search(
        r"assert\s+int\(r\[['\"]migration_rows['\"]\]\)\s*>=\s*1", source
    ), "restore receipt must assert canonical migration_rows"
    assert not re.search(r"r\[['\"]schema_migrations['\"]\]", source)
    assert "TARGET_TIME_RESTORE_VERIFIED" not in source
    assert "'state':'WAITING_FOR_PROVIDER_OR_PHYSICAL_RESTORE_RECEIPT'" in source
    assert "'provider_control_plane_receipt_verified':False" in source
    assert "'restore_operation_reference_verified':False" in source
    assert "'physical_restore_resource_distinctness_verified':False" in source
    assert "'pitr_verified':False" in source
    assert "PROVIDER_OR_PHYSICAL_RESTORE_RECEIPT_MISSING" in source
    assert "Re-evaluate Candidate Evidence Track B and Projection chain" not in source

    for receipt_key, fixture_key in (
        ("pitr_before_marker", "before_marker"),
        ("pitr_after_marker", "after_marker"),
        ("pitr_before_marker_digest", "before_marker_digest"),
        ("pitr_after_marker_digest", "after_marker_digest"),
        ("pitr_target_time", "target_time"),
    ):
        assert (
            f"assert receipt['{receipt_key}']==fixture['{fixture_key}']" in source
        ), f"source receipt {receipt_key} is not cross-bound to fixture {fixture_key}"


def test_tunnel_helper_runs_tracked_non_executable_verifiers_via_bash() -> None:
    source = TUNNEL_HELPER.read_text(encoding="utf-8")
    assert '[[ -f "$verifier" ]]' in source
    assert '[[ -x "$verifier" ]]' not in source
    assert source.count('bash "$verifier" > "$runtime_root/verifier.json"') == 2


def test_tunnel_helper_rewrites_dsn_without_leaking_and_cleans_up(tmp_path: Path) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    _write_executable(fake_bin / "ssh", FAKE_SSH_TUNNEL)
    _write_executable(fake_bin / "psql", "#!/usr/bin/env bash\nexit 0\n")
    _write_executable(fake_bin / "pg_isready", "#!/usr/bin/env bash\nexit 0\n")

    verifier = tmp_path / "non-executable-verifier.sh"
    verifier.write_text(
        textwrap.dedent(
            """\
            #!/usr/bin/env bash
            set -euo pipefail
            python3 - <<'PY'
            import json, os, urllib.parse
            parts=urllib.parse.urlsplit(os.environ['KAIOS_POSTGRES_DSN'])
            query=urllib.parse.parse_qs(parts.query)
            assert parts.hostname == 'source.db.ondigitalocean.com'
            assert parts.port != 25060
            assert query['hostaddr'] == ['127.0.0.1']
            assert query['sslmode'] == ['verify-full']
            assert query['connect_timeout'] == ['10']
            assert 'host' not in query and 'port' not in query
            print(json.dumps({'status':'PASS','environment':'STAGING','production_touch':False}))
            PY
            """
        ),
        encoding="utf-8",
    )
    verifier.chmod(0o644)

    key = tmp_path / "id_ed25519"
    known_hosts = tmp_path / "known_hosts"
    key.write_text("fixture", encoding="utf-8")
    known_hosts.write_text("fixture", encoding="utf-8")
    runner_temp = tmp_path / "runner-temp"
    runner_temp.mkdir()
    dsn = (
        "postgres://source-user:source-password@source.db.ondigitalocean.com:25060/kaios"
        "?sslmode=verify-full&host=ignored.invalid&hostaddr=192.0.2.1&port=6543"
    )
    environment = os.environ.copy()
    environment.update(
        {
            "PATH": f"{fake_bin}{os.pathsep}{environment['PATH']}",
            "RUNNER_TEMP": str(runner_temp),
            "KAIOS_ENVIRONMENT": "staging",
            "KAIOS_PRODUCTION_PROMOTION_AUTHORIZED": "false",
            "KAIOS_STAGING_SSH_HOST": "165.232.175.45",
            "KAIOS_STAGING_SSH_USER": "kidults-staging",
            "KAIOS_STAGING_SSH_KEY_PATH": str(key),
            "KAIOS_STAGING_SSH_KNOWN_HOSTS_PATH": str(known_hosts),
            "KAIOS_SOURCE_VERIFIER_PATH": str(verifier),
            "KAIOS_POSTGRES_DSN": dsn,
        }
    )

    result = subprocess.run(
        ["bash", str(TUNNEL_HELPER), "source"],
        cwd=ROOT,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
        timeout=10,
    )
    receipt = _one_json_line(result)
    assert dsn not in result.stdout
    assert dsn not in result.stderr
    assert re.fullmatch(r"sha256:[a-f0-9]{64}", str(receipt["connection_identity_digest"]))
    assert receipt["tls_encryption_required"] is True
    assert receipt["tls_ca_chain_verified"] is True
    assert receipt["tls_hostname_verified"] is True
    assert receipt["destination_policy"] == (
        "DIGITALOCEAN_MANAGED_POSTGRESQL_STAGING_HOST_SUFFIX_AND_PORT"
    )
    assert list(runner_temp.glob("kaios-postgres-tunnel-*")) == []


@pytest.mark.parametrize(
    ("dsn", "error"),
    [
        (
            "postgresql://u:p@outside.example:25060/kaios?sslmode=require",
            "outside the approved DigitalOcean STAGING boundary",
        ),
        (
            "postgresql://u:p@source.db.ondigitalocean.com:5432/kaios?sslmode=require",
            "outside the approved DigitalOcean STAGING boundary",
        ),
        (
            "postgresql://u:p@source.db.ondigitalocean.com:25060/kaios?sslmode=disable",
            "must require TLS",
        ),
        (
            "postgresql://u:p@source.db.ondigitalocean.com:25060/kaios",
            "must require TLS",
        ),
    ],
)
def test_tunnel_helper_rejects_unapproved_destination_or_tls_mode(
    tmp_path: Path, dsn: str, error: str
) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    for command_name in ("ssh", "psql", "pg_isready"):
        _write_executable(fake_bin / command_name, "#!/usr/bin/env bash\nexit 0\n")
    key = tmp_path / "id_ed25519"
    known_hosts = tmp_path / "known_hosts"
    verifier = tmp_path / "verifier.sh"
    for path in (key, known_hosts, verifier):
        path.write_text("fixture", encoding="utf-8")
    runner_temp = tmp_path / "runner-temp"
    runner_temp.mkdir()
    environment = os.environ.copy()
    environment.update(
        {
            "PATH": f"{fake_bin}{os.pathsep}{environment['PATH']}",
            "RUNNER_TEMP": str(runner_temp),
            "KAIOS_ENVIRONMENT": "staging",
            "KAIOS_PRODUCTION_PROMOTION_AUTHORIZED": "false",
            "KAIOS_STAGING_SSH_HOST": "165.232.175.45",
            "KAIOS_STAGING_SSH_USER": "kidults-staging",
            "KAIOS_STAGING_SSH_KEY_PATH": str(key),
            "KAIOS_STAGING_SSH_KNOWN_HOSTS_PATH": str(known_hosts),
            "KAIOS_SOURCE_VERIFIER_PATH": str(verifier),
            "KAIOS_POSTGRES_DSN": dsn,
        }
    )
    result = subprocess.run(
        ["bash", str(TUNNEL_HELPER), "source"],
        cwd=ROOT,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
        timeout=10,
    )
    assert result.returncode != 0
    assert error in result.stderr
    assert dsn not in result.stdout
    assert dsn not in result.stderr
    assert list(runner_temp.glob("kaios-postgres-tunnel-*")) == []


def test_workflows_enforce_two_phase_restore_contract() -> None:
    source = SOURCE_WORKFLOW.read_text(encoding="utf-8")
    restore = RESTORE_WORKFLOW.read_text(encoding="utf-8")

    _validate_source_workflow_contract(source)
    _validate_restore_workflow_contract(restore)


@pytest.mark.parametrize(
    "mutation",
    [
        lambda source: source.replace("WAITING_FOR_EXTERNAL_RESTORE", "READY"),
        lambda source: source + "\nverify-postgres-target-time-restore.sh\n",
        lambda source: source + "\nKIDULTS_STAGING_POSTGRES_PITR_RESTORE_DSN\n",
    ],
)
def test_source_workflow_contract_mutations_fail_closed(mutation) -> None:
    source = SOURCE_WORKFLOW.read_text(encoding="utf-8")
    with pytest.raises(AssertionError):
        _validate_source_workflow_contract(mutation(source))


@pytest.mark.parametrize(
    "token",
    ["KAIOS_PITR_BEFORE_MARKER_DIGEST", "KAIOS_PITR_AFTER_MARKER_DIGEST"],
)
def test_restore_workflow_missing_digest_binding_fails_closed(token: str) -> None:
    source = RESTORE_WORKFLOW.read_text(encoding="utf-8")
    mutated = "\n".join(line for line in source.splitlines() if token not in line)
    with pytest.raises(AssertionError):
        _validate_restore_workflow_contract(mutated)


def test_restore_workflow_wrong_migration_key_fails_closed() -> None:
    source = RESTORE_WORKFLOW.read_text(encoding="utf-8")
    mutated = source.replace("migration_rows", "schema_migrations")
    assert mutated != source
    with pytest.raises(AssertionError):
        _validate_restore_workflow_contract(mutated)


@pytest.mark.parametrize(
    ("receipt_key", "fixture_key"),
    [
        ("pitr_before_marker", "before_marker"),
        ("pitr_after_marker", "after_marker"),
        ("pitr_before_marker_digest", "before_marker_digest"),
        ("pitr_after_marker_digest", "after_marker_digest"),
        ("pitr_target_time", "target_time"),
    ],
)
def test_restore_workflow_fixture_receipt_cross_binding_fails_closed(
    receipt_key: str, fixture_key: str
) -> None:
    source = RESTORE_WORKFLOW.read_text(encoding="utf-8")
    binding = f"assert receipt['{receipt_key}']==fixture['{fixture_key}']"
    assert binding in source
    mutated = source.replace(binding, "assert True", 1)
    with pytest.raises(AssertionError):
        _validate_restore_workflow_contract(mutated)


@pytest.mark.parametrize(
    ("before", "after"),
    [
        ("'pitr_verified':False", "'pitr_verified':True"),
        (
            "'provider_control_plane_receipt_verified':False",
            "'provider_control_plane_receipt_verified':True",
        ),
        (
            "'restore_operation_reference_verified':False",
            "'restore_operation_reference_verified':True",
        ),
        (
            "'state':'WAITING_FOR_PROVIDER_OR_PHYSICAL_RESTORE_RECEIPT'",
            "'state':'TARGET_TIME_RESTORE_VERIFIED'",
        ),
    ],
)
def test_restore_workflow_truth_claim_mutations_fail_closed(
    before: str, after: str
) -> None:
    source = RESTORE_WORKFLOW.read_text(encoding="utf-8")
    assert before in source
    mutated = source.replace(before, after)
    with pytest.raises(AssertionError):
        _validate_restore_workflow_contract(mutated)
