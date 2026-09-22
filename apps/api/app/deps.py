"""Request dependencies: the signed-in user, role checks, and paging."""
from fastapi import Depends, Query
from fastapi.routing import APIRoute
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.errors import forbidden, unauthorized
from app.models import AuthSession, User, utcnow
from app.security import read_access_token

bearer = HTTPBearer(auto_error=False)


class ApiRoute(APIRoute):
    """Leave out null fields: the contract marks optional fields as absent, not null."""

    def __init__(self, *args, **kwargs):
        kwargs["response_model_exclude_none"] = True
        super().__init__(*args, **kwargs)


def optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User | None:
    """The signed-in user, or None when no token is sent (guest checkout)."""
    if credentials is None:
        return None
    ids = read_access_token(credentials.credentials)
    if ids is None:
        raise unauthorized("invalid_token", "The access token is invalid or expired. Refresh it.")
    user_id, session_id = ids
    session = db.get(AuthSession, session_id)
    if session is None or session.user_id != user_id or session.revoked_at or session.expires_at <= utcnow():
        raise unauthorized("session_ended", "This session has ended. Sign in again.")
    if session.user.suspended_at:
        raise forbidden("account_suspended", "This account is suspended.")
    return session.user


def current_user(user: User | None = Depends(optional_user)) -> User:
    if user is None:
        raise unauthorized()
    return user


def organizer(user: User = Depends(current_user)) -> User:
    if user.organizer_profile is None:
        raise forbidden("organizer_profile_required", "Create an organizer profile first.")
    return user


def platform_admin(user: User = Depends(current_user)) -> User:
    if not user.is_platform_admin:
        raise forbidden("platform_admin_only", "Only Platform Admins can do this.")
    return user


class Paging:
    def __init__(self, page: int = Query(1, ge=1),
                 page_size: int = Query(20, ge=1, le=100, alias="pageSize")):
        self.page, self.page_size = page, page_size

    def fetch(self, db: Session, query) -> tuple[list, int]:
        """One page of rows plus the total count."""
        total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
        rows = db.scalars(query.offset((self.page - 1) * self.page_size).limit(self.page_size)).all()
        return list(rows), total


def contains(text: str) -> str:
    """ILIKE pattern for 'contains text', with wildcards in the text escaped."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"
