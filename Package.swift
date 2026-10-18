// swift-tools-version: 6.0

import PackageDescription

// The Swift package lives at the repository root so Swift Package Manager can
// fetch CorvidLabs/algochat. Sources stay in swift/.
let package = Package(
    name: "algochat",
    platforms: [
        .iOS(.v15),
        .macOS(.v12),
        .tvOS(.v15),
        .watchOS(.v8),
        .visionOS(.v1)
    ],
    products: [
        .library(name: "AlgoChat", targets: ["AlgoChat"]),
        .executable(name: "algochat", targets: ["AlgoChatCLI"]),
        .executable(name: "pqcross", targets: ["PQCross"])
    ],
    dependencies: [
        .package(url: "https://github.com/CorvidLabs/swift-algokit.git", from: "0.0.2"),
        // swift-algorand 0.4.0 made AlgorandConfiguration factories throwing, which does not
        // compile against swift-algokit 0.0.2. Hold the transitive pin below 0.4.0 until AlgoKit updates.
        .package(url: "https://github.com/CorvidLabs/swift-algorand.git", "0.2.0" ..< "0.4.0"),
        .package(url: "https://github.com/apple/swift-crypto.git", from: "3.0.0"),
        .package(url: "https://github.com/CorvidLabs/swift-cli.git", from: "0.1.0"),
        .package(url: "https://github.com/swiftlang/swift-docc-plugin", from: "1.4.0")
    ],
    targets: [
        .target(
            name: "AlgoChat",
            dependencies: [
                .product(name: "AlgoKit", package: "swift-algokit"),
                .product(name: "Algorand", package: "swift-algorand"),
                .product(name: "Crypto", package: "swift-crypto")
            ],
            path: "swift/Sources/AlgoChat",
            swiftSettings: [
                .enableExperimentalFeature("StrictConcurrency")
            ]
        ),
        .executableTarget(
            name: "AlgoChatCLI",
            dependencies: [
                "AlgoChat",
                .product(name: "CLI", package: "swift-cli")
            ],
            path: "swift/Sources/AlgoChatCLI",
            swiftSettings: [
                .enableExperimentalFeature("StrictConcurrency")
            ]
        ),
        .executableTarget(
            name: "PQCross",
            dependencies: ["AlgoChat"],
            path: "swift/Sources/PQCross",
            swiftSettings: [
                .enableExperimentalFeature("StrictConcurrency")
            ]
        ),
        .testTarget(
            name: "AlgoChatTests",
            dependencies: ["AlgoChat"],
            path: "swift/Tests/AlgoChatTests",
            swiftSettings: [
                .enableExperimentalFeature("StrictConcurrency")
            ]
        )
    ]
)
