import Capacitor
import WebKit
import UIKit

#if DEBUG
enum HubNativeQA {
    static var startPath: String? {
        let environment = ProcessInfo.processInfo.environment
        guard environment["TCS_UI_TEST_MODE"] == "1", let path = environment["TCS_UI_TEST_PATH"],
              ["/privacy/", "/terms/", "/support/", "/login/", "/parent-login/"].contains(path) else { return nil }
        return path
    }
}
#endif

final class HubBridgeViewController: CAPBridgeViewController {
    // Next's exported pages each have their own HTML, including JS-off legal pages.
    override func router() -> Router { HubStaticRouter() }

    #if DEBUG
    override func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        if let path = HubNativeQA.startPath { descriptor.appStartPath = String(path.dropFirst()) }
        return descriptor
    }

    override func webViewConfiguration(for configuration: InstanceConfiguration) -> WKWebViewConfiguration {
        let result = super.webViewConfiguration(for: configuration)
        if HubNativeQA.startPath != nil {
            result.websiteDataStore = .nonPersistent()
            result.defaultWebpagePreferences.allowsContentJavaScript = ProcessInfo.processInfo.environment["TCS_UI_TEST_JS_OFF"] != "1"
        }
        return result
    }
    #endif

    override func capacitorDidLoad() {
        #if DEBUG
        NSLog("TCS Capacitor bridge initialized")
        #endif
        bridge?.registerPluginInstance(TCSDevicePlugin())
        webView?.allowsBackForwardNavigationGestures = true
        webView?.scrollView.keyboardDismissMode = .interactive
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
}

private struct HubStaticRouter: Router {
    var basePath = ""

    func route(for path: String) -> String {
        let root = URL(fileURLWithPath: basePath, isDirectory: true).standardizedFileURL
        let relative = (path.removingPercentEncoding ?? path).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let file = root.appendingPathComponent(relative).standardizedFileURL
        let missing = root.appendingPathComponent("404.html").path
        guard file.path == root.path || file.path.hasPrefix(root.path + "/") else { return missing }
        if file.pathExtension.isEmpty {
            let index = file.appendingPathComponent("index.html")
            if FileManager.default.fileExists(atPath: index.path) { return index.path }
        }
        var isDirectory: ObjCBool = false
        if FileManager.default.fileExists(atPath: file.path, isDirectory: &isDirectory), !isDirectory.boolValue { return file.path }
        return missing
    }
}
