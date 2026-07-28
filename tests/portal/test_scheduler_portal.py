from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]


def test_scheduler_portal_contract():
    html=(ROOT/"public"/"portal"/"index.html").read_text(encoding="utf-8-sig")
    for value in ['id="schedulerEnabled"','id="schedulerLock"','/portal/assets/scheduler.css','/portal/assets/scheduler.js']:
        assert value in html