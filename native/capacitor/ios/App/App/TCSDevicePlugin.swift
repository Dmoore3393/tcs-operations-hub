import Capacitor
import UIKit
import AVFoundation
import LocalAuthentication
import UserNotifications

@objc(TCSDevicePlugin)
public final class TCSDevicePlugin: CAPPlugin, CAPBridgedPlugin, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    public let identifier = "TCSDevicePlugin"
    public let jsName = "TCSDevice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "info", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sessionChanged", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scanQR", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "registerPush", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

    private let signedInKey = "tcs.hasSignedIn"
    private let approvedHost = "tcs-operations-hub.vercel.app"
    private var observers: [NSObjectProtocol] = []
    private var photoCall: CAPPluginCall?
    private var pushCall: CAPPluginCall?
    private var pushTimer: Timer?
    private var cover: UIView?
    private var backgroundedAt: Date?
    private var locked = false
    private var authenticating = false

    public override func load() {
        super.load()
        #if DEBUG
        if HubNativeQA.startPath != nil { return }
        #endif
        locked = UserDefaults.standard.bool(forKey: self.signedInKey)
        DispatchQueue.main.async { [weak self] in if self?.locked == true { self?.showCover() } }
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self, UserDefaults.standard.bool(forKey: self.signedInKey) else { return }
            self.showCover()
        })
        observers.append(center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in self?.backgroundedAt = Date() })
        observers.append(center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self else { return }
            if let at = self.backgroundedAt, Date().timeIntervalSince(at) >= 30 { self.locked = UserDefaults.standard.bool(forKey: self.signedInKey) }
            self.backgroundedAt = nil
            if self.locked { self.unlock() } else { self.hideCover() }
        })
        observers.append(center.addObserver(forName: .hubNativePushToken, object: nil, queue: .main) { [weak self] notification in
            guard let self, let call = self.pushCall else { return }
            self.pushTimer?.invalidate()
            self.pushCall = nil
            if let error = notification.userInfo?["error"] as? String { call.reject(error); return }
            var result: [String: String] = [:]
            notification.userInfo?.forEach { key, value in if let key = key as? String { result[key] = String(describing: value) } }
            call.resolve(result)
        })
        observers.append(center.addObserver(forName: .hubOpenPath, object: nil, queue: .main) { [weak self] notification in
            guard let self, let path = notification.userInfo?["path"] as? String,
                  path.hasPrefix("/"), !path.hasPrefix("//"),
                  let url = URL(string: "capacitor://localhost\(path)"), url.host == "localhost" else { return }
            AppDelegate.pendingHubPath = nil
            self.bridge?.webView?.load(URLRequest(url: url))
        })
    }

    deinit { observers.forEach { NotificationCenter.default.removeObserver($0) }; pushTimer?.invalidate() }

    private func trusted(_ call: CAPPluginCall) -> Bool {
        guard let url = bridge?.webView?.url, ((url.scheme == "capacitor" && url.host == "localhost") || (url.scheme == "https" && url.host == approvedHost)) else {
            call.reject("Native TCS features are available only inside the approved Hub.")
            return false
        }
        return true
    }

    @objc func info(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.trusted(call) else { return }
            #if DEBUG
            let environment = "sandbox"
            #else
            let environment = "production"
            #endif
            if let path = AppDelegate.pendingHubPath {
                AppDelegate.pendingHubPath = nil
                DispatchQueue.main.async {
                    if let url = URL(string: "capacitor://localhost\(path)"), url.host == "localhost" { self.bridge?.webView?.load(URLRequest(url: url)) }
                }
            }
            UNUserNotificationCenter.current().getNotificationSettings { settings in
                let permission = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional ? "granted" : settings.authorizationStatus == .denied ? "denied" : "default"
                call.resolve(["version": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0", "bundleId": Bundle.main.bundleIdentifier ?? "com.thomasonchildcaresolutions.thehub", "pushEnvironment": environment, "notificationPermission": permission])
            }

        }
    }

    @objc func sessionChanged(_ call: CAPPluginCall) {
        #if DEBUG
        if HubNativeQA.startPath != nil { call.resolve(); return }
        #endif
        DispatchQueue.main.async {
            guard self.trusted(call) else { return }
            let signedIn = call.getBool("authenticated") ?? false
            let previouslySignedIn = UserDefaults.standard.bool(forKey: self.signedInKey)
            let context = LAContext(); var error: NSError?
            let canUnlock = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error)
            UserDefaults.standard.set(signedIn && canUnlock, forKey: self.signedInKey)
            DispatchQueue.main.async {
                if !signedIn || !canUnlock { self.locked = false; self.hideCover() }
                else if previouslySignedIn && self.locked { self.showCover(); self.unlock() }
            }
            call.resolve()

        }
    }

    private func showCover() {
        guard cover == nil, let root = bridge?.viewController?.view else { return }
        let panel = UIView(frame: root.bounds)
        panel.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        panel.backgroundColor = UIColor(red: 0.043, green: 0.365, blue: 0.208, alpha: 1)
        let title = UILabel(); title.text = "The Hub"; title.textColor = .white; title.font = .preferredFont(forTextStyle: .largeTitle); title.adjustsFontForContentSizeCategory = true
        let detail = UILabel(); detail.text = "Unlock your existing TCS session with Face ID or your device passcode."; detail.numberOfLines = 0; detail.textColor = .white; detail.font = .preferredFont(forTextStyle: .body); detail.adjustsFontForContentSizeCategory = true
        let button = UIButton(type: .system); button.setTitle("Unlock The Hub", for: .normal); button.tintColor = .white; button.titleLabel?.font = .preferredFont(forTextStyle: .headline); button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        button.addTarget(self, action: #selector(unlockTapped), for: .touchUpInside)
        let links = UIStackView(); links.axis = .vertical; links.spacing = 4
        for (label, path) in [("Privacy", "/privacy"), ("Terms", "/terms"), ("Support", "/support")] {
            let link = UIButton(type: .system); link.setTitle(label, for: .normal); link.tintColor = .white; link.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
            link.addAction(UIAction { _ in if let url = URL(string: "https://\(self.approvedHost)\(path)") { UIApplication.shared.open(url) } }, for: .touchUpInside)
            links.addArrangedSubview(link)
        }
        let stack = UIStackView(arrangedSubviews: [title, detail, button, links]); stack.axis = .vertical; stack.spacing = 18; stack.translatesAutoresizingMaskIntoConstraints = false
        panel.addSubview(stack); root.addSubview(panel)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: panel.safeAreaLayoutGuide.leadingAnchor, constant: 24), stack.trailingAnchor.constraint(equalTo: panel.safeAreaLayoutGuide.trailingAnchor, constant: -24), stack.centerYAnchor.constraint(equalTo: panel.centerYAnchor)])
        cover = panel
    }

    private func hideCover() { cover?.removeFromSuperview(); cover = nil }
    @objc private func unlockTapped() { locked = true; unlock() }
    private func unlock() {
        guard !authenticating, locked, bridge?.viewController?.view.window != nil else { return }
        let context = LAContext(); var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else { return }
        authenticating = true
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Unlock your existing TCS session.") { success, _ in
            DispatchQueue.main.async { self.authenticating = false; if success { self.locked = false; self.hideCover() } }
        }
    }

    private func cameraAccess(_ call: CAPPluginCall, ready: @escaping () -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: ready()
        case .notDetermined: AVCaptureDevice.requestAccess(for: .video) { granted in DispatchQueue.main.async { if granted { ready() } else { call.reject("Camera access was not allowed. You can change this in iPhone Settings.") } } }
        default: call.reject("Camera access is unavailable. Open iPhone Settings to allow the camera.")
        }
    }

    @objc func scanQR(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.trusted(call) else { return }
            guard !self.locked else { call.reject("Unlock The Hub before using this feature."); return }
            self.cameraAccess(call) {
                guard AVCaptureDevice.default(for: .video) != nil else { call.reject("This device has no camera. Test QR scanning on a physical iPhone."); return }
                guard self.bridge?.viewController?.presentedViewController == nil else { call.reject("Finish the current camera action first."); return }
                let scanner = HubQRScannerViewController()
                scanner.completion = { [weak scanner] result in
                    scanner?.dismiss(animated: true)
                    switch result { case .success(let value): call.resolve(["value": value]); case .failure(let error): call.reject(error.localizedDescription) }
                }
                self.bridge?.viewController?.present(scanner, animated: true)
            }
        }
    }

    @objc func takePhoto(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.trusted(call) else { return }
            guard !self.locked else { call.reject("Unlock The Hub before using this feature."); return }
            self.cameraAccess(call) {
                guard UIImagePickerController.isSourceTypeAvailable(.camera) else { call.reject("This device has no camera. Choose an existing photo instead."); return }
                guard self.photoCall == nil, self.bridge?.viewController?.presentedViewController == nil else { call.reject("Finish the current photo first."); return }
                self.photoCall = call
                let picker = UIImagePickerController(); picker.sourceType = .camera; picker.delegate = self
                self.bridge?.viewController?.present(picker, animated: true)
            }
        }
    }

    public func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true); photoCall?.reject("Photo capture cancelled."); photoCall = nil
    }
    public func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        guard let call = photoCall else { picker.dismiss(animated: true); return }
        photoCall = nil
        guard let original = info[.originalImage] as? UIImage else { picker.dismiss(animated: true); call.reject("Could not read the photo."); return }
        let scale = min(1, 1600 / max(original.size.width, original.size.height))
        let size = CGSize(width: original.size.width * scale, height: original.size.height * scale)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in original.draw(in: CGRect(origin: .zero, size: size)) }
        picker.dismiss(animated: true)
        guard let data = image.jpegData(compressionQuality: 0.82) else { call.reject("Could not prepare the photo."); return }
        // Redrawing removes camera EXIF/location metadata; no copy is saved to Photos.
        call.resolve(["dataUrl": "data:image/jpeg;base64," + data.base64EncodedString()])
    }

    @objc func registerPush(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [self] in
            guard self.trusted(call) else { return }
            guard !self.locked else { call.reject("Unlock The Hub before using this feature."); return }
            guard self.pushCall == nil else { call.reject("Notification registration is already in progress."); return }
            self.pushCall = call
            self.pushTimer = Timer.scheduledTimer(withTimeInterval: 14, repeats: false) { [weak self] _ in self?.pushCall?.reject("The iPhone did not return a notification token. Please try again."); self?.pushCall = nil }
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
                DispatchQueue.main.async {
                    if granted { UIApplication.shared.registerForRemoteNotifications() }
                    else { self.pushTimer?.invalidate(); self.pushCall?.reject(error?.localizedDescription ?? "Notifications were not allowed. You can change this in iPhone Settings."); self.pushCall = nil }
                }
            }
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async { guard self.trusted(call) else { return }; if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }; call.resolve() }
    }
}
