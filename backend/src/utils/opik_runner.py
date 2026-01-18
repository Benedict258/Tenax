import json
import sys

from opik_logger import *  # noqa: F401,F403


def main():
    """Entry point for invoking tracked logging helpers from Node."""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Function name required"}))
        return

    func_name = sys.argv[1]
    payload = {}

    if len(sys.argv) > 2 and sys.argv[2]:
        try:
            payload = json.loads(sys.argv[2])
        except json.JSONDecodeError as exc:
            print(json.dumps({"error": f"Invalid payload JSON: {exc}"}))
            return

    target = globals().get(func_name)
    if target is None:
        print(json.dumps({"error": f"Function '{func_name}' not found"}))
        return

    try:
        result = target(**payload)
    except Exception as exc:  # pragma: no cover - relay error to Node caller
        print(json.dumps({"error": str(exc)}))
        return

    if result is None:
        result = {"status": "ok"}

    print(json.dumps(result, default=str))


if __name__ == "__main__":
    main()
