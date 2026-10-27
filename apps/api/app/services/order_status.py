"""Which order status changes staff may make.

Orders move forward along the main flow, and may skip steps (a shop that delivers
straight from the kitchen goes preparing → delivered). They never move backward,
except through `on_hold`, which can return to any open status. Cancelling is only
possible before the gift leaves the shop; after money is in, the way out is a
refund. `cancelled` and `refunded` are final.

Refunds give money back, so only admins may make them (`ADMIN_ONLY`); staff
see every other move.
"""

from app.models.order import OrderStatus

S = OrderStatus

FLOW: list[OrderStatus] = [
    S.pending_payment, S.paid, S.preparing, S.dispatched, S.out_for_delivery, S.delivered, S.completed,
]
_OPEN = FLOW[:-2]  # not yet delivered
_CANCELLABLE = {S.pending_payment, S.paid, S.preparing}
_REFUNDABLE = set(FLOW[1:])  # money has been taken

TRANSITIONS: dict[OrderStatus, list[OrderStatus]] = {}
for _i, _s in enumerate(FLOW):
    nxt = list(FLOW[_i + 1:])
    if _s in _CANCELLABLE:
        nxt.append(S.cancelled)
    if _s in _REFUNDABLE:
        nxt.append(S.refunded)
    if _s in _OPEN:
        nxt.append(S.on_hold)
    TRANSITIONS[_s] = nxt
TRANSITIONS[S.on_hold] = [*_OPEN, S.cancelled, S.refunded]
TRANSITIONS[S.cancelled] = []
TRANSITIONS[S.refunded] = []

ADMIN_ONLY = {S.refunded}


def next_statuses(current: OrderStatus, *, is_admin: bool = True) -> list[OrderStatus]:
    return [s for s in TRANSITIONS[current] if is_admin or s not in ADMIN_ONLY]


def can_move(current: OrderStatus, new: OrderStatus) -> bool:
    return new in TRANSITIONS[current]
