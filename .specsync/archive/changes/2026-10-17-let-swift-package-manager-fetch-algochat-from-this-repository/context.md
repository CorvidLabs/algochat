---
change: let-swift-package-manager-fetch-algochat-from-this-repository
artifact: context
---

# Context

Swift Package Manager only reads Package.swift at the root of a git URL. The manifest was in swift/, so CorvidLabs/algochat was not a Swift package. The archived swift-algochat repository still serves tag 0.4.0 and cannot take new tags.
