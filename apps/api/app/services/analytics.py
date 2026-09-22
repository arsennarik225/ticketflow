"""Organizer analytics (§4.15), computed from orders, tickets, refunds, campaigns, and
check-ins. No extra attendee data is needed.

Money definitions (all in tiyin, for orders created in the date range):
  grossSales      face value of tickets sold (before discounts)
  discounts       promo discounts on those orders
  refunds         money returned to buyers
  netRevenue      ticket revenue kept: gross - discounts - value of refunded orders
  fees            processing fees the organizer pays (0 when attendees pay them)
  estimatedPayout netRevenue - fees
Order-level amounts cannot be split by ticket type, so they are left out when a
ticketTypeId filter is used.
"""
from datetime import datetime

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.errors import not_found
from app.models import Campaign, Event, Order, OrderItem, PromoRedemption, Refund, Ticket, utcnow
from app.schemas import (
    Attendance, CampaignSales, EventAnalyticsOut, TicketTypeSales, TimelinePoint, money,
)
from app.services.inventory import Counts, available, counts_by_ticket_type, event_remaining


def percent(part: int, whole: int) -> float:
    return round(100 * part / whole, 1) if whole else 0.0


def event_analytics(db: Session, event: Event, start: datetime | None, end: datetime | None,
                    ticket_type_id: str | None) -> EventAnalyticsOut:
    now = utcnow()
    types = event.ticket_types
    selected = [t for t in types if ticket_type_id is None or str(t.id) == ticket_type_id]
    if not selected and ticket_type_id:
        raise not_found("Ticket type")
    counts = counts_by_ticket_type(db, [event.id], now)
    remaining_for_event = event_remaining(event, counts)
    c = [counts.get(t.id, Counts()) for t in selected]
    sold, held, checked_in = sum(x.sold for x in c), sum(x.held for x in c), sum(x.checked_in for x in c)
    if ticket_type_id:
        capacity = selected[0].quantity
        remaining = available(selected[0], counts, remaining_for_event)
    else:
        capacity = event.capacity if event.capacity is not None else sum(t.quantity for t in types)
        remaining = max(0, capacity - sold - held)

    orders_in_range = [Order.event_id == event.id, Order.status != "cancelled"]
    if start:
        orders_in_range.append(Order.created_at >= start)
    if end:
        orders_in_range.append(Order.created_at < end)
    items = [*orders_in_range, *([OrderItem.ticket_type_id == selected[0].id] if ticket_type_id else [])]

    day = func.to_char(func.timezone(event.time_zone, Order.created_at), "YYYY-MM-DD")
    timeline = db.execute(
        select(day, func.sum(OrderItem.quantity), func.sum(OrderItem.quantity * OrderItem.unit_price))
        .join(Order, Order.id == OrderItem.order_id).where(*items).group_by(day).order_by(day)
    ).all()
    gross_by_type = dict(db.execute(
        select(OrderItem.ticket_type_id, func.sum(OrderItem.quantity * OrderItem.unit_price))
        .join(Order, Order.id == OrderItem.order_id).where(*orders_in_range).group_by(OrderItem.ticket_type_id)
    ).all())
    gross = sum(int(gross_by_type.get(t.id, 0)) for t in selected)

    result = EventAnalyticsOut(
        event_id=str(event.id), capacity=capacity, tickets_sold=sold, tickets_remaining=remaining,
        percent_sold=percent(sold, capacity), gross_sales=money(gross),
        sales_over_time=[TimelinePoint(date=d, tickets_sold=int(n), gross_sales=money(int(g)))
                         for d, n, g in timeline],
        by_ticket_type=[
            TicketTypeSales(ticket_type_id=str(t.id), name=t.name, quantity=t.quantity,
                            sold=counts.get(t.id, Counts()).sold, remaining=available(t, counts, remaining_for_event),
                            gross_sales=money(int(gross_by_type.get(t.id, 0))))
            for t in selected
        ],
        campaigns=campaign_sales(db, event, orders_in_range),
        attendance=Attendance(registered=sold, checked_in=checked_in, absent=sold - checked_in,
                              check_in_percent=percent(checked_in, sold)),
    )
    if ticket_type_id is None:
        refunded = Order.status == "refunded"
        discounts, refunded_value, fees = db.execute(
            select(func.coalesce(func.sum(Order.discount), 0),
                   func.coalesce(func.sum(case((refunded, Order.subtotal - Order.discount), else_=0)), 0),
                   func.coalesce(func.sum(case(((Order.status == "confirmed")
                                                & (Order.processing_fee_paid_by == "organizer"),
                                                Order.processing_fee), else_=0)), 0))
            .where(*orders_in_range)
        ).one()
        refunds = db.scalar(select(func.coalesce(func.sum(Refund.amount), 0))
                            .join(Order, Order.id == Refund.order_id).where(*orders_in_range))
        net = gross - discounts - refunded_value
        result.discounts, result.refunds, result.fees = money(discounts), money(refunds), money(fees)
        result.net_revenue, result.estimated_payout = money(net), money(net - fees)
    return result


def campaign_sales(db: Session, event: Event, orders_in_range) -> list[CampaignSales]:
    kept = case((Order.status == "confirmed", Order.subtotal - Order.discount), else_=0)
    sales = {row[0]: row[1:] for row in db.execute(
        select(PromoRedemption.campaign_id, func.count(), func.sum(Order.subtotal), func.sum(Order.discount),
               func.sum(kept))
        .join(Order, Order.id == PromoRedemption.order_id).where(*orders_in_range)
        .group_by(PromoRedemption.campaign_id)
    )}
    tickets = dict(db.execute(
        select(PromoRedemption.campaign_id, func.count(Ticket.id))
        .join(Order, Order.id == PromoRedemption.order_id).join(Ticket, Ticket.order_id == Order.id)
        .where(*orders_in_range, Ticket.status.in_(("valid", "checked_in")))
        .group_by(PromoRedemption.campaign_id)
    ).all())
    campaigns = db.scalars(select(Campaign).where(Campaign.event_id == event.id).order_by(Campaign.created_at))
    result = []
    for campaign in campaigns:
        redemptions, gross, discount, net = sales.get(campaign.id, (0, 0, 0, 0))
        result.append(CampaignSales(
            campaign_id=str(campaign.id), name=campaign.name, code=campaign.code, redemptions=redemptions,
            tickets_sold=tickets.get(campaign.id, 0), gross_sales=money(int(gross or 0)),
            discounts=money(int(discount or 0)), net_revenue=money(int(net or 0)),
        ))
    return result
