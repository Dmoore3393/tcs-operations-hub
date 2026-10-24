import UIKit
import UserNotifications

extension Notification.Name {
    static let hubNativePushToken = Notification.Name("tcs.hub.nativePushToken")
    static let hubOpenPath = Notification.Name("tcs.hub.openPath")
}

@UIApplicationMain
final class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    static var pendingHubPath: String?
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
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
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration", sessionRole: session.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

}
