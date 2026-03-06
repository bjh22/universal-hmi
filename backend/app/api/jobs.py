import json

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.audit import AuditAction
from app.models.job import Job, JobHistory
from app.models.user import User, UserRole
from app.services.audit_service import log_audit
from app.services.tag_engine import tag_engine

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class JobCreate(BaseModel):
    name: str
    description: str | None = None
    setpoints: dict = {}
    download_conditions: dict | None = None


class JobOut(BaseModel):
    id: int
    name: str
    description: str | None
    version: int
    setpoints: str
    created_by: str | None
    created_at: str

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[JobOut])
async def list_jobs(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(Job).order_by(Job.name))
    jobs = result.scalars().all()
    return [_job_out(j) for j in jobs]


@router.get("/{job_id}")
async def get_job(job_id: int, session: AsyncSession = Depends(get_db)):
    job = await session.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_out(job)


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_job(
    body: JobCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.SUPERVISOR, UserRole.ENGINEER, UserRole.DESIGNER)
    ),
):
    job = Job(
        name=body.name,
        description=body.description,
        setpoints=json.dumps(body.setpoints),
        download_conditions=json.dumps(body.download_conditions) if body.download_conditions else None,
        created_by=current_user.username if current_user else None,
    )
    session.add(job)
    await session.flush()
    await log_audit(
        session, AuditAction.JOB_CREATE, user=current_user.username if current_user else None,
        details=f"Created job '{body.name}'",
    )
    return _job_out(job)


@router.put("/{job_id}")
async def update_job(
    job_id: int,
    body: JobCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.SUPERVISOR, UserRole.ENGINEER, UserRole.DESIGNER)
    ),
):
    job = await session.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Save history before updating
    history = JobHistory(
        job_id=job.id, job_name=job.name, version=job.version,
        setpoints=job.setpoints,
        changed_by=current_user.username if current_user else None,
    )
    session.add(history)

    job.name = body.name
    job.description = body.description
    job.setpoints = json.dumps(body.setpoints)
    job.download_conditions = json.dumps(body.download_conditions) if body.download_conditions else None
    job.version += 1
    await session.flush()
    await log_audit(
        session, AuditAction.JOB_UPDATE, user=current_user.username if current_user else None,
        details=f"Updated job '{body.name}' to version {job.version}",
    )
    return _job_out(job)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ENGINEER, UserRole.DESIGNER)
    ),
):
    job = await session.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    await log_audit(
        session, AuditAction.JOB_DELETE, user=current_user.username if current_user else None,
        details=f"Deleted job '{job.name}'",
    )
    await session.delete(job)


@router.post("/{job_id}/download")
async def download_job(
    job_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    """Download job setpoints to the machine (write tag values)."""
    job = await session.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    setpoints = json.loads(job.setpoints)

    # Check download conditions if any
    if job.download_conditions:
        conditions = json.loads(job.download_conditions)
        for cond in conditions.get("guards", []):
            tag_name = cond.get("tag")
            expected = cond.get("value")
            tv = tag_engine.get_value(tag_name)
            if tv and str(tv.value) != str(expected):
                raise HTTPException(
                    status_code=400,
                    detail=f"Download condition not met: {tag_name} must be {expected} (current: {tv.value})",
                )

    # Write all setpoints
    results = {}
    for tag_name, value in setpoints.items():
        success = tag_engine.set_value(tag_name, value)
        results[tag_name] = success

    # Set active job system tag
    tag_engine.set_value("$ACTIVE_JOB", job.name)

    await log_audit(
        session, AuditAction.JOB_DOWNLOAD,
        user=current_user.username if current_user else "anonymous",
        details=f"Downloaded job '{job.name}' v{job.version}",
        source_ip=request.client.host,
    )
    return {"success": True, "results": results}


@router.post("/upload-from-machine")
async def upload_from_machine(
    body: dict,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.SUPERVISOR, UserRole.ENGINEER, UserRole.DESIGNER)
    ),
):
    """Capture current tag values as a new job."""
    name = body.get("name", "Uploaded Job")
    tag_names = body.get("tag_names", [])
    setpoints = {}
    for tn in tag_names:
        tv = tag_engine.get_value(tn)
        if tv:
            setpoints[tn] = tv.value

    job = Job(
        name=name,
        description="Captured from machine",
        setpoints=json.dumps(setpoints),
        created_by=current_user.username if current_user else None,
    )
    session.add(job)
    await session.flush()
    await log_audit(
        session, AuditAction.JOB_UPLOAD,
        user=current_user.username if current_user else None,
        details=f"Uploaded job '{name}' from machine",
    )
    return _job_out(job)


@router.get("/{job_id}/history")
async def get_job_history(job_id: int, session: AsyncSession = Depends(get_db)):
    result = await session.execute(
        select(JobHistory).where(JobHistory.job_id == job_id).order_by(JobHistory.changed_at.desc())
    )
    return result.scalars().all()


def _job_out(job: Job) -> dict:
    return {
        "id": job.id,
        "name": job.name,
        "description": job.description,
        "version": job.version,
        "setpoints": job.setpoints,
        "download_conditions": job.download_conditions,
        "created_by": job.created_by,
        "created_at": job.created_at.isoformat() if job.created_at else "",
    }
