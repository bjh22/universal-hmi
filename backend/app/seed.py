"""
Seed script: Creates default users and example simulation tags for development.
Run: python -m app.seed
"""

import asyncio
import json
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session, init_db
from app.core.security import hash_password
from app.models.alarm import AlarmHistory, AlarmSeverity
from app.models.app_setting import AppSetting
from app.models.datasource import DataSource, ProtocolType
from app.models.project import Project  # noqa: F401 — registers 'projects' table for FK resolution
from app.models.screen import Screen
from app.models.tag import SimulationBehavior, Tag, TagAccessMode, TagDataType, TagLabel
from app.models.trend import TrendData
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
            simulation_behavior=SimulationBehavior.ACCUMULATOR,
            simulation_config=json.dumps({"rate": 0.0333}),
            trending_enabled=True,
            trending_sample_rate_ms=5000,
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
            trending_enabled=True,
            trending_sample_rate_ms=2000,
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

    # I/O and Service labels
    input_label = TagLabel(
        name="Input",
        color="#8b5cf6",
        description="Machine digital/analog inputs",
    )
    session.add(input_label)

    output_label = TagLabel(
        name="Output",
        color="#f97316",
        description="Machine digital/analog outputs",
    )
    session.add(output_label)

    service_label = TagLabel(
        name="Service",
        color="#ef4444",
        description="Tags available for manual actuation in Service mode",
    )
    session.add(service_label)

    seal_flattener_label = TagLabel(
        name="Seal Flattener",
        color="#06b6d4",
        description="Seal flattener station actuators",
    )
    session.add(seal_flattener_label)

    bag_open_label = TagLabel(
        name="Bag Open",
        color="#84cc16",
        description="Bag opening station actuators",
    )
    session.add(bag_open_label)

    conveyor_label = TagLabel(
        name="Conveyor",
        color="#eab308",
        description="Conveyor system actuators",
    )
    session.add(conveyor_label)
    await session.flush()

    # I/O tags — digital inputs (read-only sensors/switches)
    io_tags = [
        Tag(
            name="IO.BagDetectSensor",
            display_name="Bag detect sensor",
            description="Detects presence of bag at filling station",
            data_source_id=sim_ds.id,
            data_type=TagDataType.BOOL,
            access_mode=TagAccessMode.READ,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.TOGGLE,
            simulation_config=json.dumps({"period": 8}),
        ),
        Tag(
            name="IO.SealTempOK",
            display_name="Seal temp OK",
            description="Sealing bar temperature within operating range",
            data_source_id=sim_ds.id,
            data_type=TagDataType.BOOL,
            access_mode=TagAccessMode.READ,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.TOGGLE,
            simulation_config=json.dumps({"period": 30}),
        ),
        Tag(
            name="IO.AirPressureOK",
            display_name="Air pressure OK",
            description="Pneumatic supply pressure above minimum threshold",
            data_source_id=sim_ds.id,
            data_type=TagDataType.BOOL,
            access_mode=TagAccessMode.READ,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.TOGGLE,
            simulation_config=json.dumps({"period": 45}),
        ),
        Tag(
            name="IO.GuardDoorClosed",
            display_name="Guard door closed",
            description="Safety guard door interlock switch",
            data_source_id=sim_ds.id,
            data_type=TagDataType.BOOL,
            access_mode=TagAccessMode.READ,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.TOGGLE,
            simulation_config=json.dumps({"period": 60}),
        ),
        Tag(
            name="IO.FilmLowSensor",
            display_name="Film low sensor",
            description="Film roll diameter below minimum threshold",
            data_source_id=sim_ds.id,
            data_type=TagDataType.BOOL,
            access_mode=TagAccessMode.READ,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.TOGGLE,
            simulation_config=json.dumps({"period": 90}),
        ),
        Tag(
            name="IO.InfeedConveyorSpeed",
            display_name="Infeed conveyor speed",
            description="Measured speed of infeed conveyor belt",
            data_source_id=sim_ds.id,
            data_type=TagDataType.FLOAT,
            access_mode=TagAccessMode.READ,
            engineering_units="m/min",
            min_value=0,
            max_value=30,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.SINE,
            simulation_config=json.dumps({"min": 8, "max": 15, "period": 40}),
        ),
    ]

    # I/O tags — digital outputs (writable actuators)
    output_tags = [
        Tag(
            name="IO.SealBarHeater",
            display_name="Seal bar heater",
            description="Main sealing bar heater element",
            data_source_id=sim_ds.id,
            data_type=TagDataType.BOOL,
            access_mode=TagAccessMode.READ_WRITE,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.TOGGLE,
            simulation_config=json.dumps({"period": 20}),
        ),
        Tag(
            name="IO.FilmAdvanceMotor",
            display_name="Film advance motor",
            description="Film feed motor run output",
            data_source_id=sim_ds.id,
            data_type=TagDataType.BOOL,
            access_mode=TagAccessMode.READ_WRITE,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.TOGGLE,
            simulation_config=json.dumps({"period": 10}),
        ),
        Tag(
            name="IO.DischargeConveyor",
            display_name="Discharge conveyor",
            description="Discharge conveyor belt run output",
            data_source_id=sim_ds.id,
            data_type=TagDataType.BOOL,
            access_mode=TagAccessMode.READ_WRITE,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.TOGGLE,
            simulation_config=json.dumps({"period": 15}),
        ),
        Tag(
            name="IO.StackerPusher",
            display_name="Stacker pusher",
            description="Stacker pusher cylinder output",
            data_source_id=sim_ds.id,
            data_type=TagDataType.BOOL,
            access_mode=TagAccessMode.READ_WRITE,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.TOGGLE,
            simulation_config=json.dumps({"period": 12}),
        ),
    ]

    # Service tags — grouped by station
    service_tags_seal = [
        Tag(
            name="Service.SealFlattener.Extend",
            display_name="Flattener extend",
            description="Extend seal flattener cylinder",
            data_source_id=sim_ds.id,
            data_type=TagDataType.BOOL,
            access_mode=TagAccessMode.READ_WRITE,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.STATIC,
            simulation_config=json.dumps({"value": False}),
        ),
        Tag(
            name="Service.SealFlattener.Retract",
            display_name="Flattener retract",
            description="Retract seal flattener cylinder",
            data_source_id=sim_ds.id,
            data_type=TagDataType.BOOL,
            access_mode=TagAccessMode.READ_WRITE,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.STATIC,
            simulation_config=json.dumps({"value": False}),
        ),
        Tag(
            name="Service.SealFlattener.HeaterEnable",
            display_name="Flattener heater",
            description="Enable seal flattener heater element",
            data_source_id=sim_ds.id,
            data_type=TagDataType.BOOL,
            access_mode=TagAccessMode.READ_WRITE,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.STATIC,
            simulation_config=json.dumps({"value": False}),
        ),
    ]

    service_tags_bag = [
        Tag(
            name="Service.BagOpen.Gripper",
            display_name="Bag gripper",
            description="Actuate bag opening gripper jaws",
            data_source_id=sim_ds.id,
            data_type=TagDataType.BOOL,
            access_mode=TagAccessMode.READ_WRITE,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.STATIC,
            simulation_config=json.dumps({"value": False}),
        ),
        Tag(
            name="Service.BagOpen.Vacuum",
            display_name="Bag vacuum",
            description="Activate vacuum cups for bag opening",
            data_source_id=sim_ds.id,
            data_type=TagDataType.BOOL,
            access_mode=TagAccessMode.READ_WRITE,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.STATIC,
            simulation_config=json.dumps({"value": False}),
        ),
        Tag(
            name="Service.BagOpen.BlowOff",
            display_name="Bag blow-off",
            description="Activate air blow-off to open bag mouth",
            data_source_id=sim_ds.id,
            data_type=TagDataType.BOOL,
            access_mode=TagAccessMode.READ_WRITE,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.STATIC,
            simulation_config=json.dumps({"value": False}),
        ),
    ]

    service_tags_conveyor = [
        Tag(
            name="Service.Conveyor.InfeedRun",
            display_name="Infeed conveyor",
            description="Run infeed conveyor in service mode",
            data_source_id=sim_ds.id,
            data_type=TagDataType.BOOL,
            access_mode=TagAccessMode.READ_WRITE,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.STATIC,
            simulation_config=json.dumps({"value": False}),
        ),
        Tag(
            name="Service.Conveyor.DischargeRun",
            display_name="Discharge conveyor",
            description="Run discharge conveyor in service mode",
            data_source_id=sim_ds.id,
            data_type=TagDataType.BOOL,
            access_mode=TagAccessMode.READ_WRITE,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.STATIC,
            simulation_config=json.dumps({"value": False}),
        ),
        Tag(
            name="Service.Conveyor.Speed",
            display_name="Conveyor speed",
            description="Manual speed setpoint for conveyors in service mode",
            data_source_id=sim_ds.id,
            data_type=TagDataType.FLOAT,
            access_mode=TagAccessMode.READ_WRITE,
            engineering_units="m/min",
            min_value=0,
            max_value=30,
            simulation_enabled=True,
            simulation_behavior=SimulationBehavior.STATIC,
            simulation_config=json.dumps({"value": 5.0}),
        ),
    ]

    all_io_input_tags = io_tags
    all_io_output_tags = output_tags
    all_service_tags = service_tags_seal + service_tags_bag + service_tags_conveyor

    for t in all_io_input_tags + all_io_output_tags + all_service_tags:
        session.add(t)
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

    # Assign Input label
    for t in all_io_input_tags:
        result = await session.execute(select(Tag).where(Tag.name == t.name))
        db_tag = result.scalar_one_or_none()
        if db_tag:
            db_tag.labels.append(input_label)

    # Assign Output label
    for t in all_io_output_tags:
        result = await session.execute(select(Tag).where(Tag.name == t.name))
        db_tag = result.scalar_one_or_none()
        if db_tag:
            db_tag.labels.append(output_label)

    # Assign Service + station labels
    for t in service_tags_seal:
        result = await session.execute(select(Tag).where(Tag.name == t.name))
        db_tag = result.scalar_one_or_none()
        if db_tag:
            db_tag.labels.append(service_label)
            db_tag.labels.append(seal_flattener_label)

    for t in service_tags_bag:
        result = await session.execute(select(Tag).where(Tag.name == t.name))
        db_tag = result.scalar_one_or_none()
        if db_tag:
            db_tag.labels.append(service_label)
            db_tag.labels.append(bag_open_label)

    for t in service_tags_conveyor:
        result = await session.execute(select(Tag).where(Tag.name == t.name))
        db_tag = result.scalar_one_or_none()
        if db_tag:
            db_tag.labels.append(service_label)
            db_tag.labels.append(conveyor_label)

    # Default dashboard screen (grid mode, 12-column responsive)
    session.add(Screen(
        name="Dashboard",
        slug="dashboard",
        is_default=True,
        sort_order=0,
        layout_mode="grid",
        target_resolution=None,
        layout=json.dumps([
            {
                "id": "w1",
                "type": "status_indicator",
                "x": 0, "y": 0, "w": 4, "h": 3,
                "props": {
                    "title": "Machine State",
                    "tag": "Machine.State",
                    "mapping": {"0": {"label": "Stopped", "color": "#6b7280"}, "1": {"label": "Running", "color": "#22c55e"}, "2": {"label": "Faulted", "color": "#ef4444"}, "3": {"label": "Idle", "color": "#f59e0b"}},
                },
            },
            {
                "id": "w2",
                "type": "gauge",
                "x": 4, "y": 0, "w": 4, "h": 3,
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
                "x": 8, "y": 0, "w": 4, "h": 3,
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
                "x": 0, "y": 3, "w": 3, "h": 2,
                "props": {"title": "Good Count", "tag": "Machine.GoodCount"},
            },
            {
                "id": "w5",
                "type": "counter",
                "x": 3, "y": 3, "w": 3, "h": 2,
                "props": {"title": "Reject Count", "tag": "Machine.RejectCount"},
            },
            {
                "id": "w6",
                "type": "gauge",
                "x": 6, "y": 3, "w": 3, "h": 3,
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
                "x": 9, "y": 3, "w": 3, "h": 2,
                "props": {"title": "Machine Running", "tag": "Machine.Running"},
            },
        ]),
    ))

    # Control panel screen (grid mode, 12-column responsive)
    session.add(Screen(
        name="Control Panel",
        slug="controls",
        sort_order=1,
        layout_mode="grid",
        target_resolution=None,
        layout=json.dumps([
            {
                "id": "c1",
                "type": "parameter_input",
                "x": 0, "y": 0, "w": 4, "h": 2,
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
                "x": 4, "y": 0, "w": 4, "h": 2,
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
                "x": 8, "y": 0, "w": 4, "h": 2,
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
                "x": 0, "y": 2, "w": 4, "h": 2,
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
                "x": 4, "y": 2, "w": 4, "h": 2,
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
                "x": 8, "y": 2, "w": 4, "h": 2,
                "props": {
                    "title": "Reset Counts",
                    "script": "write_tag('Machine.GoodCount', 0)\nwrite_tag('Machine.RejectCount', 0)\nlog('Counts reset')",
                    "color": "blue",
                    "confirm": True,
                },
            },
        ]),
    ))

    # --- Production settings ---
    production_settings = {
        "production.good_count_tag": "Machine.GoodCount",
        "production.reject_fault_tags": json.dumps(["Machine.TempAlarm"]),
        "production.cycling_tag": "Machine.Running",
        "production.downtime_exception_tags": json.dumps([]),
        "production.target_rate": "120",
    }
    for key, value in production_settings.items():
        await session.merge(AppSetting(key=key, value=value))

    await session.flush()

    # --- Seed historical reporting data (7 days) ---
    # Look up tag IDs for trend data
    good_count_tag = await session.execute(
        select(Tag).where(Tag.name == "Machine.GoodCount")
    )
    good_count_tag = good_count_tag.scalar_one()

    running_tag = await session.execute(
        select(Tag).where(Tag.name == "Machine.Running")
    )
    running_tag = running_tag.scalar_one()

    temp_alarm_tag = await session.execute(
        select(Tag).where(Tag.name == "Machine.TempAlarm")
    )
    temp_alarm_tag = temp_alarm_tag.scalar_one()

    pressure_alarm_tag = await session.execute(
        select(Tag).where(Tag.name == "Machine.PressureAlarm")
    )
    pressure_alarm_tag = pressure_alarm_tag.scalar_one()

    now = datetime.now(timezone.utc)
    seed_days = 7

    for day_offset in range(seed_days, 0, -1):
        day_start = (now - timedelta(days=day_offset)).replace(
            hour=6, minute=0, second=0, microsecond=0
        )

        # Simulate an 18-hour production shift (06:00–00:00)
        shift_hours = 18
        good_count_base = 0

        for minute in range(0, shift_hours * 60, 5):
            ts = day_start + timedelta(minutes=minute)

            # Good count: ramp ~120 units/hr with some jitter
            good_count_base += random.randint(8, 12)
            session.add(TrendData(
                tag_id=good_count_tag.id,
                timestamp=ts,
                value=float(good_count_base),
            ))

            # Cycling tag: machine running most of the time (90% on)
            running_value = 0.0 if random.random() < 0.1 else 1.0
            session.add(TrendData(
                tag_id=running_tag.id,
                timestamp=ts,
                value=running_value,
            ))

        # Seed 2-4 reject alarms (TempAlarm) per day, short duration
        num_rejects = random.randint(2, 4)
        for _ in range(num_rejects):
            trigger_minute = random.randint(30, shift_hours * 60 - 30)
            triggered = day_start + timedelta(minutes=trigger_minute)
            cleared = triggered + timedelta(seconds=random.randint(10, 120))
            session.add(AlarmHistory(
                tag_id=temp_alarm_tag.id,
                tag_name="Machine.TempAlarm",
                tag_display_name="Temperature alarm flag",
                message="Sealing bar temperature out of range",
                severity=AlarmSeverity.WARNING,
                triggered_at=triggered,
                cleared_at=cleared,
                trigger_value="true",
                clear_value="false",
            ))

        # Seed 1-2 downtime alarms (PressureAlarm) per day, longer duration
        num_downtime = random.randint(1, 2)
        for _ in range(num_downtime):
            trigger_minute = random.randint(60, shift_hours * 60 - 60)
            triggered = day_start + timedelta(minutes=trigger_minute)
            duration_minutes = random.randint(5, 25)
            cleared = triggered + timedelta(minutes=duration_minutes)
            session.add(AlarmHistory(
                tag_id=pressure_alarm_tag.id,
                tag_name="Machine.PressureAlarm",
                tag_display_name="Pressure alarm flag",
                message="Pneumatic pressure out of range",
                severity=AlarmSeverity.CRITICAL,
                triggered_at=triggered,
                cleared_at=cleared,
                trigger_value="true",
                clear_value="false",
            ))

    await session.flush()


DEFAULT_REASON_CODES = [
    {"code": "MECHANICAL", "description": "Mechanical failure or breakdown", "category": "Equipment", "sort_order": 0},
    {"code": "ELECTRICAL", "description": "Electrical fault or power issue", "category": "Equipment", "sort_order": 1},
    {"code": "MATERIAL", "description": "Raw material issue (jam, empty, defective)", "category": "Material", "sort_order": 2},
    {"code": "CHANGEOVER", "description": "Product or format changeover", "category": "Planned", "sort_order": 3},
    {"code": "OPERATOR", "description": "Operator-related stoppage", "category": "Operator", "sort_order": 4},
    {"code": "PLANNED_MAINTENANCE", "description": "Scheduled preventive maintenance", "category": "Planned", "sort_order": 5},
    {"code": "QUALITY_HOLD", "description": "Quality inspection or hold", "category": "Quality", "sort_order": 6},
    {"code": "OTHER", "description": "Other or unclassified reason", "category": "Other", "sort_order": 7},
]


async def seed_default_reason_codes(session: AsyncSession):
    """Seed default reason codes if none exist.

    This is a standalone function so it can be called from both the seed script
    and the project creation API endpoints.  It does NOT commit — the caller
    is responsible for committing.
    """
    existing_rc = await session.execute(select(ReasonCode).limit(1))
    if existing_rc.scalar_one_or_none() is None:
        for rc_data in DEFAULT_REASON_CODES:
            session.add(ReasonCode(**rc_data))
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
        await seed_default_reason_codes(session)

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
