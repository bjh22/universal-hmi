"""
SQLAlchemy database model for users. Each class that inherits from Base maps
to a database table, and each attribute maps to a column in that table.
SQLAlchemy handles converting between Python objects and SQL rows automatically
(this pattern is called an ORM — Object-Relational Mapper).
"""

import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


# Using a Python enum ensures only valid roles can be stored in the database.
# The roles form an ascending privilege hierarchy:
# unauthenticated < operator < supervisor < engineer < designer
class UserRole(str, enum.Enum):
    UNAUTHENTICATED = "unauthenticated"
    OPERATOR = "operator"
    SUPERVISOR = "supervisor"
    ENGINEER = "engineer"
    DESIGNER = "designer"


class User(Base):
    # __tablename__ tells SQLAlchemy which database table this class maps to
    __tablename__ = "users"

    # Mapped[str] + mapped_column() is SQLAlchemy 2.0's typed column syntax.
    # Mapped[str] tells both SQLAlchemy and type checkers (like mypy) the Python
    # type of this column. mapped_column() configures the database column details.
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Passwords are stored as one-way hashes — the original password cannot be
    # recovered from the hash, only verified against it.
    hashed_password: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Timestamps use lambda defaults so they're generated at insert/update time
    # (not when the class is first imported). UTC timezone ensures consistency
    # across time zones — important for globally distributed systems.
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        # onupdate runs the lambda every time this row is modified
        onupdate=lambda: datetime.now(timezone.utc),
    )
