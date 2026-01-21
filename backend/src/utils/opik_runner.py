import json
import sys
import io

ORIGINAL_STDOUT = sys.stdout


class _StdoutInterceptor(io.StringIO):
    def write(self, s):  # pragma: no cover - defensive stream shim
        if not s:
            return 0
        text = str(s)
        if text.strip():
            sys.stderr.write(text)
        return len(text)


sys.stdout = _StdoutInterceptor()

from opik_logger import *  # noqa: F401,F403
from opik_optimizer_helpers import *  # noqa: F401,F403


def _emit_json(payload):
    ORIGINAL_STDOUT.write(json.dumps(payload, default=str))
    ORIGINAL_STDOUT.write('\n')
    ORIGINAL_STDOUT.flush()


def main():
    """Entry point for invoking tracked logging helpers from Node."""
    if len(sys.argv) < 2:
        _emit_json({"error": "Function name required"})
        return

    func_name = sys.argv[1]
    payload = {}

    if len(sys.argv) > 2 and sys.argv[2]:
        try:
            payload = json.loads(sys.argv[2])
        except json.JSONDecodeError as exc:
            _emit_json({"error": f"Invalid payload JSON: {exc}"})
            return

    target = globals().get(func_name)
    if target is None:
        _emit_json({"error": f"Function '{func_name}' not found"})
        return

    try:
        result = target(**payload)
    except Exception as exc:  # pragma: no cover - relay error to Node caller
        _emit_json({"error": str(exc)})
        return

    if result is None:
        result = {"status": "ok"}

    _emit_json(result)


if __name__ == "__main__":
    main()
