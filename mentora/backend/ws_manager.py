from __future__ import annotations

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active: dict[str, set[WebSocket]] = {}

    async def connect(self, username: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active.setdefault(username, set()).add(websocket)

    def disconnect(self, username: str, websocket: WebSocket) -> None:
        if username not in self.active:
            return
        self.active[username].discard(websocket)
        if not self.active[username]:
            self.active.pop(username, None)

    async def send_to(self, username: str, payload: dict) -> None:
        if username not in self.active:
            return
        dead: list[WebSocket] = []
        for ws in self.active.get(username, set()):
            try:
                await ws.send_json(payload)
            except RuntimeError:
                dead.append(ws)
        for ws in dead:
            self.disconnect(username, ws)


manager = ConnectionManager()
