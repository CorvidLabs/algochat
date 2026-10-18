---
change: implement-protocols-0x06-and-0x07-in-all-six-libraries-and-prove-the-localnet-group-mailbox
artifact: requirements
---

# Requirements

REQ-protocol-4 stays the wire rule and is updated so parity is claimed only after section 5.8.4 records a passing run. REQ-protocol-5 requires every library to seal and open that wire, reject a repeated counter, and pass the LocalNet group test.
