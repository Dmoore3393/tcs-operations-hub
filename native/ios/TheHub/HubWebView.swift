import SwiftUI
import WebKit
import UIKit

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

        let nativeBridge = """
        window.__TCS_NATIVE_APP__ = {
          platform: 'ios',
          version: '1.0.0'
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
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.keyboardDismissMode = .interactive
        webView.customUserAgent = ((webView.value(forKey: "userAgent") as? String) ?? "") + " " + AppConfiguration.nativeUserAgentSuffix

        let refresh = UIRefreshControl()
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.refresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        context.coordinator.webView = webView
        webView.load(URLRequest(url: AppConfiguration.productionURL, cachePolicy: .reloadRevalidatingCacheData))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate {
        @Binding private var isLoading: Bool
        @Binding private var lastError: String?
        weak var webView: WKWebView?

        init(isLoading: Binding<Bool>, lastError: Binding<String?>) {
            _isLoading = isLoading
            _lastError = lastError
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

            if let host = url.host,
               !AppConfiguration.allowedHosts.contains(host),
               navigationAction.navigationType == .linkActivated {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }

            decisionHandler(.allow)
        }
    }
}
