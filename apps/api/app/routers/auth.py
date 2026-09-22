"""Accounts (§4.1): register, verify email, sign in/out, password reset, organizer
profile, and the simulated identity and payout steps of paid-sales activation (§3.2)."""
from datetime import timedelta

from fastapi import APIRouter, Depends, Response
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import ApiRoute, Paging, bearer, current_user, organizer
from app.errors import conflict, forbidden, gone, not_found, unauthorized
from app.models import AuthSession, Notification, OrganizerProfile, PayoutAccount, User, UserToken, utcnow
from app.schemas import (
    ForgotPasswordIn, IdentityIn, IdentityOut, ListOf, LoginIn, MeIn, NotificationOut, OrganizerProfileIn,
    OrganizerProfileOut, PayoutAccountIn, PayoutAccountOut, RefreshIn, RegisterIn, ResetPasswordIn,
    TokenIn, TokensOut, UserOut,
)
from app.security import (
    create_access_token, hash_password, new_secret_token, read_access_token, token_hash, verify_password,
)
from app.services import audit, notify
from app.views import user_out

router = APIRouter(route_class=ApiRoute, tags=["Auth"])

# Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
UNKNOWN_USER_HASH = hash_password("not-a-real-password")


def start_session(db: Session, user: User) -> TokensOut:
    refresh_token = new_secret_token()
    session = AuthSession(user_id=user.id, refresh_token_hash=token_hash(refresh_token),
                          expires_at=utcnow() + timedelta(days=settings.refresh_token_days))
    db.add(session)
    db.flush()
    return TokensOut(access_token=create_access_token(user.id, session.id), refresh_token=refresh_token,
                     expires_in=settings.access_token_minutes * 60, user=user_out(db, user))


def email_token(db: Session, user: User, purpose: str, lifetime: timedelta) -> str:
    token = new_secret_token()
    db.add(UserToken(user_id=user.id, purpose=purpose, token_hash=token_hash(token),
                     expires_at=utcnow() + lifetime))
    return token


def use_email_token(db: Session, token: str, purpose: str) -> UserToken:
    row = db.scalar(select(UserToken).where(UserToken.token_hash == token_hash(token),
                                            UserToken.purpose == purpose).with_for_update())
    if row is None or row.used_at:
        raise gone("token_invalid", "This link is invalid or was already used.")
    if row.expires_at <= utcnow():
        raise gone("token_expired", "This link has expired. Ask for a new one.")
    row.used_at = utcnow()
    return row


@router.post("/auth/register", status_code=201, response_model=UserOut)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise conflict("email_taken", "An account with this email already exists.")
    user = User(email=email, password_hash=hash_password(body.password), full_name=body.full_name,
                language=body.language)
    db.add(user)
    db.flush()
    notify.verify_email(db, user, email_token(db, user, "verify_email", timedelta(hours=48)))
    try:
        db.commit()
    except IntegrityError:  # the same email registered a moment earlier
        raise conflict("email_taken", "An account with this email already exists.") from None
    return user_out(db, user)


@router.post("/auth/verify-email", response_model=TokensOut)
def verify_email(body: TokenIn, db: Session = Depends(get_db)):
    row = use_email_token(db, body.token, "verify_email")
    row.user.email_verified = True
    tokens = start_session(db, row.user)
    db.commit()
    return tokens


@router.post("/auth/login", response_model=TokensOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not verify_password(user.password_hash if user else UNKNOWN_USER_HASH, body.password) or user is None:
        raise unauthorized("invalid_credentials", "Wrong email or password.")
    if user.suspended_at:
        raise forbidden("account_suspended", "This account is suspended.")
    tokens = start_session(db, user)
    db.commit()
    return tokens


@router.post("/auth/refresh", response_model=TokensOut)
def refresh(body: RefreshIn, db: Session = Depends(get_db)):
    """Rotates the refresh token: the old one stops working."""
    session = db.scalar(select(AuthSession).where(
        AuthSession.refresh_token_hash == token_hash(body.refresh_token)).with_for_update())
    if session is None or session.revoked_at or session.expires_at <= utcnow():
        raise unauthorized("invalid_refresh_token", "Sign in again.")
    if session.user.suspended_at:
        raise forbidden("account_suspended", "This account is suspended.")
    refresh_token = new_secret_token()
    session.refresh_token_hash = token_hash(refresh_token)
    db.commit()
    return TokensOut(access_token=create_access_token(session.user_id, session.id), refresh_token=refresh_token,
                     expires_in=settings.access_token_minutes * 60, user=user_out(db, session.user))


@router.post("/auth/logout", status_code=204)
def logout(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)):
    ids = read_access_token(credentials.credentials) if credentials else None
    if ids and (session := db.get(AuthSession, ids[1])) and not session.revoked_at:
        session.revoked_at = utcnow()
        db.commit()
    return Response(status_code=204)


@router.post("/auth/password/forgot", status_code=202)
def forgot_password(body: ForgotPasswordIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user and not user.suspended_at:
        notify.password_reset(db, user, email_token(db, user, "reset_password", timedelta(hours=1)))
        db.commit()
    return Response(status_code=202)  # same answer either way: no way to probe for accounts


@router.post("/auth/password/reset", status_code=204)
def reset_password(body: ResetPasswordIn, db: Session = Depends(get_db)):
    row = use_email_token(db, body.token, "reset_password")
    row.user.password_hash = hash_password(body.password)
    row.user.email_verified = True  # the link proved they own the address
    db.execute(update(AuthSession).where(AuthSession.user_id == row.user_id, AuthSession.revoked_at.is_(None))
               .values(revoked_at=utcnow()))
    db.commit()
    return Response(status_code=204)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return user_out(db, user)


@router.patch("/me", response_model=UserOut)
def update_me(body: MeIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Name and language (kk / ru / en) of emails and PDF tickets."""
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(user, key, value)
    db.commit()
    return user_out(db, user)


@router.get("/me/notifications", response_model=ListOf[NotificationOut], tags=["My Orders"])
def my_notifications(paging: Paging = Depends(), user: User = Depends(current_user), db: Session = Depends(get_db)):
    query = select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc())
    rows, total = paging.fetch(db, query)
    return ListOf(data=[NotificationOut(id=str(n.id), kind=n.kind, subject=n.subject, body=n.body,
                                        created_at=n.created_at) for n in rows], total=total)


def profile_out(profile: OrganizerProfile) -> OrganizerProfileOut:
    payout = profile.payout_account
    return OrganizerProfileOut(
        display_name=profile.display_name, description=profile.description,
        contact_email=profile.contact_email, contact_phone=profile.contact_phone,
        identity_status=profile.identity_status,
        payout_account=PayoutAccountOut(status=payout.status, masked_account=payout.masked_account)
        if payout else None,
    )


@router.get("/me/organizer-profile", response_model=OrganizerProfileOut)
def get_organizer_profile(user: User = Depends(current_user)):
    if user.organizer_profile is None:
        raise not_found("Organizer profile")
    return profile_out(user.organizer_profile)


@router.put("/me/organizer-profile", response_model=UserOut)
def put_organizer_profile(body: OrganizerProfileIn, user: User = Depends(current_user),
                          db: Session = Depends(get_db)):
    profile = user.organizer_profile
    if profile is None:
        profile = OrganizerProfile(user_id=user.id)
        db.add(profile)
        user.organizer_profile = profile
    profile.display_name = body.display_name
    profile.description = body.description
    profile.contact_email = body.contact_email.lower()
    profile.contact_phone = body.contact_phone
    db.commit()
    return user_out(db, user)


@router.post("/me/identity-verification", status_code=202, response_model=IdentityOut)
def verify_identity(body: IdentityIn, user: User = Depends(organizer), db: Session = Depends(get_db)):
    """Simulated: approved at once, and no documents are stored (§8 excludes real KYC)."""
    profile = user.organizer_profile
    profile.identity_status = "verified"
    profile.identity_legal_name = body.legal_name
    profile.identity_document_type = body.document_type
    profile.identity_verified_at = utcnow()
    audit.record(db, "organizer.identity_verified", "Identity verified (simulated)",
                 entity_type="user", entity_id=user.id, actor=user)
    db.commit()
    return IdentityOut(status="verified")


@router.put("/me/payout-account", response_model=PayoutAccountOut)
def connect_payout_account(body: PayoutAccountIn, user: User = Depends(organizer), db: Session = Depends(get_db)):
    """Simulated: any sandbox token connects. Only the last four characters are kept."""
    masked = f"****{body.sandbox_account_token[-4:]}"
    account = db.get(PayoutAccount, user.id) or PayoutAccount(user_id=user.id)
    account.account_holder_name = body.account_holder_name
    account.masked_account = masked
    account.status = "connected"
    account.connected_at = utcnow()
    db.add(account)
    audit.record(db, "organizer.payout_connected", f"Payout account {masked} connected (simulated)",
                 entity_type="user", entity_id=user.id, actor=user)
    notify.payout_status(db, user.organizer_profile, masked)
    db.commit()
    return PayoutAccountOut(status="connected", masked_account=masked)
