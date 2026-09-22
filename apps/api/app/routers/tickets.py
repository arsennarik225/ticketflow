"""Ticket types (§4.3) and promo campaigns with Campaign QR Codes (§4.14)."""
import re
import secrets
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Response
from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import ApiRoute, current_user, organizer
from app.errors import conflict, invalid, not_found
from app.formatting import kzt
from app.models import Campaign, Event, PromoRedemption, TicketType, User, utcnow
from app.schemas import (
    CampaignIn, CampaignOut, CampaignPatchIn, ListOf, TicketTypeIn, TicketTypeOut, TicketTypePatchIn,
)
from app.security import random_code
from app.services import audit
from app.services.events import lock_event, managed_event, parse_id
from app.services.inventory import Counts, counts_by_ticket_type
from app.services.qr import campaign_qr_png
from app.views import campaign_url, campaigns_out, ticket_types_out

router = APIRouter(route_class=ApiRoute, tags=["Tickets & Campaigns"])

EventId = Annotated[str, Path(alias="eventId")]
TicketTypeId = Annotated[str, Path(alias="ticketTypeId")]
CampaignId = Annotated[str, Path(alias="campaignId")]


def check_window(start, end, what: str) -> None:
    if start and end and end <= start:
        raise invalid("invalid_dates", f"The {what} must end after it starts.")


def ticket_type_detail(db: Session, event: Event, ticket_type: TicketType) -> TicketTypeOut:
    return next(t for t in ticket_types_out(db, event, organizer_view=True) if t.id == str(ticket_type.id))


# ------------------------------------------------------------------ ticket types

@router.get("/organizer/events/{eventId}/ticket-types", response_model=ListOf[TicketTypeOut])
def list_ticket_types(event_id: EventId, user: User = Depends(current_user), db: Session = Depends(get_db)):
    event = managed_event(db, event_id, user, write=False)
    return ListOf(data=ticket_types_out(db, event, organizer_view=True))


@router.post("/organizer/events/{eventId}/ticket-types", status_code=201, response_model=TicketTypeOut)
def create_ticket_type(body: TicketTypeIn, event_id: EventId, user: User = Depends(organizer),
                       db: Session = Depends(get_db)):
    """A price of 0 makes a free ticket. A paid type makes the event eligible for activation."""
    event = managed_event(db, event_id, user)
    if event.status == "cancelled":
        raise conflict("event_cancelled", "This event is cancelled.")
    check_window(body.sales_start_at, body.sales_end_at, "sales period")
    ticket_type = TicketType(event_id=event.id, name=body.name, description=body.description,
                             price=body.price.amount, quantity=body.quantity, sales_start_at=body.sales_start_at,
                             sales_end_at=body.sales_end_at, max_per_order=body.max_per_order, hidden=body.hidden)
    db.add(ticket_type)
    db.flush()
    audit.record(db, "ticket_type.created",
                 f"Added ticket type “{ticket_type.name}”: {kzt(ticket_type.price)} × {ticket_type.quantity}",
                 entity_type="ticket_type", entity_id=ticket_type.id, event_id=event.id, actor=user)
    db.commit()
    db.refresh(event)
    return ticket_type_detail(db, event, ticket_type)


@router.patch("/organizer/events/{eventId}/ticket-types/{ticketTypeId}", response_model=TicketTypeOut)
def update_ticket_type(body: TicketTypePatchIn, event_id: EventId, ticket_type_id: TicketTypeId,
                       user: User = Depends(organizer), db: Session = Depends(get_db)):
    """`hidden: true` withdraws a type from sale without deleting it. Quantity may not drop
    below what is already sold or held."""
    event = lock_event(db, managed_event(db, event_id, user).id)
    ticket_type = db.get(TicketType, parse_id(ticket_type_id, "Ticket type"))
    if ticket_type is None or ticket_type.event_id != event.id:
        raise not_found("Ticket type")
    changes = body.model_dump(exclude_unset=True)
    for field in ("name", "price", "quantity", "hidden"):
        if field in changes and changes[field] is None:
            raise invalid("validation_error", f"{field} cannot be empty.")
    if "price" in changes:
        changes["price"] = changes["price"]["amount"]
    changes = {k: v for k, v in changes.items() if getattr(ticket_type, k) != v}
    if "quantity" in changes:
        c = counts_by_ticket_type(db, [event.id], utcnow()).get(ticket_type.id, Counts())
        if changes["quantity"] < c.sold + c.held:
            raise conflict("quantity_below_sold",
                           f"Quantity cannot be lower than the tickets already sold or held ({c.sold + c.held}).")
    check_window(changes.get("sales_start_at", ticket_type.sales_start_at),
                 changes.get("sales_end_at", ticket_type.sales_end_at), "sales period")
    described = []
    for key, value in changes.items():
        if key == "price":
            described.append(f"price {kzt(ticket_type.price)} → {kzt(value)}")
        elif key == "quantity":
            described.append(f"quantity {ticket_type.quantity} → {value}")
        else:
            described.append(key.replace("_", " "))
        setattr(ticket_type, key, value)
    if described:
        audit.record(db, "ticket_type.updated", f"“{ticket_type.name}”: " + ", ".join(described),
                     entity_type="ticket_type", entity_id=ticket_type.id, event_id=event.id, actor=user)
    db.commit()
    return ticket_type_detail(db, event, ticket_type)


# ------------------------------------------------------------------ campaigns

def new_promo_code(db: Session, name: str) -> str:
    """Readable and unique, e.g. SPRING-7KQ2."""
    prefix = re.sub(r"[^A-Z0-9]", "", name.upper())[:8] or "PROMO"
    while True:
        code = f"{prefix}-{random_code(4)}"
        if not db.scalar(select(exists().where(Campaign.code == code))):
            return code


def resolve_ticket_types(db: Session, event: Event, ids: list[str] | None) -> list[TicketType]:
    types = {t.id: t for t in event.ticket_types}
    chosen = []
    for value in ids or []:
        ticket_type = types.get(parse_id(value, "Ticket type"))
        if ticket_type is None:
            raise invalid("unknown_ticket_type", "Every ticketTypeId must belong to this event.")
        chosen.append(ticket_type)
    return chosen


def describe_discount(campaign: Campaign) -> str:
    if campaign.discount_type == "percentage":
        return f"{campaign.percent_off.normalize():f}% off"
    return f"{kzt(campaign.amount_off)} off"


@router.get("/organizer/events/{eventId}/campaigns", response_model=ListOf[CampaignOut])
def list_campaigns(event_id: EventId, user: User = Depends(current_user), db: Session = Depends(get_db)):
    event = managed_event(db, event_id, user, write=False)
    campaigns = db.scalars(select(Campaign).where(Campaign.event_id == event.id).order_by(Campaign.created_at)).all()
    return ListOf(data=campaigns_out(db, list(campaigns)))


@router.post("/organizer/events/{eventId}/campaigns", status_code=201, response_model=CampaignOut)
def create_campaign(body: CampaignIn, event_id: EventId, user: User = Depends(organizer),
                    db: Session = Depends(get_db)):
    """The server generates the promo code and an opaque token for the Campaign QR link."""
    event = managed_event(db, event_id, user)
    if event.status == "cancelled":
        raise conflict("event_cancelled", "This event is cancelled.")
    check_window(body.valid_from, body.valid_until, "validity period")
    campaign = Campaign(
        event_id=event.id, name=body.name, code=new_promo_code(db, body.name),
        token=secrets.token_urlsafe(16), discount_type=body.discount_type,
        percent_off=Decimal(str(body.percent_off)) if body.discount_type == "percentage" else None,
        amount_off=body.amount_off.amount if body.discount_type == "fixed_amount" else None,
        valid_from=body.valid_from, valid_until=body.valid_until, max_redemptions=body.max_redemptions,
        disabled=body.disabled, ticket_types=resolve_ticket_types(db, event, body.ticket_type_ids),
    )
    db.add(campaign)
    db.flush()
    audit.record(db, "campaign.created",
                 f"Created promo campaign “{campaign.name}” (code {campaign.code}, {describe_discount(campaign)})",
                 entity_type="campaign", entity_id=campaign.id, event_id=event.id, actor=user)
    db.commit()
    return campaigns_out(db, [campaign])[0]


def campaign_for(db: Session, campaign_id: str, user: User, *, write: bool) -> Campaign:
    campaign = db.get(Campaign, parse_id(campaign_id, "Campaign"))
    if campaign is None:
        raise not_found("Campaign")
    managed_event(db, str(campaign.event_id), user, write=write)
    return campaign


@router.patch("/organizer/campaigns/{campaignId}", response_model=CampaignOut)
def update_campaign(body: CampaignPatchIn, campaign_id: CampaignId, user: User = Depends(organizer),
                    db: Session = Depends(get_db)):
    """Send `disabled: true` to stop a code. Changes apply to checkouts from now on."""
    campaign = campaign_for(db, campaign_id, user, write=True)
    changes = body.model_dump(exclude_unset=True)
    if "name" in changes and not changes["name"]:
        raise invalid("validation_error", "name cannot be empty.")
    if "ticket_type_ids" in changes:
        campaign.ticket_types = resolve_ticket_types(db, campaign.event, changes.pop("ticket_type_ids"))
    if changes.get("amount_off") is not None:
        changes["amount_off"] = changes["amount_off"]["amount"]
    if changes.get("percent_off") is not None:
        changes["percent_off"] = Decimal(str(changes["percent_off"]))
    for key, value in changes.items():
        setattr(campaign, key, value)
    if campaign.discount_type == "percentage":
        campaign.amount_off = None
        if campaign.percent_off is None:
            raise invalid("validation_error", "percentOff is required for a percentage discount.")
    else:
        campaign.percent_off = None
        if not campaign.amount_off:
            raise invalid("validation_error", "amountOff above 0 is required for a fixed_amount discount.")
    check_window(campaign.valid_from, campaign.valid_until, "validity period")
    if campaign.max_redemptions is not None:
        used = db.scalar(select(func.count()).select_from(PromoRedemption)
                         .where(PromoRedemption.campaign_id == campaign.id))
        if campaign.max_redemptions < used:
            raise conflict("max_below_redemptions", f"This code was already redeemed {used} times.")
    action = "campaign.disabled" if changes.get("disabled") else "campaign.updated"
    audit.record(db, action, f"{'Disabled' if changes.get('disabled') else 'Updated'} promo campaign "
                 f"“{campaign.name}” ({campaign.code})", entity_type="campaign", entity_id=campaign.id,
                 event_id=campaign.event_id, actor=user)
    db.commit()
    return campaigns_out(db, [campaign])[0]


@router.get("/organizer/campaigns/{campaignId}/qr")
def campaign_qr(campaign_id: CampaignId, user: User = Depends(current_user), db: Session = Depends(get_db)):
    campaign = campaign_for(db, campaign_id, user, write=False)
    return Response(campaign_qr_png(campaign_url(campaign), campaign.code), media_type="image/png",
                    headers={"Content-Disposition": f'inline; filename="campaign-{campaign.code}.png"'})
