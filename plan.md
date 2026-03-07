# HMI Project Management — Implementation Plan

## Concept

A **project** bundles all configuration needed to reproduce an HMI setup: data sources, tags (with labels, alarm configs, simulation configs), screens, screen templates, tag templates, and jobs. Users can **save** (persist metadata), **open** (switch between projects), and **export/import** (portable JSON file).

## What a Project Contains

| Included | Why |
|----------|-----|
| Data Sources | Protocol connection configs |
| Tags + Tag Labels | All variables, alarm configs, simulation, enum mappings |
| Tag Templates | Reusable tag definitions |
| Screens + Screen Versions | Visual layouts with widgets |
| Screen Templates | Reusable screen patterns |
| Jobs | Setpoint recipes |

**Not included** (runtime/operational data): users, trend_data, alarm_history, production_runs, audit_logs.

## Data Model

### New table: `projects`

```python
class Project(Base):
    __tablename__ = "projects"
    id: Mapped[int] — primary key
    name: Mapped[str] — unique project name
    description: Mapped[str | None]
    version: Mapped[str] — semantic version (e.g. "1.0.0")
    is_active: Mapped[bool] — only one project active at a time
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]
```

All existing tables (tags, screens, data_sources, jobs, tag_labels, tag_templates, screen_templates) gain a nullable `project_id` foreign key. Null = legacy/unassigned data.

### Export format: `.hmi.json`

```json
{
  "format_version": "1.0",
  "project": { "name": "...", "description": "...", "version": "..." },
  "exported_at": "2026-03-07T12:00:00Z",
  "data_sources": [...],
  "tag_labels": [...],
  "tags": [...],
  "tag_templates": [...],
  "screens": [...],
  "screen_templates": [...],
  "jobs": [...]
}
```

Tags reference data sources by name (not ID). Widgets reference tags by name. Jobs reference tags by name. This makes the file fully portable.

## Implementation Steps

### Step 1: Backend — Project Model + Migration

- Create `backend/app/models/project.py` with the `Project` SQLAlchemy model
- Add `project_id` FK column to: tags, screens, data_sources, jobs, tag_labels, tag_templates, screen_templates
- Update `backend/app/core/database.py` migration logic to add the new table + columns

### Step 2: Backend — Project CRUD API

- Create `backend/app/api/projects.py` router with:
  - `GET /api/projects/` — list all projects
  - `POST /api/projects/` — create new project
  - `GET /api/projects/{id}` — get project details (with counts)
  - `PUT /api/projects/{id}` — update project metadata
  - `DELETE /api/projects/{id}` — delete project (and optionally its resources)
  - `POST /api/projects/{id}/activate` — set as active project
  - `GET /api/projects/active` — get the currently active project
- Register router in `main.py`

### Step 3: Backend — Export/Import API

- `GET /api/projects/{id}/export` — serialize project to JSON, return as file download
- `POST /api/projects/import` — accept JSON file, create project + all resources
  - Handles ID remapping (tags reference data sources by name, widgets reference tags by name)
  - Conflict resolution: option to skip or overwrite existing names
- Import logic:
  1. Create project record
  2. Import data sources (map old name → new ID)
  3. Import tag labels
  4. Import tags (resolve data_source by name, attach labels by name)
  5. Import tag templates
  6. Import screens (layout JSON uses tag names, so no remapping needed)
  7. Import screen templates
  8. Import jobs (setpoints use tag names, resolve to new IDs)

### Step 4: Frontend — Project Manager UI

- New page: `frontend/src/pages/ProjectsPage.tsx`
  - Project list with name, description, version, active badge, created/updated dates
  - Create project dialog
  - Edit project dialog
  - Delete project with confirmation
  - Activate project button
  - Export button (triggers file download)
  - Import button (file upload dialog with conflict options)
- Add Projects link to sidebar navigation in `AppShell.tsx`
- Add route in app router

### Step 5: Frontend — API Client + Types

- Add project types to `frontend/src/types/index.ts`
- Add project API functions to `frontend/src/lib/api.ts`

### Step 6: Wire Up Active Project Filtering

- Backend: filter tags, screens, etc. by active project's `project_id` when a project is active
- Frontend: show active project name in header/sidebar
- Assign unassigned resources to project on activation

### Step 7: Build + Lint Verification

- Run `./dev.sh check` to verify TypeScript compiles and ESLint passes
