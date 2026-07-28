from datetime import datetime, timedelta, timezone
from app.scheduler.repository import SchedulerRepository


def test_lock_prevents_overlap(tmp_path):
    repo=SchedulerRepository(database_path=tmp_path/"scheduler.db")
    now=datetime(2026,7,28,tzinfo=timezone.utc)
    assert repo.acquire_lock("one",60,now)
    assert not repo.acquire_lock("two",60,now+timedelta(seconds=10))


def test_stale_lock_recovery(tmp_path):
    repo=SchedulerRepository(database_path=tmp_path/"scheduler.db")
    now=datetime(2026,7,28,tzinfo=timezone.utc)
    assert repo.acquire_lock("one",30,now)
    assert repo.acquire_lock("two",30,now+timedelta(seconds=31))
    assert repo.get_lock()["owner_id"]=="two"