from app.agent import KAIOSAgent

def test_pipeline_runs():
    result = KAIOSAgent().run()
    assert result["published"] is True
