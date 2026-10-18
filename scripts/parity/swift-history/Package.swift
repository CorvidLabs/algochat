// swift-tools-version: 6.0
import Foundation
import PackageDescription

guard let repositoryPath = ProcessInfo.processInfo.environment["ALGOCHAT_PARITY_REPOSITORY"] else {
    fatalError("Run this consumer through scripts/parity/swift_history.py")
}

let package = Package(
    name: "SwiftHistoryProbe",
    platforms: [.macOS(.v12)],
    products: [.executable(name: "swift-history-probe", targets: ["SwiftHistoryProbe"])],
    dependencies: [.package(name: "algochat", path: repositoryPath)],
    targets: [
        .executableTarget(
            name: "SwiftHistoryProbe",
            dependencies: [.product(name: "AlgoChat", package: "algochat")]
        )
    ]
)
