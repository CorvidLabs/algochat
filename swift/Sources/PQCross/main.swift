import AlgoChat
@preconcurrency import Crypto
import Foundation

/// LocalNet mesh tool. One JSON object per stdin line.
#if os(Linux)
do {
    try FileHandle.standardError.write(contentsOf: Data("ML-KEM-768 needs macOS 26\n".utf8))
} catch {
    // The process is about to exit. The message is best effort.
}
exit(1)
#else
if #available(macOS 26, *) {
    PQCross.run()
} else {
    fputs("ML-KEM-768 needs macOS 26\n", stderr)
    exit(1)
}
#endif

#if !os(Linux)
@available(macOS 26, *)
private enum PQCross {
    static func run() {
        while let line = readLine() {
            if line.trimmingCharacters(in: .whitespaces).isEmpty {
                continue
            }
            guard let data = line.data(using: .utf8),
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else {
                emit(["id": 0, "ok": false, "error": "bad json"])
                continue
            }
            let id = intValue(object["id"])
            do {
                let body = try handle(object)
                var response = body
                response["id"] = id
                response["ok"] = true
                emit(response)
            } catch {
                emit(["id": id, "ok": false, "error": String(describing: error)])
            }
        }
    }

    static func handle(_ object: [String: Any]) throws -> [String: Any] {
        let op = object["op"] as? String ?? ""
        switch op {
        case "identity":
            return try identity(seedHex: string(object, "seed"))
        case "write":
            return try writeNote(
                aliceHex: string(object, "aliceSeed"),
                bobHex: string(object, "bobSeed"),
                text: string(object, "text")
            )
        case "read":
            return try readNote(
                aliceHex: string(object, "aliceSeed"),
                bobHex: string(object, "bobSeed"),
                handshakeHex: string(object, "handshake"),
                messageHex: string(object, "message"),
                text: string(object, "text")
            )
        case "write01":
            return try writeClassical(object, extra: false)
        case "read01":
            return try readClassical(object, extra: false)
        case "write02":
            return try writeClassical(object, extra: true)
        case "read02":
            return try readClassical(object, extra: true)
        case "write05s":
            return try writeMany(object)
        case "groupSeal":
            return try groupSeal(object)
        case "groupOpen":
            return try groupOpen(object)
        case "groupWrite":
            return try groupWrite(object)
        case "groupRead":
            return try groupRead(object)
        default:
            throw ChatError.invalidEnvelope("unknown op \(op)")
        }
    }

    static func writeClassical(_ object: [String: Any], extra: Bool) throws -> [String: Any] {
        let alice = try KeyDerivation.deriveEncryptionKeys(fromSeed: try hexDecode(try string(object, "aliceSeed")))
        let bob = try KeyDerivation.deriveEncryptionKeys(fromSeed: try hexDecode(try string(object, "bobSeed")))
        let text = try string(object, "text")
        let note: Data
        if extra {
            let current = PSKRatchet.derivePSKAtCounter(
                initialPSK: try hexDecode(try string(object, "psk")),
                counter: UInt32(intValue(object["counter"]))
            )
            let envelope = try MessageEncryptor.encryptPSK(
                message: text,
                senderPrivateKey: alice.privateKey,
                recipientPublicKey: bob.publicKey,
                currentPSK: current,
                ratchetCounter: UInt32(intValue(object["counter"]))
            )
            note = envelope.encode()
        } else {
            let envelope = try MessageEncryptor.encrypt(
                message: text,
                senderPrivateKey: alice.privateKey,
                recipientPublicKey: bob.publicKey
            )
            note = envelope.encode()
        }
        return ["note": hexEncode(note)]
    }

    static func readClassical(_ object: [String: Any], extra: Bool) throws -> [String: Any] {
        let alice = try KeyDerivation.deriveEncryptionKeys(fromSeed: try hexDecode(try string(object, "aliceSeed")))
        let bob = try KeyDerivation.deriveEncryptionKeys(fromSeed: try hexDecode(try string(object, "bobSeed")))
        let text = try string(object, "text")
        let raw = try hexDecode(try string(object, "note"))
        let recipient: String
        let sender: String
        if extra {
            let current = PSKRatchet.derivePSKAtCounter(
                initialPSK: try hexDecode(try string(object, "psk")),
                counter: UInt32(intValue(object["counter"]))
            )
            let envelope = try PSKEnvelope.decode(from: raw)
            guard let bobText = try MessageEncryptor.decryptPSK(envelope: envelope, recipientPrivateKey: bob.privateKey, currentPSK: current)?.text,
                  let aliceText = try MessageEncryptor.decryptPSK(envelope: envelope, recipientPrivateKey: alice.privateKey, currentPSK: current)?.text
            else {
                throw ChatError.decryptionFailed("missing plaintext")
            }
            recipient = bobText
            sender = aliceText
        } else {
            let envelope = try ChatEnvelope.decode(from: raw)
            guard let bobText = try MessageEncryptor.decrypt(envelope: envelope, recipientPrivateKey: bob.privateKey)?.text,
                  let aliceText = try MessageEncryptor.decrypt(envelope: envelope, recipientPrivateKey: alice.privateKey)?.text
            else {
                throw ChatError.decryptionFailed("missing plaintext")
            }
            recipient = bobText
            sender = aliceText
        }
        guard recipient == text, sender == text else {
            throw ChatError.decryptionFailed("plaintext \(recipient) / \(sender)")
        }
        return ["recipient": recipient, "sender": sender]
    }

    static func writeMany(_ object: [String: Any]) throws -> [String: Any] {
        let alice = try KeyDerivation.deriveEncryptionKeys(fromSeed: try hexDecode(try string(object, "aliceSeed")))
        let bob = try KeyDerivation.deriveEncryptionKeys(fromSeed: try hexDecode(try string(object, "bobSeed")))
        let kem = try PQSession.encapsulationPrivateKey(fromAccountSeed: try hexDecode(try string(object, "bobSeed")))
        let encaps = Data([UInt8](kem.publicKey.rawRepresentation))
        let aliceKem = try PQSession.encapsulationPrivateKey(fromAccountSeed: try hexDecode(try string(object, "aliceSeed")))
        let built = try PQSession.initiate(
            senderPrivateKey: alice.privateKey,
            recipientPublicKey: bob.publicKey,
            recipientEncapsKey: encaps,
            senderKemKey: aliceKem
        )
        guard let texts = object["texts"] as? [String] else {
            throw ChatError.invalidEnvelope("missing texts")
        }
        let messages = try texts.map { text in hexEncode(try built.session.encrypt(text)) }
        return [
            "handshake": hexEncode(built.note),
            "messages": messages,
            "sessionKey": hexEncode(built.session.sessionKey)
        ]
    }

    static func identity(seedHex: String) throws -> [String: Any] {
        let seed = try hexDecode(seedHex)
        let keys = try KeyDerivation.deriveEncryptionKeys(fromSeed: seed)
        let kem = try PQSession.encapsulationPrivateKey(fromAccountSeed: seed)
        let encaps = Data([UInt8](kem.publicKey.rawRepresentation))
        return [
            "x25519": hexEncode(keys.publicKey.rawRepresentation),
            "encapsKey": hexEncode(encaps)
        ]
    }

    static func writeNote(aliceHex: String, bobHex: String, text: String) throws -> [String: Any] {
        let alice = try KeyDerivation.deriveEncryptionKeys(fromSeed: hexDecode(aliceHex))
        let bob = try KeyDerivation.deriveEncryptionKeys(fromSeed: hexDecode(bobHex))
        let kem = try PQSession.encapsulationPrivateKey(fromAccountSeed: hexDecode(bobHex))
        let encaps = Data([UInt8](kem.publicKey.rawRepresentation))
        let aliceKem = try PQSession.encapsulationPrivateKey(fromAccountSeed: hexDecode(aliceHex))
        let built = try PQSession.initiate(
            senderPrivateKey: alice.privateKey,
            recipientPublicKey: bob.publicKey,
            recipientEncapsKey: encaps,
            senderKemKey: aliceKem
        )
        let message = try built.session.encrypt(text)
        return [
            "handshake": hexEncode(built.note),
            "message": hexEncode(message),
            "sessionKey": hexEncode(built.session.sessionKey)
        ]
    }

    static func readNote(
        aliceHex: String,
        bobHex: String,
        handshakeHex: String,
        messageHex: String,
        text: String
    ) throws -> [String: Any] {
        let alice = try KeyDerivation.deriveEncryptionKeys(fromSeed: hexDecode(aliceHex))
        let bob = try KeyDerivation.deriveEncryptionKeys(fromSeed: hexDecode(bobHex))
        let kem = try PQSession.encapsulationPrivateKey(fromAccountSeed: hexDecode(bobHex))
        let handshake = try hexDecode(handshakeHex)
        let message = try hexDecode(messageHex)
        let session = try PQSession.accept(
            note: handshake,
            recipientPrivateKey: bob.privateKey,
            kemPrivateKey: kem
        )
        let opened = try session.decrypt(message)
        let aliceKem = try PQSession.encapsulationPrivateKey(fromAccountSeed: hexDecode(aliceHex))
        let sender = try PQSession.openAsSender(
            note: handshake,
            senderPrivateKey: alice.privateKey,
            senderKemKey: aliceKem
        )
        let senderPlain = try sender.decrypt(message)
        guard opened == text, senderPlain == text else {
            throw ChatError.decryptionFailed("plaintext \(opened) / \(senderPlain)")
        }
        guard session.sessionKey == sender.sessionKey else {
            throw ChatError.decryptionFailed("sender and recipient session keys differ")
        }
        return [
            "sessionKey": hexEncode(session.sessionKey),
            "recipient": opened,
            "sender": senderPlain
        ]
    }

    static func groupSeal(_ object: [String: Any]) throws -> [String: Any] {
        let note = try GroupMailbox.sealGroupMembership(
            sessionKey: try hexDecode(try string(object, "sessionKey")),
            senderPublicKey: try hexDecode(try string(object, "senderPublicKey")),
            handshakeID: try hexDecode(try string(object, "handshakeId")),
            action: try actionValue(object["action"]),
            epoch: try uint32Value(object["epoch"], name: "epoch"),
            groupID: try hexDecode(try string(object, "groupId")),
            mailbox: try hexDecode(try string(object, "mailbox")),
            groupKey: try hexDecode(try string(object, "groupKey")),
            nonce: try hexDecode(try string(object, "nonce"))
        )
        return ["note": hexEncode(note)]
    }

    static func groupOpen(_ object: [String: Any]) throws -> [String: Any] {
        let opened = try GroupMailbox.openGroupMembership(
            note: try hexDecode(try string(object, "note")),
            sessionKey: try hexDecode(try string(object, "sessionKey")),
            senderPublicKey: try hexDecode(try string(object, "senderPublicKey")),
            handshakeID: try hexDecode(try string(object, "handshakeId"))
        )
        guard let action = Int(exactly: opened.action), let epoch = Int(exactly: opened.epoch) else {
            throw ChatError.invalidEnvelope("membership field does not fit a JSON number")
        }
        return [
            "action": action,
            "epoch": epoch,
            "groupId": hexEncode(opened.groupID),
            "mailbox": hexEncode(opened.mailbox),
            "groupKey": hexEncode(opened.groupKey),
        ]
    }

    static func groupWrite(_ object: [String: Any]) throws -> [String: Any] {
        let groupKey = try hexDecode(try string(object, "groupKey"))
        let groupID = try hexDecode(try string(object, "groupId"))
        let epoch = try uint32Value(object["epoch"], name: "epoch")
        let counter = try uint32Value(object["counter"], name: "counter")
        let senderAddress = try hexDecode(try string(object, "senderAddress"))
        let text = try string(object, "text")
        guard let plaintext = text.data(using: .utf8) else {
            throw ChatError.encodingFailed("Failed to encode message as UTF-8")
        }
        let note = try GroupMailbox.sealGroupMessage(
            plaintext: plaintext,
            groupKey: groupKey,
            groupID: groupID,
            epoch: epoch,
            counter: counter,
            senderAddress: senderAddress,
            nonce: try hexDecode(try string(object, "nonce"))
        )
        let messageKey = try GroupMailbox.deriveGroupMessageKey(
            groupKey: groupKey,
            epoch: epoch,
            counter: counter,
            groupID: groupID,
            senderAddress: senderAddress
        )
        return [
            "note": hexEncode(note),
            "messageKey": hexEncode(messageKey),
        ]
    }

    static func groupRead(_ object: [String: Any]) throws -> [String: Any] {
        let expected = try string(object, "text")
        let opened = try GroupMailbox.openGroupMessage(
            note: try hexDecode(try string(object, "note")),
            groupKey: try hexDecode(try string(object, "groupKey")),
            senderAddress: try hexDecode(try string(object, "senderAddress")),
            accepted: try seenCounters(object["seen"])
        )
        guard let text = String(data: opened.plaintext, encoding: .utf8) else {
            throw ChatError.decryptionFailed("Decrypted data is not valid UTF-8")
        }
        guard text == expected else {
            throw ChatError.decryptionFailed("plaintext mismatch")
        }
        guard let epoch = Int(exactly: opened.epoch), let counter = Int(exactly: opened.counter) else {
            throw ChatError.invalidEnvelope("counter does not fit a JSON number")
        }
        return [
            "text": text,
            "epoch": epoch,
            "counter": counter,
            "groupId": hexEncode(opened.groupID),
        ]
    }

    static func seenCounters(_ value: Any?) throws -> [GroupMailbox.Counter] {
        guard let value else {
            return []
        }
        if value is NSNull {
            return []
        }
        guard let items = value as? [Any] else {
            throw ChatError.invalidEnvelope("seen must be a list")
        }
        var accepted: [GroupMailbox.Counter] = []
        accepted.reserveCapacity(items.count)
        for item in items {
            guard let fields = objectFields(item) else {
                throw ChatError.invalidEnvelope("seen entry must be an object")
            }
            accepted.append(
                GroupMailbox.Counter(
                    epoch: try uint32Value(fields["epoch"], name: "epoch"),
                    counter: try uint32Value(fields["counter"], name: "counter")
                )
            )
        }
        return accepted
    }

    static func objectFields(_ item: Any) -> [String: Any]? {
        if let fields = item as? [String: Any] {
            return fields
        }
        guard let fields = item as? NSDictionary else {
            return nil
        }
        var mapped: [String: Any] = [:]
        for (key, value) in fields {
            guard let name = key as? String else {
                return nil
            }
            mapped[name] = value
        }
        return mapped
    }

    static func actionValue(_ value: Any?) throws -> UInt8 {
        let number = try uint32Value(value, name: "action")
        guard number <= UInt32(UInt8.max) else {
            throw ChatError.invalidEnvelope("bad action")
        }
        return UInt8(number)
    }

    static func uint32Value(_ value: Any?, name: String) throws -> UInt32 {
        guard let value, !(value is NSNull) else {
            throw ChatError.invalidEnvelope("missing \(name)")
        }
        if let number = value as? UInt32 {
            return number
        }
        if let number = value as? Int {
            guard number >= 0, let converted = UInt32(exactly: number) else {
                throw ChatError.invalidEnvelope("bad \(name)")
            }
            return converted
        }
        if let number = value as? NSNumber {
            let wide = number.int64Value
            guard wide >= 0, wide <= Int64(UInt32.max) else {
                throw ChatError.invalidEnvelope("bad \(name)")
            }
            return UInt32(wide)
        }
        throw ChatError.invalidEnvelope("bad \(name)")
    }

    static func string(_ object: [String: Any], _ name: String) throws -> String {
        guard let value = object[name] as? String else {
            throw ChatError.invalidEnvelope("missing \(name)")
        }
        return value
    }

    static func intValue(_ value: Any?) -> Int {
        if let number = value as? Int { return number }
        if let number = value as? NSNumber { return number.intValue }
        return 0
    }

    static func hexDecode(_ text: String) throws -> Data {
        guard text.count.isMultiple(of: 2) else {
            throw ChatError.invalidEnvelope("odd hex")
        }
        var data = Data()
        data.reserveCapacity(text.count / 2)
        var index = text.startIndex
        while index < text.endIndex {
            let next = text.index(index, offsetBy: 2)
            guard let byte = UInt8(text[index..<next], radix: 16) else {
                throw ChatError.invalidEnvelope("bad hex")
            }
            data.append(byte)
            index = next
        }
        return data
    }

    static func hexEncode(_ data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }

    static func emit(_ object: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: object),
              let line = String(data: data, encoding: .utf8)
        else {
            fputs("emit failed\n", stderr)
            return
        }
        print(line)
        fflush(stdout)
    }
}
#endif
