"""Bind a private ephemeral port and announce readiness to the owning Electron app."""
import json
import socket
import sys
import threading
import uvicorn


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == '--inspect-db':
        from import_database import inspect_database
        try:
            print(json.dumps(inspect_database(sys.argv[2])), flush=True)
        except Exception:
            print('Snapshot validation failed.', file=sys.stderr)
            sys.exit(1)
        sys.exit(0)
    if len(sys.argv) == 4 and sys.argv[1] == "--import-db":
        from import_database import import_database
        try:
            print(json.dumps(import_database(sys.argv[2], sys.argv[3])), flush=True)
        except Exception:
            print("Database import failed; source unchanged and destination not overwritten.", file=sys.stderr)
            sys.exit(1)
        sys.exit(0)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen(128)
        # Import before announcing: migration or dependency failures must fail startup.
        from main import app
        print("DAYMATE_READY " + json.dumps({"port": listener.getsockname()[1]}), flush=True)
        server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", log_level="warning", timeout_graceful_shutdown=3))
        def parent_closed():
            sys.stdin.buffer.read()
            server.should_exit = True
        threading.Thread(target=parent_closed, daemon=True).start()
        server.run(sockets=[listener])
