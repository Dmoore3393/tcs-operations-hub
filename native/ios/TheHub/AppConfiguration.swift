import Foundation

enum AppConfiguration {
    static let productionURL = URL(string: "https://tcs-operations-hub.vercel.app")!
    static let allowedHosts: Set<String> = [
        "tcs-operations-hub.vercel.app"
    ]

    static let bundleId = "com.thomasonchildcaresolutions.thehub"
    static let nativeUserAgentSuffix = "TheHubIOS/1.0"
    static let backgroundLockGracePeriod: TimeInterval = 30
}
