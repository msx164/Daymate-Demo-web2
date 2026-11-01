import hmac
import os
from urllib.parse import urlsplit
from starlette.responses import JSONResponse


def allowed_origins():
    origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
    desktop = os.environ.get("DAYMATE_DESKTOP_ORIGIN", "")
    try:
        url = urlsplit(desktop)
        if url.scheme == "http" and url.hostname == "127.0.0.1" and url.port and not url.path and not url.query and not url.fragment:
            origins.append(desktop)
    except ValueError:
        pass
    return origins


class DesktopTokenMiddleware:
    """An optional private-instance token; regular web instances stay compatible."""
    def __init__(self, app, token=""):
        self.app, self.token = app, token.encode()

    async def __call__(self, scope, receive, send):
        if self.token and scope["type"] == "http" and scope["method"] != "OPTIONS":
            headers = dict(scope["headers"])
            if not hmac.compare_digest(headers.get(b"x-daymate-desktop-token", b""), self.token):
                await JSONResponse({"detail": "桌面连接认证失败"}, status_code=401)(scope, receive, send)
                return
        await self.app(scope, receive, send)
