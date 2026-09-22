"""Passwords, tokens, readable codes, and signed ticket QR payloads."""
import base64
import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.config import settings

password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def new_secret_token() -> str:
    """Random token for refresh tokens and email links. Only its hash is stored."""
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_access_token(user_id: uuid.UUID, session_id: uuid.UUID) -> str:
    now = datetime.now(UTC)
    claims = {
        "sub": str(user_id),
        "sid": str(session_id),
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_minutes),
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm="HS256")


def read_access_token(token: str) -> tuple[uuid.UUID, uuid.UUID] | None:
    """(user id, session id), or None if the token is invalid or expired."""
    try:
        claims = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        return uuid.UUID(claims["sub"]), uuid.UUID(claims["sid"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


# Crockford base32: no I, L, O, U, so codes survive being read aloud or retyped.
CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def random_code(length: int) -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))


# Ticket QR payload: "BFT1.<ticket id>.<signature>". Changing the id breaks the
# signature, and nobody can make a valid one without QR_SECRET (§4.7).
QR_PREFIX = "BFT1"


def _qr_signature(ticket_id: uuid.UUID) -> str:
    message = f"{QR_PREFIX}.{ticket_id}".encode()
    digest = hmac.new(settings.qr_secret.encode(), message, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest[:12]).decode()


def ticket_qr_payload(ticket_id: uuid.UUID) -> str:
    return f"{QR_PREFIX}.{ticket_id}.{_qr_signature(ticket_id)}"


def read_ticket_qr(payload: str) -> uuid.UUID | None:
    """The ticket id inside a genuine payload, or None."""
    parts = payload.strip().split(".")
    if len(parts) != 3 or parts[0] != QR_PREFIX:
        return None
    try:
        ticket_id = uuid.UUID(parts[1])
    except ValueError:
        return None
    if not hmac.compare_digest(parts[2], _qr_signature(ticket_id)):
        return None
    return ticket_id
