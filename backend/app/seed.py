"""
Seed script: Creates default users and example simulation tags for development.
Run: python -m app.seed
"""

import asyncio
import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session, init_db
from app.core.security import hash_password
from app.models.datasource import DataSource, ProtocolType
from app.models.project import Project  # noqa: F401 — registers 'projects' table for FK resolution
from app.models.screen import Screen
from app.models.tag import SimulationBehavior, Tag, TagAccessMode, TagDataType, TagLabel
from app.models.reason_code import ReasonCode
from app.models.user import User, UserRole


async def create_demo_resources(session: AsyncSession):
    """Create demo packaging machine resources (data source, tags, labels, screens).

    This is a standalone function so it can be called from both the seed script
    and the project create-demo API endpoint.  It does NOT create users and does
    NOT commit — the caller is responsible for committing.
    """

    # Simulation data source
    sim_ds = DataSource(
        name="Simulation",
        protocol=ProtocolType.SIMULATION,
        enabled=True,
        config=json.dumps({"description": "Built-in simulation data source"}),
    )
    session.add(sim_ds)
    await session.flush()

    # Packaging machine simulation tags
    sim_tags = [
        Tag(
            name="Machine.State",
            display_name="Machine operating state",
            description="Current operating state of the packaging machine. States: 0=Stopped (machine is idle and safe to access), 1=Running (machine is in automatic production mode), 2=Faulted (machine has stopped due to an error condition — check alarm log), 3=Idle (machine is powered on but waiting for a start command).",
            data_source_id=sim_ds.id,
            data_type=TagDataType.INT,
            access_mode=TagAccessMode.READ_WRITE,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.ENUM_CYCLE,
            simulation_config=json.dumps({"values": [0, 1, 2, 3], "period": 30}),
            enum_mapping=json.dumps({"0": "Stopped", "1": "Running", "2": "Faulted", "3": "Idle"}),
        ),
        Tag(
            name="Machine.Speed",
            display_name="Machine speed in units/min",
            description="Current actual speed of the packaging machine measured by the main drive encoder. This is a read-back value reflecting real-time production throughput, not the commanded setpoint. Normal operating range is 80–150 units/min. Values above 160 may indicate a control issue.",
            data_source_id=sim_ds.id,
            data_type=TagDataType.FLOAT,
            access_mode=TagAccessMode.READ_WRITE,
            engineering_units="units/min",
            min_value=0,
            max_value=200,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.SINE,
            simulation_config=json.dumps({"min": 80, "max": 150, "period": 60}),
            trending_enabled=True,
            trending_sample_rate_ms=1000,
        ),
        Tag(
            name="Machine.Temperature",
            display_name="Sealing bar temperature",
            description="Temperature of the main sealing bar measured by an embedded thermocouple. This temperature must remain within 100–180\u00b0C for proper seal integrity. Below 100\u00b0C seals will be weak or incomplete; above 180\u00b0C film may burn or deform. An alarm is triggered outside this range.",
            data_source_id=sim_ds.id,
            data_type=TagDataType.FLOAT,
            access_mode=TagAccessMode.READ,
            engineering_units="\u00b0C",
            min_value=0,
            max_value=300,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.SINE,
            simulation_config=json.dumps({"min": 140, "max": 160, "period": 120}),
            trending_enabled=True,
            trending_sample_rate_ms=2000,
        ),
        Tag(
            name="Machine.GoodCount",
            display_name="Good product count",
            data_source_id=sim_ds.id,
            data_type=TagDataType.INT,
            access_mode=TagAccessMode.READ_WRITE,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.RAMP,
            simulation_config=json.dumps({"min": 0, "max": 10000, "period": 600}),
        ),
        Tag(
            name="Machine.RejectCount",
            display_name="Rejected product count",
            data_source_id=sim_ds.id,
            data_type=TagDataType.INT,
            access_mode=TagAccessMode.READ_WRITE,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.RAMP,
            simulation_config=json.dumps({"min": 0, "max": 50, "period": 600}),
        ),
        Tag(
            name="Machine.Pressure",
            display_name="System pressure",
            description="Pneumatic system supply pressure feeding the actuators, clamps, and sealing cylinders. Normal operating pressure is 4.5–6.5 bar. Below 3 bar the machine cannot operate safely and will fault. Above 7 bar indicates a regulator failure. A critical alarm is triggered outside the safe range.",
            data_source_id=sim_ds.id,
            data_type=TagDataType.FLOAT,
            access_mode=TagAccessMode.READ,
            engineering_units="bar",
            min_value=0,
            max_value=10,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.RANDOM,
            simulation_config=json.dumps({"min": 4.5, "max": 6.5}),
            trending_enabled=True,
            trending_sample_rate_ms=2000,
        ),
        Tag(
            name="Machine.Running",
            display_name="Machine running status",
            data_source_id=sim_ds.id,
            data_type=TagDataType.BOOL,
            access_mode=TagAccessMode.READ_WRITE,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.TOGGLE,
            simulation_config=json.dumps({"period": 60}),
        ),
        Tag(
            name="Machine.TempAlarm",
            display_name="Temperature alarm flag",
            description="Boolean flag set by the PLC when sealing bar temperature is outside the acceptable range (below 100\u00b0C or above 180\u00b0C). The PLC evaluates the analog threshold and sets this flag for the HMI to display. Resets automatically when temperature returns to normal range.",
            data_source_id=sim_ds.id,
            data_type=TagDataType.BOOL,
            access_mode=TagAccessMode.READ,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.TOGGLE,
            simulation_config=json.dumps({"period": 120}),
            alarm_enabled=True,
            alarm_config=json.dumps({
                "type": "boolean",
                "trigger_on": True,
                "severity": "warning",
                "message": "Sealing bar temperature out of range",
            }),
        ),
        Tag(
            name="Machine.PressureAlarm",
            display_name="Pressure alarm flag",
            description="Boolean flag set by the PLC when pneumatic system pressure is outside the safe operating range (below 3 bar or above 7 bar). The PLC evaluates the analog threshold and sets this flag for the HMI to display. This is a critical alarm that will cause the machine to fault.",
            data_source_id=sim_ds.id,
            data_type=TagDataType.BOOL,
            access_mode=TagAccessMode.READ,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.TOGGLE,
            simulation_config=json.dumps({"period": 180}),
            alarm_enabled=True,
            alarm_config=json.dumps({
                "type": "boolean",
                "trigger_on": True,
                "severity": "critical",
                "message": "System pressure out of safe range",
            }),
        ),
        Tag(
            name="Machine.TargetSpeed",
            display_name="Target speed setpoint",
            description="This setpoint sets the maximum speed of the packaging machine in automatic mode. The drive will ramp to this speed over approximately 5 seconds. Changing this value during production will take effect immediately. Job recipes may override this value when downloaded.",
            data_source_id=sim_ds.id,
            data_type=TagDataType.FLOAT,
            access_mode=TagAccessMode.READ_WRITE,
            engineering_units="units/min",
            min_value=0,
            max_value=200,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.STATIC,
            simulation_config=json.dumps({"value": 120}),
        ),
        Tag(
            name="Machine.FilmWidth",
            display_name="Film width setting",
            description="Sets the film web width for the current product. This value controls the cross-seal knife position and film guide spacing. Must match the actual film roll width being used. Changing this value requires the machine to be stopped. Valid range: 50–500 mm.",
            data_source_id=sim_ds.id,
            data_type=TagDataType.FLOAT,
            access_mode=TagAccessMode.READ_WRITE,
            engineering_units="mm",
            min_value=50,
            max_value=500,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.STATIC,
            simulation_config=json.dumps({"value": 200}),
        ),
        Tag(
            name="Machine.SealTemp",
            display_name="Seal temperature setpoint",
            description="Sets the target temperature for the sealing bar heater. The PID controller will regulate the heater to maintain this temperature. Optimal seal temperature depends on the film material \u2014 typically 140\u2013160\u00b0C for PE film, 170\u2013190\u00b0C for laminated materials. Allow 2\u20133 minutes for temperature to stabilize after changing.",
            data_source_id=sim_ds.id,
            data_type=TagDataType.FLOAT,
            access_mode=TagAccessMode.READ_WRITE,
            engineering_units="\u00b0C",
            min_value=50,
            max_value=250,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.STATIC,
            simulation_config=json.dumps({"value": 150}),
        ),
    ]
    for t in sim_tags:
        session.add(t)
    await session.flush()

    # Tag labels
    job_setpoint_label = TagLabel(
        name="Job Setpoint",
        color="#3b82f6",
        description="Tags included by default when creating a new job",
    )
    session.add(job_setpoint_label)

    machine_label = TagLabel(
        name="Machine",
        color="#22c55e",
        description="Machine status and sensor tags",
    )
    session.add(machine_label)
    await session.flush()

    # Assign labels to tags
    setpoint_names = {"Machine.TargetSpeed", "Machine.FilmWidth", "Machine.SealTemp"}
    for t in sim_tags:
        result = await session.execute(select(Tag).where(Tag.name == t.name))
        db_tag = result.scalar_one_or_none()
        if db_tag is None:
            continue
        if db_tag.name in setpoint_names:
            db_tag.labels.append(job_setpoint_label)
        db_tag.labels.append(machine_label)

    # Default dashboard screen (absolute mode, 1920x1080)
    session.add(Screen(
        name="Dashboard",
        slug="dashboard",
        is_default=True,
        sort_order=0,
        layout_mode="absolute",
        target_resolution=json.dumps({"width": 1920, "height": 1080}),
        layout=json.dumps([
            {
                "id": "w1",
                "type": "status_indicator",
                "x": 20, "y": 20, "w": 600, "h": 300,
                "props": {
                    "title": "Machine State",
                    "tag": "Machine.State",
                    "mapping": {"0": {"label": "Stopped", "color": "#6b7280"}, "1": {"label": "Running", "color": "#22c55e"}, "2": {"label": "Faulted", "color": "#ef4444"}, "3": {"label": "Idle", "color": "#f59e0b"}},
                },
            },
            {
                "id": "w2",
                "type": "gauge",
                "x": 640, "y": 20, "w": 620, "h": 360,
                "props": {
                    "title": "Speed",
                    "tag": "Machine.Speed",
                    "min": 0, "max": 200,
                    "units": "units/min",
                    "warning": 160, "critical": 180,
                },
            },
            {
                "id": "w3",
                "type": "gauge",
                "x": 1280, "y": 20, "w": 620, "h": 360,
                "props": {
                    "title": "Temperature",
                    "tag": "Machine.Temperature",
                    "min": 0, "max": 300,
                    "units": "\u00b0C",
                    "warning": 180, "critical": 220,
                },
            },
            {
                "id": "w4",
                "type": "counter",
                "x": 20, "y": 400, "w": 460, "h": 260,
                "props": {"title": "Good Count", "tag": "Machine.GoodCount"},
            },
            {
                "id": "w5",
                "type": "counter",
                "x": 500, "y": 400, "w": 460, "h": 260,
                "props": {"title": "Reject Count", "tag": "Machine.RejectCount"},
            },
            {
                "id": "w6",
                "type": "gauge",
                "x": 980, "y": 400, "w": 460, "h": 340,
                "props": {
                    "title": "Pressure",
                    "tag": "Machine.Pressure",
                    "min": 0, "max": 10,
                    "units": "bar",
                    "warning": 7, "critical": 8,
                },
            },
            {
                "id": "w7",
                "type": "toggle",
                "x": 1460, "y": 400, "w": 440, "h": 260,
                "props": {"title": "Machine Running", "tag": "Machine.Running"},
            },
        ]),
    ))

    # Control panel screen (absolute mode, 1920x1080)
    session.add(Screen(
        name="Control Panel",
        slug="controls",
        sort_order=1,
        layout_mode="absolute",
        target_resolution=json.dumps({"width": 1920, "height": 1080}),
        layout=json.dumps([
            {
                "id": "c1",
                "type": "parameter_input",
                "x": 20, "y": 20, "w": 600, "h": 260,
                "props": {
                    "title": "Target Speed",
                    "tag": "Machine.TargetSpeed",
                    "min": 0, "max": 200, "step": 5,
                    "units": "units/min",
                },
            },
            {
                "id": "c2",
                "type": "parameter_input",
                "x": 640, "y": 20, "w": 620, "h": 260,
                "props": {
                    "title": "Film Width",
                    "tag": "Machine.FilmWidth",
                    "min": 50, "max": 500, "step": 10,
                    "units": "mm",
                },
            },
            {
                "id": "c3",
                "type": "parameter_input",
                "x": 1280, "y": 20, "w": 620, "h": 260,
                "props": {
                    "title": "Seal Temperature",
                    "tag": "Machine.SealTemp",
                    "min": 50, "max": 250, "step": 5,
                    "units": "\u00b0C",
                },
            },
            {
                "id": "c4",
                "type": "command_button",
                "x": 20, "y": 300, "w": 460, "h": 260,
                "props": {
                    "title": "Start Machine",
                    "tag": "Machine.Running",
                    "value": True,
                    "color": "green",
                    "confirm": True,
                },
            },
            {
                "id": "c5",
                "type": "command_button",
                "x": 500, "y": 300, "w": 460, "h": 260,
                "props": {
                    "title": "Stop Machine",
                    "tag": "Machine.Running",
                    "value": False,
                    "color": "red",
                    "confirm": True,
                },
            },
            {
                "id": "c6",
                "type": "command_button",
                "x": 980, "y": 300, "w": 460, "h": 260,
                "props": {
                    "title": "Reset Counts",
                    "script": "write_tag('Machine.GoodCount', 0)\nwrite_tag('Machine.RejectCount', 0)\nlog('Counts reset')",
                    "color": "blue",
                    "confirm": True,
                },
            },
        ]),
    ))

    await session.flush()


async def seed():
    await init_db()

    async with async_session() as session:
        # Default users (skip existing)
        user_defs = [
            ("admin", "Administrator", hash_password("admin"), UserRole.DESIGNER),
            ("engineer", "Engineer", hash_password("engineer"), UserRole.ENGINEER),
            ("supervisor", "Supervisor", hash_password("1234"), UserRole.SUPERVISOR),
            ("operator", "Operator", hash_password("0000"), UserRole.OPERATOR),
        ]
        for username, display_name, hashed_pw, role in user_defs:
            existing = await session.execute(
                select(User).where(User.username == username)
            )
            if existing.scalar_one_or_none() is None:
                session.add(User(
                    username=username,
                    display_name=display_name,
                    hashed_password=hashed_pw,
                    role=role,
                ))

        # Reason codes
        existing_rc = await session.execute(select(ReasonCode).limit(1))
        if existing_rc.scalar_one_or_none() is None:
            default_codes = [
                ReasonCode(code="MECHANICAL", description="Mechanical failure or breakdown", category="Equipment", sort_order=0),
                ReasonCode(code="ELECTRICAL", description="Electrical fault or power issue", category="Equipment", sort_order=1),
                ReasonCode(code="MATERIAL", description="Raw material issue (jam, empty, defective)", category="Material", sort_order=2),
                ReasonCode(code="CHANGEOVER", description="Product or format changeover", category="Planned", sort_order=3),
                ReasonCode(code="OPERATOR", description="Operator-related stoppage", category="Operator", sort_order=4),
                ReasonCode(code="PLANNED_MAINTENANCE", description="Scheduled preventive maintenance", category="Planned", sort_order=5),
                ReasonCode(code="QUALITY_HOLD", description="Quality inspection or hold", category="Quality", sort_order=6),
                ReasonCode(code="OTHER", description="Other or unclassified reason", category="Other", sort_order=7),
            ]
            for rc in default_codes:
                session.add(rc)

        # Check if demo resources already exist (skip if so)
        result = await session.execute(
            select(DataSource).where(DataSource.name == "Simulation")
        )
        if result.scalar_one_or_none() is None:
            await create_demo_resources(session)

        await session.commit()
        print("Seed data created successfully!")
        print("Default users: admin/admin, engineer/engineer, supervisor/1234, operator/0000")


if __name__ == "__main__":
    asyncio.run(seed())
