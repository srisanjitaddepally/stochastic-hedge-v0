from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, Enum as SqlEnum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class EventStatus(str, Enum):
    ACTIVE = "ACTIVE"
    SETTLED = "SETTLED"


class InputMode(str, Enum):
    NET_PAYOUT = "NET_PAYOUT"
    ODDS = "ODDS"


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[EventStatus] = mapped_column(
        SqlEnum(EventStatus), default=EventStatus.ACTIVE, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    winner_side: Mapped[str | None] = mapped_column(String, nullable=True)

    legs: Mapped[list["Leg"]] = relationship(
        "Leg", back_populates="event", cascade="all, delete-orphan"
    )


class Leg(Base):
    __tablename__ = "legs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True, nullable=False)
    side: Mapped[str] = mapped_column(String, nullable=False)
    input_mode: Mapped[InputMode] = mapped_column(SqlEnum(InputMode), nullable=False)
    stake: Mapped[float] = mapped_column(Float, nullable=False)
    odds_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    net_payout_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    fee_model_version: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    rh_fee_per_contract: Mapped[float | None] = mapped_column(Float, nullable=True)
    kalshi_fee_per_contract: Mapped[float | None] = mapped_column(Float, nullable=True)
    edge_haircut_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    rh_fee: Mapped[float] = mapped_column(Float, default=0.0)
    kalshi_fee: Mapped[float] = mapped_column(Float, default=0.0)
    edge_haircut: Mapped[float] = mapped_column(Float, default=0.0)
    placed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    opponent_side: Mapped[str | None] = mapped_column(String, nullable=True)
    contract_bet_side: Mapped[float | None] = mapped_column(Float, nullable=True)
    contract_opponent_side: Mapped[float | None] = mapped_column(Float, nullable=True)

    event: Mapped[Event] = relationship("Event", back_populates="legs")
