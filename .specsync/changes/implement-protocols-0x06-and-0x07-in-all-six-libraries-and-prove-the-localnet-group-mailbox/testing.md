---
change: implement-protocols-0x06-and-0x07-in-all-six-libraries-and-prove-the-localnet-group-mailbox
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-4 | PROTOCOL.md section 5.8 states both headers and the 101-byte plaintext. The identifier table marks 0x06 and 0x07 implemented and says tag v1.3.0 does not include them. Section 5.8.4 names rounds 46313 through 46322 and says the previous group key failed. |
| REQ-protocol-5 | vectors/group-v1.json matches in TypeScript, Go, Rust, Python, Kotlin, and Swift. ts/scripts/group-matrix-localnet.ts funded the mailbox in round 46313, posted one 0x07 in round 46322, and every library opened it. The previous group key failed in all six. A repeated counter failed in all six. |

Each library loads vectors/group-v1.json and checks the membership note, the message key, and the message note. A repeated counter is rejected. bun scripts/validate.ts remains the SpecSync verification command.
