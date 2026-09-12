import Foundation
import LocalAuthentication

@MainActor
final class AppLockController: ObservableObject {
    @Published private(set) var isLocked = true
    @Published private(set) var message = "Unlock The Hub to continue."

    private var backgroundedAt: Date?

    func appMovedToBackground() {
        backgroundedAt = Date()
    }

    func appBecameActive() {
        guard let backgroundedAt else { return }
        if Date().timeIntervalSince(backgroundedAt) >= AppConfiguration.backgroundLockGracePeriod {
            isLocked = true
        }
        self.backgroundedAt = nil
    }

    func lockNow() {
        isLocked = true
    }

    func unlock() async {
        let context = LAContext()
        context.localizedCancelTitle = "Cancel"

        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            message = "Use your device passcode to unlock The Hub."
            return
        }

        do {
            let success = try await context.evaluatePolicy(
                .deviceOwnerAuthentication,
                localizedReason: "Unlock The Hub to access TCS operations."
            )
            if success {
                isLocked = false
                message = ""
            }
        } catch {
            message = "The Hub stayed locked. Try Face ID, Touch ID, or your device passcode again."
        }
    }
}
