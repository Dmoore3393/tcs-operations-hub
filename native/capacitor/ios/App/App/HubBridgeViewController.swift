import Capacitor
import WebKit
import UIKit

final class HubBridgeViewController: CAPBridgeViewController {
    // Next's exported pages each have their own HTML, including JS-off legal pages.
    override func router() -> Router { HubStaticRouter() }

    override func capacitorDidLoad() {
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
