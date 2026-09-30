import SwiftUI
import WebKit
import UIKit
import UserNotifications

struct HubWebView: UIViewRepresentable {
    @Binding var isLoading: Bool
    @Binding var lastError: String?

    func makeCoordinator() -> Coordinator {
        Coordinator(isLoading: $isLoading, lastError: $lastError)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.userContentController.add(context.coordinator, name: "tcsNative")

        #if DEBUG
        let pushEnvironment = "sandbox"
        #else
        let pushEnvironment = "production"
        #endif

        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0.0"
        let bundleId = Bundle.main.bundleIdentifier ?? AppConfiguration.bundleId

        let nativeBridge = """
        window.__TCS_NATIVE_APP__ = {
          platform: 'ios',
          version: '(version)',
          bundleId: '(bundleId)',
          pushEnvironment: '(pushEnvironment)',
          requestPushNotifications: function () {
            window.webkit.messageHandlers.tcsNative.postMessage({ action: 'requestPushNotifications' });
          },
          openSettings: function () {
            window.webkit.messageHandlers.tcsNative.postMessage({ action: 'openSettings' });
          }
        };
        document.documentElement.classList.add('tcs-native-ios');
        window.dispatchEvent(new CustomEvent('tcs-native-ready', { detail: window.__TCS_NATIVE_APP__ }));
        """
        configuration.userContentController.addUserScript(
            WKUserScript(
                source: nativeBridge,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.keyboardDismissMode = .interactive
        webView.customUserAgent = ((webView.value(forKey: "userAgent") as? String) ?? "") + " " + AppConfiguration.nativeUserAgentSuffix

        let refresh = UIRefreshControl()
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.refresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        context.coordinator.webView = webView
        context.coordinator.startListening()

        webView.load(URLRequest(url: AppConfiguration.productionURL, cachePolicy: .reloadRevalidatingCacheData))
        return webView
    }

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "tcsNative")
        coordinator.stopListening()
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        @Binding private var isLoading: Bool
        @Binding private var lastError: String?
        weak var webView: WKWebView?

        private var pushObserver: NSObjectProtocol?
        private var openPathObserver: NSObjectProtocol?

        init(isLoading: Binding<Bool>, lastError: Binding<String?>) {
            _isLoading = isLoading
            _lastError = lastError
        }

        deinit {
            stopListening()
        }

        func startListening() {
            guard pushObserver == nil else { return }

            pushObserver = NotificationCenter.default.addObserver(
                forName: .hubNativePushToken,
                object: nil,
                queue: .main
            ) { [weak self] notification in
                self?.forwardNativePushToken(notification.userInfo ?? [:])
            }

            openPathObserver = NotificationCenter.default.addObserver(
                forName: .hubOpenPath,
                object: nil,
                queue: .main
            ) { [weak self] notification in
                guard let path = notification.userInfo?["path"] as? String else { return }
                self?.openHubPath(path)
            }
        }

        func stopListening() {
            if let pushObserver {
                NotificationCenter.default.removeObserver(pushObserver)
                self.pushObserver = nil
            }
            if let openPathObserver {
                NotificationCenter.default.removeObserver(openPathObserver)
                self.openPathObserver = nil
            }
        }

        @objc func refresh(_ sender: UIRefreshControl) {
            webView?.reload()
            sender.endRefreshing()
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            isLoading = true
            lastError = nil
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            isLoading = false
            lastError = nil
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            isLoading = false
            lastError = error.localizedDescription
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            let scheme = url.scheme?.lowercased() ?? ""
            if ["tel", "sms", "mailto"].contains(scheme) {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }

            if ["http", "https"].contains(scheme),
               let host = url.host,
               !AppConfiguration.allowedHosts.contains(host) {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }

            decisionHandler(.allow)
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            guard navigationAction.targetFrame == nil,
                  let url = navigationAction.request.url else {
                return nil
            }

            let scheme = url.scheme?.lowercased() ?? ""
            if ["tel", "sms", "mailto"].contains(scheme) {
                UIApplication.shared.open(url)
                return nil
            }

            if let host = url.host, AppConfiguration.allowedHosts.contains(host) {
                webView.load(URLRequest(url: url))
            } else {
                UIApplication.shared.open(url)
            }
            return nil
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "tcsNative",
                  let body = message.body as? [String: Any],
                  let action = body["action"] as? String else {
                return
            }

            switch action {
            case "requestPushNotifications":
                requestPushNotifications()
            case "openSettings":
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            default:
                break
            }
        }

        private func requestPushNotifications() {
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
                DispatchQueue.main.async {
                    if granted {
                        UIApplication.shared.registerForRemoteNotifications()
                    } else {
                        self.forwardNativePushToken([
                            "error": error?.localizedDescription ?? "Notification permission was not granted."
                        ])
                    }
                }
            }
        }

        private func forwardNativePushToken(_ details: [AnyHashable: Any]) {
            guard let webView else { return }
            var payload: [String: String] = [:]
            for (key, value) in details {
                guard let stringKey = key as? String else { continue }
                payload[stringKey] = String(describing: value)
            }
            guard let data = try? JSONSerialization.data(withJSONObject: payload),
                  let json = String(data: data, encoding: .utf8) else {
                return
            }

            webView.evaluateJavaScript(
                "window.dispatchEvent(new CustomEvent('tcs-native-push-token', { detail: (json) }));"
            )
        }

        private func openHubPath(_ rawPath: String) {
            let path = rawPath.hasPrefix("/") ? rawPath : "/notifications"
            guard let url = URL(string: path, relativeTo: AppConfiguration.productionURL)?.absoluteURL,
                  let host = url.host,
                  AppConfiguration.allowedHosts.contains(host) else {
                return
            }
            webView?.load(URLRequest(url: url))
        }
    }
}
