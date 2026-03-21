# Testing Strategy for Universal HMI

## Overview

This document describes the automated testing approach for the HMI. Automated tests are scripts that verify the application works correctly — like a self-diagnostic routine that checks alarm logic, OEE calculations, authentication, and UI behavior after every code change. This catches bugs before they reach production.

The strategy prioritizes correctness of critical calculations and state machines (alarm transitions, OEE math, tag simulation), starting with the highest-value code.

> **Note:** This document was the original testing plan. The tests described here have been implemented. See `DEVELOPER.md` > Testing for the current state.

## Testing Tools

### Backend: pytest

- **pytest** is the standard Python testing tool. It discovers test functions, runs them, and reports pass/fail results.
- Additional tools: `pytest-asyncio` (for testing async code), `pytest-cov` (for measuring which code is covered by tests), `httpx` (for simulating HTTP requests to the API), `freezegun` (for freezing time in tests)
- Installed via: `backend/requirements-dev.txt` (separate from production — these don't ship to panel PCs)

### Frontend: Vitest

- **Vitest** is the JavaScript testing tool. It renders UI components in a simulated browser and checks they display correctly.
- Additional tools: `@testing-library/react` (for rendering components), `jsdom` (simulated browser environment)
- Installed via: `frontend/package.json` (development dependencies only)

---

## Test Directory Structure

```
backend/
  tests/
    conftest.py                    # Shared fixtures (async session, tag engine, etc.)
    unit/
      test_reporting_intervals.py  # ReportingService interval arithmetic
      test_reporting_oee.py        # OEE calculation logic
      test_alarm_state_machine.py  # AlarmService state transitions
      test_alarm_conditions.py     # Boolean condition checking
      test_tag_simulation.py       # TagEngine simulation modes
      test_tag_coercion.py         # Value type coercion
      test_auth_jwt.py             # JWT creation/decode/expiry
      test_zpl_renderer.py         # ZPL-to-PNG rendering
    integration/
      test_auth_api.py             # Login endpoints, role enforcement
      test_tags_api.py             # Tag CRUD + live value reads
      test_alarms_api.py           # Alarm acknowledgment flow
      test_reporting_api.py        # Report computation endpoints
      test_screens_api.py          # Screen CRUD
  requirements-dev.txt             # Test dependencies

frontend/
  src/
    hooks/
      __tests__/
        useDesignMode.test.ts      # Editor state machine
        useWebSocket.test.ts       # Message handling, reconnect
        useAuth.test.ts            # Inactivity timeout
    components/
      widgets/
        __tests__/
          WidgetRenderer.test.tsx   # Dispatch + memoization
          GaugeWidget.test.tsx      # Color thresholds, display modes
          StatusIndicator.test.tsx  # Value-to-label mapping
    lib/
      __tests__/
        api.test.ts                # HTTP client error handling
  vitest.config.ts                 # Vitest configuration
```

---

## Phased Implementation Order

### Phase 1: Backend Unit Tests (Highest Value)

These target pure functions with complex logic and no I/O dependencies — the easiest to test and the most valuable.

#### Priority 1 — ReportingService Interval Arithmetic

**File:** `test_reporting_intervals.py`
**Source:** `backend/app/services/reporting_service.py`

| Function | What to Test |
|----------|-------------|
| `_clamp_interval()` | Time range intersection, non-overlapping ranges return None |
| `_subtract_intervals()` | Multi-interval subtraction, overlapping/non-overlapping cases |
| `_build_intervals_from_trend()` | State transitions from trend samples, edge cases at boundaries |
| `_merge_fault_intervals()` | Overlapping fault collapse, tracking contributing faults |
| Exception capping | 5-minute cap splits long faults into downtime + idle |

**Estimated tests:** 15-20

#### Priority 2 — ReportingService OEE Calculation

**File:** `test_reporting_oee.py`
**Source:** `backend/app/services/reporting_service.py`

| Scenario | What to Test |
|----------|-------------|
| OEE formula | Availability x Performance x Quality |
| Edge cases | Zero uptime, zero count, no reject tags, missing settings |
| Count delta | Counter wraparound handling |
| Time bucketing | Day/week/month boundary generation via `_generate_buckets()` |
| Performance cap | Rate / target_rate capped at 1.0 |

**Estimated tests:** 10-15

#### Priority 3 — AlarmService State Machine

**File:** `test_alarm_state_machine.py`
**Source:** `backend/app/services/alarm_service.py`

| Transition | Description |
|-----------|-------------|
| New alarm | None → `active_unacked` |
| Acknowledge | `active_unacked` → `active_acked` |
| Clear after ack | `active_acked` → `inactive` (history recorded) |
| Clear before ack | `active_unacked` → `inactive_unacked` |
| Late ack | `inactive_unacked` → `inactive` (history recorded) |
| Retrigger | `inactive_unacked` → `active_unacked` |
| Config reload | Stale alarms retired when config changes |

**Estimated tests:** 10-12

#### Priority 4 — AlarmService Conditions

**File:** `test_alarm_conditions.py`
**Source:** `backend/app/services/alarm_service.py`

| Scenario | What to Test |
|----------|-------------|
| Bool coercion | `"true"`, `"1"`, `"yes"` → True |
| Default trigger | `trigger_on=True` behavior |
| Numeric comparison | Threshold-based conditions |

**Estimated tests:** 5-8

#### Priority 5 — TagEngine Simulation

**File:** `test_tag_simulation.py`
**Source:** `backend/app/services/tag_engine.py`

| Mode | What to Test |
|------|-------------|
| SINE | Oscillates within min/max range |
| RAMP | Linearly increases, wraps at max |
| RANDOM | Stays within min/max bounds |
| TOGGLE | Alternates between two values |
| ENUM_CYCLE | Cycles through enum values |
| Deadband | Small changes within deadband are suppressed |

**Estimated tests:** 8-10

#### Priority 6 — TagEngine Value Coercion

**File:** `test_tag_coercion.py`
**Source:** `backend/app/services/tag_engine.py`

| Type | What to Test |
|------|-------------|
| float | String "3.14" → 3.14, int 5 → 5.0 |
| int | String "42" → 42, float 3.7 → 3 |
| bool | String "true"/"1" → True, "false"/"0" → False |
| string | Any value → str representation |
| None | Graceful handling of None input |

**Estimated tests:** 8-10

#### Priority 7 — Authentication

**File:** `test_auth_jwt.py`
**Source:** `backend/app/api/auth.py`, `backend/app/core/security.py`

| Scenario | What to Test |
|----------|-------------|
| JWT creation | Correct payload (sub, role, exp) |
| JWT decode | Valid token returns payload |
| JWT expiry | Expired token returns None |
| JWT tampered | Modified token raises error |
| Password hash | Same password hashes differently (salt) |
| Password verify | Round-trip: hash then verify succeeds |

**Estimated tests:** 6-8

### Phase 2: Backend Integration Tests

These test API endpoints with a real (in-memory) database using FastAPI's async TestClient.

#### Priority 8 — Auth API (`test_auth_api.py`)
- Login with valid/invalid credentials
- PIN login flow
- Role enforcement: 401 (no auth) and 403 (wrong role) responses
- **Estimated tests:** 8-10

#### Priority 9 — Tags API (`test_tags_api.py`)
- CRUD operations (create, read, update, delete)
- Tag values endpoint reads from in-memory TagEngine
- Write endpoint routes through TagEngine
- **Estimated tests:** 6-8

#### Priority 10 — Reporting API (`test_reporting_api.py`)
- Summary endpoint with valid production settings
- Time-series bucketing returns correct structure
- Downtime periods listing
- **Estimated tests:** 6-8

### Phase 3: Frontend Unit Tests

#### Priority 11 — useDesignMode (`useDesignMode.test.ts`)
- Undo/redo history stack (50-entry cap, correct snapshot restoration)
- Alignment algorithms: left, center, right, top, middle, bottom
- Distribution algorithms: horizontal/vertical even spacing
- Z-order: bringForward, sendBackward, bringToFront, sendToBack
- Widget lock prevents deletion and movement
- Clipboard: copy, cut, paste with offset
- **Estimated tests:** 15-20

#### Priority 12 — Widget Logic (`GaugeWidget.test.tsx`, `StatusIndicator.test.tsx`)
- GaugeWidget `getColor()` threshold-based coloring (normal/warning/critical)
- GaugeWidget target deviation mode
- StatusIndicator value-to-label mapping with fallback
- **Estimated tests:** 8-10

#### Priority 13 — useWebSocket (`useWebSocket.test.ts`)
- Message type handling: snapshot, tag_update, alarms_snapshot, alarm
- Reconnect exponential backoff (1s → 2s → 4s → ... → 30s cap)
- Stale connection guard prevents old callbacks corrupting state
- **Estimated tests:** 8-10

#### Priority 14 — API Client (`api.test.ts`)
- JWT Bearer header injection
- Error response handling (non-2xx throws)
- URL encoding for special characters
- **Estimated tests:** 5-6

---

## Configuration Files

### `backend/requirements-dev.txt`

```
pytest>=8.0
pytest-asyncio>=0.24
pytest-cov>=5.0
httpx>=0.27
freezegun>=1.4
```

### `backend/pytest.ini`

```ini
[pytest]
asyncio_mode = auto
testpaths = tests
python_files = test_*.py
python_functions = test_*
```

### `frontend/vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

### `frontend/src/test-setup.ts`

```ts
import '@testing-library/jest-dom'
```

---

## Key Backend Test Fixtures (`conftest.py`)

| Fixture | Purpose |
|---------|---------|
| `db_session` | In-memory SQLite async session, isolated per test |
| `tag_engine` | TagEngine instance with mock tags loaded |
| `alarm_service` | AlarmService with mock tag_engine |
| `test_client` | FastAPI async TestClient with overridden DB dependency |
| `seeded_db` | Session pre-loaded with default users/tags from seed data |

---

## Dev Script Integration

Add `test` command to `dev.sh`, `dev.bat`, `dev.ps1`:

```bash
./dev.sh test          # Run all tests (backend + frontend)
./dev.sh test:backend  # Backend only: python -m pytest tests/ -v --tb=short
./dev.sh test:frontend # Frontend only: npx vitest run
```

---

## Estimated Test Counts

| Category | Tests | Phase |
|----------|-------|-------|
| Backend unit (services) | 65-85 | 1 |
| Backend integration (API) | 20-26 | 2 |
| Frontend unit (hooks/widgets) | 36-46 | 3 |
| **Total** | **120-157** | |

---

## What This Strategy Does NOT Cover

- **E2E tests** (Playwright/Cypress) — separate concern, recommended as a future phase
- **Load/performance testing** — not typical for industrial HMI
- **Visual regression testing** — could be useful for widgets but low priority
- **Driver tests** (OPC-UA, Modbus, etc.) — require hardware or protocol simulators

---

## Verification Checklist

After implementing each phase:

1. `cd backend && python -m pytest tests/ -v` — all backend tests pass
2. `cd frontend && npx vitest run` — all frontend tests pass
3. `./dev.sh test` — unified test command works
4. `./dev.sh check` — existing build + lint still passes
5. `cd backend && python -m pytest --cov=app tests/` — review coverage baseline
