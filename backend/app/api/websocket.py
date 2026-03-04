"""
WebSocket endpoint for real-time tag value updates and alarm notifications.
"""

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.tag_engine import tag_engine

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    queue = tag_engine.subscribe()

    try:
        # Send initial snapshot
        all_values = tag_engine.get_all_values()
        await websocket.send_json({"type": "snapshot", "data": all_values})

        # Stream updates
        while True:
            try:
                msg = await asyncio.wait_for(queue.get(), timeout=30.0)
                await websocket.send_json(msg)
            except TimeoutError:
                # Send keepalive
                await websocket.send_json({"type": "keepalive"})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        tag_engine.unsubscribe(queue)
