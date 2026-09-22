"""Organizer analytics (§4.15) and the event activity timeline (§4.16).
Platform Admins may read both for moderation."""
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from pydantic import AwareDatetime
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import ApiRoute, Paging, current_user
from app.models import AuditEntry, User
from app.schemas import AuditEntryOut, EventAnalyticsOut, ListOf
from app.services.analytics import event_analytics
from app.services.events import managed_event
from app.views import audit_out

router = APIRouter(route_class=ApiRoute, tags=["Insights"])

EventId = Annotated[str, Path(alias="eventId")]
From = Annotated[AwareDatetime | None, Query(alias="from")]
To = Annotated[AwareDatetime | None, Query(alias="to")]


@router.get("/organizer/events/{eventId}/analytics", response_model=EventAnalyticsOut)
def analytics(event_id: EventId, start: From = None, end: To = None,
              ticket_type_id: Annotated[str | None, Query(alias="ticketTypeId")] = None,
              user: User = Depends(current_user), db: Session = Depends(get_db)):
    event = managed_event(db, event_id, user, write=False)
    return event_analytics(db, event, start, end, ticket_type_id)


@router.get("/organizer/events/{eventId}/history", response_model=ListOf[AuditEntryOut])
def history(event_id: EventId, start: From = None, end: To = None,
            action: Annotated[str | None, Query(description="Exact action or a prefix such as check_in")] = None,
            paging: Paging = Depends(), user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Newest first. Entries cannot be edited or deleted."""
    event = managed_event(db, event_id, user, write=False)
    query = select(AuditEntry).where(AuditEntry.event_id == event.id)
    if start:
        query = query.where(AuditEntry.created_at >= start)
    if end:
        query = query.where(AuditEntry.created_at < end)
    if action:
        query = query.where(AuditEntry.action.startswith(action, autoescape=True))
    rows, total = paging.fetch(db, query.order_by(AuditEntry.created_at.desc(), AuditEntry.id.desc()))
    return ListOf(data=[audit_out(e) for e in rows], total=total)
