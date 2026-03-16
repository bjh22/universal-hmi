"""
WebSocket endpoint for real-time tag value updates and alarm notifications.
Unlike REST APIs (request → response), WebSockets maintain a persistent
bidirectional connection so the server can push updates to the browser
the instant they happen, without the client having to poll.
"""

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

from app.services.tag_engine import tag_engine

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # Connection flow: accept → subscribe → send snapshot → stream updates
    await websocket.accept()
    # Subscribe gives us an asyncio.Queue that receives tag updates.
    # Each connected client gets its own queue so they can consume at their own pace.
    queue = tag_engine.subscribe()

    try:
        # Send an initial snapshot of all current tag values so the client
        # doesn't have to wait for the next change to see the current state.
        all_values = tag_engine.get_all_values()
        await websocket.send_json({"type": "snapshot", "data": all_values})

        # Send initial datasource connection statuses
        ds_statuses = tag_engine.get_datasource_statuses()
        if ds_statuses:
            await websocket.send_json({"type": "datasource_status", "data": ds_statuses})

        # Stream updates as they occur, indefinitely
        while True:
            try:
                # Wait up to 30 seconds for a new update from the tag engine.
                # asyncio.wait_for raises TimeoutError if nothing arrives in time.
                msg = await asyncio.wait_for(queue.get(), timeout=30.0)
                await websocket.send_json(msg)
            except TimeoutError:
                # If no updates arrive within 30 seconds, send a keepalive message
                # to prevent the browser (or network proxies) from thinking the
                # connection is dead and closing it.
                await websocket.send_json({"type": "keepalive"})
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.debug("WebSocket connection error", exc_info=True)
    finally:
        # Always unsubscribe when the connection ends, even if the client
        # disconnected unexpectedly. This prevents memory leaks from orphaned
        # queues that would keep accumulating messages with no one reading them.
        tag_engine.unsubscribe(queue)
