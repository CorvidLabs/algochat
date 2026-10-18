//! PSK state management for counter tracking and replay protection.
//!
//! Tracks send and receive counters, permits out-of-order delivery within
//! the implemented window, and rejects counters already recorded in state.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::psk_types::PSK_COUNTER_WINDOW;
use crate::types::{AlgoChatError, Result};

/// State for a PSK conversation with a single peer.
///
/// Tracks the send counter, the peer's last known counter, and a set
/// of seen counters for replay protection.
///
/// Implements `Serialize`/`Deserialize` for persistence across restarts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PSKState {
    /// The next counter value to use when sending.
    pub send_counter: u32,
    /// The highest counter value received from the peer.
    pub peer_last_counter: u32,
    /// Set of recently seen counter values (for replay detection).
    pub seen_counters: HashSet<u32>,
    /// True after counter `u32::MAX` has been issued. The next counter stays
    /// at `u32::MAX` and does not become 0. Older saved state omits this field.
    #[serde(default)]
    pub send_exhausted: bool,
}

impl PSKState {
    /// Creates a new PSK state with all counters at zero.
    pub fn new() -> Self {
        Self {
            send_counter: 0,
            peer_last_counter: 0,
            seen_counters: HashSet::new(),
            send_exhausted: false,
        }
    }

    /// Validates a received counter value.
    ///
    /// A fresh state accepts unseen counters `0..=200`. After the highest
    /// accepted counter `N`, unseen counters from `max(0, N-200)` through
    /// `min(u32::MAX, N+200)` are accepted. This does not change state.
    ///
    /// # Arguments
    /// * `counter` - The counter value from the received message
    ///
    /// # Returns
    /// `Ok(true)` if valid, `Err` if invalid
    pub fn validate_counter(&self, counter: u32) -> Result<bool> {
        if self.seen_counters.contains(&counter) {
            return Err(AlgoChatError::DecryptionError(format!(
                "Replay detected: counter {} already seen",
                counter
            )));
        }

        let upper = self.peer_last_counter.saturating_add(PSK_COUNTER_WINDOW);
        let below_window = self.peer_last_counter > PSK_COUNTER_WINDOW
            && counter < self.peer_last_counter - PSK_COUNTER_WINDOW;
        if counter > upper || below_window {
            return Err(AlgoChatError::DecryptionError(format!(
                "Counter {} is outside the acceptable window (last: {}, window: {})",
                counter, self.peer_last_counter, PSK_COUNTER_WINDOW
            )));
        }

        Ok(true)
    }

    /// Records a received counter value and updates state.
    ///
    /// This should be called after successfully decrypting a message.
    ///
    /// # Arguments
    /// * `counter` - The counter value from the received message
    pub fn record_receive(&mut self, counter: u32) {
        self.seen_counters.insert(counter);

        if counter > self.peer_last_counter {
            self.peer_last_counter = counter;
        }

        if self.peer_last_counter > PSK_COUNTER_WINDOW {
            let cutoff = self.peer_last_counter - PSK_COUNTER_WINDOW;
            self.seen_counters.retain(|&c| c >= cutoff);
        }
    }

    /// Returns the counter for this message.
    ///
    /// When the current counter is `u32::MAX`, that value is returned and the
    /// state is marked exhausted. The stored counter does not become 0. A
    /// later call fails and leaves the state unchanged.
    ///
    /// # Errors
    ///
    /// Returns [`AlgoChatError::SendCounterExhausted`] when the counter was
    /// already issued.
    pub fn advance_send_counter(&mut self) -> Result<u32> {
        if self.send_exhausted {
            return Err(AlgoChatError::SendCounterExhausted);
        }
        let counter = self.send_counter;
        if counter == u32::MAX {
            self.send_exhausted = true;
        } else {
            self.send_counter = counter + 1;
        }
        Ok(counter)
    }
}

impl Default for PSKState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_state() {
        let state = PSKState::new();
        assert_eq!(state.send_counter, 0);
        assert_eq!(state.peer_last_counter, 0);
        assert!(state.seen_counters.is_empty());
    }

    #[test]
    fn test_advance_send_counter() {
        let mut state = PSKState::new();
        assert_eq!(state.advance_send_counter().unwrap(), 0);
        assert_eq!(state.advance_send_counter().unwrap(), 1);
        assert_eq!(state.advance_send_counter().unwrap(), 2);
        assert_eq!(state.send_counter, 3);
    }

    #[test]
    fn test_validate_and_record() {
        let mut state = PSKState::new();

        assert!(state.validate_counter(0).unwrap());
        state.record_receive(0);
        assert_eq!(state.peer_last_counter, 0);

        assert!(state.validate_counter(1).unwrap());
        state.record_receive(1);
        assert_eq!(state.peer_last_counter, 1);

        assert!(state.validate_counter(5).unwrap());
        state.record_receive(5);
        assert_eq!(state.peer_last_counter, 5);
    }

    #[test]
    fn test_replay_detection() {
        let mut state = PSKState::new();
        state.record_receive(0);
        let result = state.validate_counter(0);
        assert!(result.is_err());
    }

    #[test]
    fn test_counter_window() {
        let mut state = PSKState::new();
        state.record_receive(300);
        assert_eq!(state.peer_last_counter, 300);

        assert!(state.validate_counter(200).unwrap());
        assert!(state.validate_counter(500).unwrap());
        assert!(state.validate_counter(501).is_err());

        let result = state.validate_counter(50);
        assert!(result.is_err());
    }

    #[test]
    fn test_fresh_state_rejects_far_future_counter() {
        let state = PSKState::new();
        assert!(state.validate_counter(0).unwrap());
        assert!(state.validate_counter(200).unwrap());
        assert!(state.validate_counter(201).is_err());
        assert!(state.validate_counter(1_000_000).is_err());
    }

    #[test]
    fn test_uint32_max_receive_does_not_accept_zero() {
        let mut state = PSKState::new();
        state.record_receive(u32::MAX);
        assert_eq!(state.peer_last_counter, u32::MAX);
        assert!(state.validate_counter(0).is_err());
        assert!(state.validate_counter(u32::MAX).is_err());
        assert!(state
            .validate_counter(u32::MAX - PSK_COUNTER_WINDOW)
            .unwrap());
        assert!(state
            .validate_counter(u32::MAX - PSK_COUNTER_WINDOW - 1)
            .is_err());
    }

    #[test]
    fn test_out_of_order_messages() {
        let mut state = PSKState::new();

        assert!(state.validate_counter(3).unwrap());
        state.record_receive(3);
        assert!(state.validate_counter(1).unwrap());
        state.record_receive(1);
        assert!(state.validate_counter(2).unwrap());
        state.record_receive(2);
        assert!(state.validate_counter(0).unwrap());
        state.record_receive(0);

        assert_eq!(state.peer_last_counter, 3);
    }

    #[test]
    fn test_seen_counter_pruning() {
        let mut state = PSKState::new();
        for i in 0..10 {
            state.record_receive(i);
        }
        state.record_receive(PSK_COUNTER_WINDOW + 100);
        assert!(!state.seen_counters.contains(&0));
    }

    #[test]
    fn test_send_counter_does_not_wrap() {
        let mut state = PSKState::new();
        state.send_counter = u32::MAX;
        let counter = state.advance_send_counter().unwrap();
        assert_eq!(counter, u32::MAX);
        assert_eq!(state.send_counter, u32::MAX);
        assert!(state.send_exhausted);
        assert_ne!(state.send_counter, 0);
        assert!(state.advance_send_counter().is_err());
        assert_eq!(state.send_counter, u32::MAX);
        assert!(state.send_exhausted);

        let json = serde_json::to_string(&state).unwrap();
        let mut restored: PSKState = serde_json::from_str(&json).unwrap();
        assert!(restored.send_exhausted);
        assert_eq!(restored.send_counter, u32::MAX);
        assert!(restored.advance_send_counter().is_err());
        assert_eq!(restored.send_counter, u32::MAX);

        let legacy = r#"{"send_counter":4,"peer_last_counter":0,"seen_counters":[]}"#;
        let mut legacy_state: PSKState = serde_json::from_str(legacy).unwrap();
        assert!(!legacy_state.send_exhausted);
        assert_eq!(legacy_state.advance_send_counter().unwrap(), 4);
        assert_eq!(legacy_state.send_counter, 5);
    }

    #[test]
    fn test_serialize_deserialize_roundtrip() {
        let mut state = PSKState::new();
        state.advance_send_counter().unwrap();
        state.advance_send_counter().unwrap();
        state.record_receive(5);
        state.record_receive(3);
        state.record_receive(7);

        let json = serde_json::to_string(&state).unwrap();
        let restored: PSKState = serde_json::from_str(&json).unwrap();

        assert_eq!(restored.send_counter, state.send_counter);
        assert_eq!(restored.peer_last_counter, state.peer_last_counter);
        assert_eq!(restored.seen_counters, state.seen_counters);
    }
}
