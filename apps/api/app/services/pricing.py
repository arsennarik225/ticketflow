"""Order totals and promo validation (§4.6, §4.14). Discounts are always computed here
from the campaign record; the client never sends an amount."""
import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select, true
from sqlalchemy.orm import Session

from app.errors import invalid
from app.models import Campaign, CheckoutSession, PromoRedemption


def percent_of(amount: int, basis_points: int) -> int:
    """amount * bps / 10000, rounded half up, in whole tiyin."""
    return (amount * basis_points * 2 + 10000) // 20000


@dataclass
class Totals:
    subtotal: int
    discount: int
    processing_fee: int  # the processor's charge, whoever pays it
    total: int  # what the buyer pays


def compute_totals(lines, campaign: Campaign | None, fee_bps: int, fee_paid_by: str) -> Totals:
    """lines: (ticket_type_id, quantity, unit_price) tuples."""
    subtotal = sum(qty * price for _, qty, price in lines)
    discount = 0
    if campaign:
        applicable = {t.id for t in campaign.ticket_types}
        base = sum(qty * price for type_id, qty, price in lines if not applicable or type_id in applicable)
        if campaign.discount_type == "percentage":
            discount = percent_of(base, int(campaign.percent_off * 100))
        else:
            discount = min(campaign.amount_off, base)
    net = subtotal - discount
    fee = percent_of(net, fee_bps)
    total = net + (fee if fee_paid_by == "attendee" else 0)
    return Totals(subtotal, discount, fee, total)


def campaign_problem(campaign: Campaign, now: datetime) -> tuple[str, str] | None:
    """Why the campaign cannot be used right now (ignoring its redemption limit)."""
    if campaign.disabled:
        return "promo_code_disabled", "This promo code is no longer active."
    if campaign.valid_from and now < campaign.valid_from:
        return "promo_code_not_started", "This promo code is not valid yet."
    if campaign.valid_until and now >= campaign.valid_until:
        return "promo_code_expired", "This promo code has expired."
    return None


def redemptions_used(db: Session, campaign_id: uuid.UUID, now: datetime,
                     exclude_session: uuid.UUID | None = None) -> int:
    """Completed redemptions plus redemptions held by other open checkouts."""
    redeemed = db.scalar(
        select(func.count()).select_from(PromoRedemption).where(PromoRedemption.campaign_id == campaign_id)
    )
    reserved = db.scalar(
        select(func.count()).select_from(CheckoutSession).where(
            CheckoutSession.campaign_id == campaign_id,
            CheckoutSession.status == "open",
            CheckoutSession.expires_at > now,
            CheckoutSession.id != exclude_session if exclude_session else true(),
        )
    )
    return redeemed + reserved


def check_campaign(db: Session, campaign: Campaign, ticket_type_ids: set, now: datetime,
                   session_id: uuid.UUID | None = None) -> None:
    """Raise a clear 422 if the campaign cannot be applied to these ticket types. The
    limit check locks the campaign row, so two buyers cannot take the last redemption."""
    if problem := campaign_problem(campaign, now):
        raise invalid(*problem)
    applicable = {t.id for t in campaign.ticket_types}
    if applicable and not applicable & ticket_type_ids:
        raise invalid("promo_code_not_applicable", "This promo code does not apply to the selected tickets.")
    if campaign.max_redemptions is not None:
        db.execute(select(Campaign.id).where(Campaign.id == campaign.id).with_for_update())
        if redemptions_used(db, campaign.id, now, session_id) >= campaign.max_redemptions:
            raise invalid("promo_code_exhausted", "This promo code has been fully used.")
