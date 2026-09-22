"""Append-only history of important actions (§4.9, §4.16). Rows are never edited:
a database trigger rejects UPDATE and DELETE on audit_log."""
from sqlalchemy.orm import Session

from app.models import AuditEntry, User


def record(
    db: Session,
    action: str,
    description: str,
    *,
    entity_type: str,
    entity_id=None,
    event_id=None,
    actor: User | None = None,
) -> None:
    db.add(
        AuditEntry(
            action=action,
            description=description,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id else None,
            event_id=event_id,
            actor_user_id=actor.id if actor else None,
        )
    )
