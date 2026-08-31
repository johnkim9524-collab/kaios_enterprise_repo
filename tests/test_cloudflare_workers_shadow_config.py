import json
from pathlib import Path


def test_workers_shadow_assets_directory_resolves_from_wrangler_config():
    repo = Path(__file__).resolve().parents[1]
    config_path = repo / "infrastructure/cloudflare/workers/kidults-public-portal-shadow/wrangler.jsonc"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    configured = config["assets"]["directory"]
    assert configured != "apps/kidults-enterprise-staging/public/portal"
    resolved = (config_path.parent / configured).resolve()
    expected = (repo / "apps/kidults-enterprise-staging/public/portal").resolve()
    assert resolved == expected
    assert resolved.is_dir()
    assert (resolved / "index.html").is_file()
    assert (resolved / "workspace.html").is_file()
    assert config["workers_dev"] is True
    assert config["preview_urls"] is False
    assert config["routes"] == []
