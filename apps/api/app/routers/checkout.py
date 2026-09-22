"""Checkout (§4.4, §4.6, §4.14). Works signed in or as a guest; see services/checkout.py."""
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Path, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import ApiRoute, optional_user
from app.errors import ApiError, conflict, gone
from app.models import User, utcnow
from app.schemas import CheckoutIn, CheckoutSessionOut, ConfirmIn, OrderOut, PromoCodeIn
from app.services import checkout
from app.views import order_out, session_out

router = APIRouter(route_class=ApiRoute, tags=["Checkout"])

SessionId = Annotated[str, Path(alias="sessionId")]


@router.post("/checkout/sessions", status_code=201, response_model=CheckoutSessionOut)
def start_checkout(body: CheckoutIn, user: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    """Holds the tickets until expiresAt. Creates no order and issues no tickets."""
    session = checkout.open_session(db, body, user)
    db.commit()
    return session_out(session)


@router.get("/checkout/sessions/{sessionId}", response_model=CheckoutSessionOut)
def get_checkout(session_id: SessionId, user: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    session = checkout.load_session(db, session_id, user)
    if session.status == "open" and session.expires_at <= utcnow():
        session.status = "expired"
        db.commit()
    if session.status == "expired":
        raise gone("checkout_expired", "Your tickets were only held for a limited time. Start again.")
    if session.status == "abandoned":
        raise gone("checkout_abandoned", "This checkout was cancelled. Start again.")
    return session_out(session)


@router.delete("/checkout/sessions/{sessionId}", status_code=204)
def abandon_checkout(session_id: SessionId, user: User | None = Depends(optional_user),
                     db: Session = Depends(get_db)):
    """Releases the hold at once instead of waiting for it to expire."""
    session = checkout.load_session(db, session_id, user, lock=True)
    if session.status == "confirmed":
        raise conflict("checkout_already_confirmed", "This checkout is already complete.")
    if session.status == "open":
        session.status = "abandoned"
        db.commit()
    return Response(status_code=204)


@router.put("/checkout/sessions/{sessionId}/promo-code", response_model=CheckoutSessionOut)
def apply_promo_code(body: PromoCodeIn, session_id: SessionId, user: User | None = Depends(optional_user),
                     db: Session = Depends(get_db)):
    session = checkout.apply_promo(db, session_id, user, body.code, body.campaign_token)
    db.commit()
    return session_out(session)


@router.post("/checkout/sessions/{sessionId}/confirm", status_code=201, response_model=OrderOut)
def confirm_checkout(body: ConfirmIn, session_id: SessionId,
                     idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=200)],
                     user: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    """Free: issues tickets at once. Paid: runs the simulated payment and issues tickets
    only if it succeeds. Repeating the call with the same Idempotency-Key returns the
    same order instead of creating a second one."""
    try:
        order = checkout.confirm(db, session_id, user, idempotency_key, body)
    except checkout.PaymentFailed as failure:
        db.commit()  # keep the failed payment record and the email
        raise ApiError(402, failure.code, failure.message) from None
    db.commit()
    return order_out(order)
