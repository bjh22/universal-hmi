"""
Seed script: Creates default users and example simulation tags for development.
Run: python -m app.seed
"""

import asyncio
import json

from app.core.database import async_session, init_db
from app.core.security import hash_password
from app.models.datasource import DataSource, ProtocolType
from app.models.screen import Screen
from app.models.tag import SimulationBehavior, Tag, TagAccessMode, TagDataType
from app.models.user import User, UserRole


async def seed():
    await init_db()

    async with async_session() as session:
        # Default users
        users = [
            User(
                username="admin",
                display_name="Administrator",
                hashed_password=hash_password("admin"),
                role=UserRole.DESIGNER,
            ),
            User(
                username="engineer",
                display_name="Engineer",
                hashed_password=hash_password("engineer"),
                role=UserRole.ENGINEER,
            ),
            User(
                username="supervisor",
                display_name="Supervisor",
                hashed_password=hash_password("1234"),
                role=UserRole.SUPERVISOR,
            ),
            User(
                username="operator",
                display_name="Operator",
                hashed_password=hash_password("0000"),
                role=UserRole.OPERATOR,
            ),
        ]
        for u in users:
            session.add(u)

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
                description="Machine operating state",
                group_name="Machine",
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
                description="Machine speed in units/min",
                group_name="Machine",
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
                description="Sealing bar temperature",
                group_name="Machine",
                data_source_id=sim_ds.id,
                data_type=TagDataType.FLOAT,
                access_mode=TagAccessMode.READ,
                engineering_units="°C",
                min_value=0,
                max_value=300,
                simulation_enabled=True,
                simulation_behavior=SimulationBehavior.SINE,
                simulation_config=json.dumps({"min": 140, "max": 160, "period": 120}),
                trending_enabled=True,
                trending_sample_rate_ms=2000,
                alarm_enabled=True,
                alarm_config=json.dumps({
                    "type": "threshold",
                    "high": 180,
                    "low": 100,
                    "severity": "warning",
                    "message": "Temperature out of range",
                }),
            ),
            Tag(
                name="Machine.GoodCount",
                description="Good product count",
                group_name="Machine",
                data_source_id=sim_ds.id,
                data_type=TagDataType.INT,
                access_mode=TagAccessMode.READ_WRITE,
                simulation_enabled=True,
                simulation_behavior=SimulationBehavior.RAMP,
                simulation_config=json.dumps({"min": 0, "max": 10000, "period": 600}),
            ),
            Tag(
                name="Machine.RejectCount",
                description="Rejected product count",
                group_name="Machine",
                data_source_id=sim_ds.id,
                data_type=TagDataType.INT,
                access_mode=TagAccessMode.READ_WRITE,
                simulation_enabled=True,
                simulation_behavior=SimulationBehavior.RAMP,
                simulation_config=json.dumps({"min": 0, "max": 50, "period": 600}),
            ),
            Tag(
                name="Machine.Pressure",
                description="System pressure",
                group_name="Machine",
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
                alarm_enabled=True,
                alarm_config=json.dumps({
                    "type": "threshold",
                    "high": 7.0,
                    "low": 3.0,
                    "severity": "critical",
                    "message": "Pressure out of safe range",
                }),
            ),
            Tag(
                name="Machine.Running",
                description="Machine running status",
                group_name="Machine",
                data_source_id=sim_ds.id,
                data_type=TagDataType.BOOL,
                access_mode=TagAccessMode.READ_WRITE,
                simulation_enabled=True,
                simulation_behavior=SimulationBehavior.TOGGLE,
                simulation_config=json.dumps({"period": 60}),
            ),
            Tag(
                name="Machine.TargetSpeed",
                description="Target speed setpoint",
                group_name="Machine",
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
                description="Film width setting",
                group_name="Machine",
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
                description="Seal temperature setpoint",
                group_name="Machine",
                data_source_id=sim_ds.id,
                data_type=TagDataType.FLOAT,
                access_mode=TagAccessMode.READ_WRITE,
                engineering_units="°C",
                min_value=50,
                max_value=250,
                simulation_enabled=True,
                simulation_behavior=SimulationBehavior.STATIC,
                simulation_config=json.dumps({"value": 150}),
            ),
        ]
        for t in sim_tags:
            session.add(t)

        # Default dashboard screen
        dashboard = Screen(
            name="Dashboard",
            slug="dashboard",
            is_default=True,
            sort_order=0,
            layout=json.dumps([
                {
                    "id": "w1",
                    "type": "status_indicator",
                    "x": 0, "y": 0, "w": 4, "h": 2,
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
                        "units": "°C",
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
        )
        session.add(dashboard)

        # Control panel screen
        controls = Screen(
            name="Control Panel",
            slug="controls",
            sort_order=1,
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
                        "units": "°C",
                    },
                },
                {
                    "id": "c4",
                    "type": "command_button",
                    "x": 0, "y": 2, "w": 3, "h": 2,
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
                    "x": 3, "y": 2, "w": 3, "h": 2,
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
                    "x": 6, "y": 2, "w": 3, "h": 2,
                    "props": {
                        "title": "Reset Counts",
                        "script": "write_tag('Machine.GoodCount', 0)\nwrite_tag('Machine.RejectCount', 0)\nlog('Counts reset')",
                        "color": "blue",
                        "confirm": True,
                    },
                },
            ]),
        )
        session.add(controls)

        await session.commit()
        print("Seed data created successfully!")
        print("Default users: admin/admin, engineer/engineer, supervisor/1234, operator/0000")


if __name__ == "__main__":
    asyncio.run(seed())
