"""
How much the bot's wallet can still pay for (AGENT-3, AGENT-3.a).

The operator funds the bot's own account and that account pays every fee.
When fewer than about 100 replies' worth of fees remain, the bot posts
:data:`LOW_FUNDS_NOTICE` once, in the room where it reached that level, and
not again until its wallet is refilled. The first version sends no payments
or tips (AGENT-9): the bot's only spending is the fee on each note it sends.

Design choices, not confirmed intent:

* One reply's worth is the fee of a payment with the largest note
  (:data:`algochat.types.MAX_NOTE_SIZE` bytes) at the network's minimum fee,
  so the estimate errs toward warning early.
* What can be spent is the balance above the account's minimum balance,
  which Algorand never lets the account spend.
* The bot counts its wallet as refilled when it sees the spendable balance at
  or above the threshold again. A restarted bot that is still low and finds
  its own earlier notice in any of its rooms does not post another one.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..types import MAX_NOTE_SIZE, payment_fee

LOW_FUNDS_REPLIES = 100
"""The warning comes when fewer than this many replies' worth of fees remain."""

LOW_FUNDS_NOTICE = (
    "I'm running low on funds for fees. My operator needs to refill my wallet."
)
"""The short plain-text warning the bot posts once in a room."""


def reply_fee(min_fee: int) -> int:
    """The fee of one reply, counted as a payment with the largest note at ``min_fee``."""
    return payment_fee(MAX_NOTE_SIZE, max(min_fee, 1000))


@dataclass(frozen=True)
class FundsStatus:
    """The bot's wallet as algod reports it, in microAlgos."""

    balance: int
    min_balance: int
    fee_per_reply: int

    @property
    def spendable(self) -> int:
        """The balance above the minimum balance: what fees can come out of."""
        return max(0, self.balance - self.min_balance)

    @property
    def threshold(self) -> int:
        """``fee_per_reply`` times :data:`LOW_FUNDS_REPLIES`."""
        return self.fee_per_reply * LOW_FUNDS_REPLIES

    @property
    def replies_left(self) -> int:
        """About how many more replies the wallet pays for."""
        return self.spendable // self.fee_per_reply

    @property
    def low(self) -> bool:
        """Whether fewer than :data:`LOW_FUNDS_REPLIES` replies' worth remain."""
        return self.spendable < self.threshold
