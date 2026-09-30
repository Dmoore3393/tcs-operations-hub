import SwiftUI

@main
struct TheHubApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase

    @StateObject private var lock = AppLockController()
    @StateObject private var network = NetworkMonitor()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(lock)
                .environmentObject(network)
        }
        .onChange(of: scenePhase) { newPhase in
            switch newPhase {
            case .background:
                lock.appMovedToBackground()
            case .active:
                lock.appBecameActive()
            default:
                break
            }
        }
    }
}
