import UIKit
import UserNotifications
import SwiftUI

// Preserve the existing app's SwiftUI scene identity across upgrades. UIKit
// otherwise restores its old SwiftUI scene without constructing the new bridge.
@main
struct TheHubNativeApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            HubNativeRoot()
                .background(Color(red: 11.0 / 255, green: 93.0 / 255, blue: 53.0 / 255))
                .ignoresSafeArea()
        }
    }
}

private struct HubNativeRoot: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> HubBridgeViewController { HubBridgeViewController() }
    func updateUIViewController(_ controller: HubBridgeViewController, context: Context) {}
}

extension Notification.Name {
    static let hubNativePushToken = Notification.Name("tcs.hub.nativePushToken")
    static let hubOpenPath = Notification.Name("tcs.hub.openPath")
}

final class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    static var pendingHubPath: String?
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        #if DEBUG
        NSLog("TCS native application started")
        #endif
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        #if DEBUG
        let environment = "sandbox"
        #else
        let environment = "production"
        #endif

        NotificationCenter.default.post(
            name: .hubNativePushToken,
            object: nil,
            userInfo: [
                "deviceToken": token,
                "environment": environment,
                "bundleId": Bundle.main.bundleIdentifier ?? "com.thomasonchildcaresolutions.thehub",
                "appVersion": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0.0",
            ]
        )
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        NotificationCenter.default.post(
            name: .hubNativePushToken,
            object: nil,
            userInfo: ["error": error.localizedDescription]
        )
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list, .sound])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let raw = response.notification.request.content.userInfo["href"] as? String ?? "/notifications"
        let path = raw.hasPrefix("/") && !raw.hasPrefix("//") ? raw : "/notifications"
        Self.pendingHubPath = path
        NotificationCenter.default.post(name: .hubOpenPath, object: nil, userInfo: ["path": path])
        completionHandler()
    }
}
