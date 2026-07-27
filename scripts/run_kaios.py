from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.agent import KAIOSAgent

if __name__ == "__main__":
    print(KAIOSAgent().run())
