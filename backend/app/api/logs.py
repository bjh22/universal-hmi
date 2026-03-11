"""Application log endpoints for the Support > Logs page."""

import csv
import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.models.user import User
from app.services.log_service import log_handler

router = APIRouter(prefix="/api/logs", tags=["logs"])


class LogEntryResponse(BaseModel):
    timestamp: str
    level: str
    logger_name: str
    message: str


class LogsResponse(BaseModel):
    entries: list[LogEntryResponse]
    total: int


@router.get("/", response_model=LogsResponse)
async def get_logs(
    level: str | None = Query(None),
    search: str | None = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    _user: User | None = Depends(get_current_user),
):
    entries, total = log_handler.get_entries(level=level, search=search, limit=limit)
    return LogsResponse(
        entries=[
            LogEntryResponse(
                timestamp=e.timestamp,
                level=e.level,
                logger_name=e.logger_name,
                message=e.message,
            )
            for e in entries
        ],
        total=total,
    )


@router.get("/export/csv")
async def export_logs_csv(
    level: str | None = Query(None),
    search: str | None = Query(None),
    _user: User | None = Depends(get_current_user),
):
    entries, _ = log_handler.get_entries(level=level, search=search, limit=2000)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Timestamp", "Level", "Logger", "Message"])
    for e in entries:
        writer.writerow([e.timestamp, e.level, e.logger_name, e.message])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=hmi_logs.csv"},
    )
