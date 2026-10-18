"""PSK counter state management for replay protection."""

from dataclasses import dataclass, field

from .psk_types import _COUNTER_MAX, PSK_COUNTER_WINDOW, _is_u32_counter
from .types import PSKEncryptionError


@dataclass
class PSKState:
    """Tracks send/receive counter state for a PSK conversation.

    Attributes:
        send_counter: The next counter to use when sending.
        peer_last_counter: The highest counter received from the peer.
            ``-1`` means nothing has been accepted yet.
        seen_counters: Set of recently seen counters for replay protection.
        send_exhausted: True after counter 4294967295 has been issued.
            The next counter stays at that value and does not become 0.
    """

    send_counter: int = 0
    peer_last_counter: int = -1
    seen_counters: set = field(default_factory=set)
    send_exhausted: bool = False

    def __setstate__(self, state: dict) -> None:
        self.__dict__.update(state)
        self.send_exhausted = bool(state.get("send_exhausted", False))


def validate_counter(state: PSKState, counter: object) -> bool:
    """Validate an incoming ratchet counter against the current state.

    Before any receive, only unseen counters ``0..=200`` are accepted.
    After the highest accepted counter ``N``, unseen counters from
    ``max(0, N-200)`` through ``min(4294967295, N+200)`` are accepted.
    Failed checks do not change ``state``.

    Args:
        state: The current PSK state.
        counter: The incoming ratchet counter.

    Returns:
        True if the counter is valid.
    """
    if not _is_u32_counter(counter):
        return False

    if counter in state.seen_counters:
        return False

    if state.peer_last_counter < 0:
        return counter <= PSK_COUNTER_WINDOW

    lower_bound = max(0, state.peer_last_counter - PSK_COUNTER_WINDOW)
    upper_bound = min(_COUNTER_MAX, state.peer_last_counter + PSK_COUNTER_WINDOW)
    return lower_bound <= counter <= upper_bound


def record_receive(state: PSKState, counter: int) -> PSKState:
    """Record a received counter and return updated state.

    Call this only after authentication succeeds. It does not run on a
    failed tag, so a bad message cannot move the window.

    Args:
        state: The current PSK state.
        counter: The received ratchet counter.

    Returns:
        Updated PSKState with the counter recorded.
    """
    new_seen = set(state.seen_counters)
    new_seen.add(counter)

    new_peer_last = max(state.peer_last_counter, counter)

    # Prune counters outside the window
    if new_peer_last >= 0:
        lower_bound = max(0, new_peer_last - PSK_COUNTER_WINDOW)
        new_seen = {c for c in new_seen if c >= lower_bound}

    return PSKState(
        send_counter=state.send_counter,
        peer_last_counter=new_peer_last,
        seen_counters=new_seen,
        send_exhausted=state.send_exhausted,
    )


def advance_send_counter(state: PSKState) -> tuple[int, PSKState]:
    """Return the current send counter and the state for the next message.

    When the current counter is 4294967295, this call returns it and marks
    the send state exhausted. The stored counter does not become 0. A later
    call fails and leaves ``state`` unchanged.

    Args:
        state: The current PSK state.

    Returns:
        Tuple of (counter_to_use, updated_state).

    Raises:
        PSKEncryptionError: If the send counter is already exhausted or is
            not a uint32.
    """
    if state.send_exhausted or not _is_u32_counter(state.send_counter):
        raise PSKEncryptionError("Send counter is exhausted")

    counter = state.send_counter
    exhausted = counter == _COUNTER_MAX
    return counter, PSKState(
        send_counter=counter if exhausted else counter + 1,
        peer_last_counter=state.peer_last_counter,
        seen_counters=set(state.seen_counters),
        send_exhausted=exhausted,
    )
