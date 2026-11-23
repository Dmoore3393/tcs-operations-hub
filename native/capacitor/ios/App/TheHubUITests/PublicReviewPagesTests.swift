import XCTest

@MainActor
final class PublicReviewPagesTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    private func launch(_ path: String, javascriptOff: Bool = false) -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: "com.thomasonchildcaresolutions.thehub.public")
        app.launchEnvironment["TCS_UI_TEST_MODE"] = "1"
        app.launchEnvironment["TCS_UI_TEST_PATH"] = path
        app.launchEnvironment["TCS_UI_TEST_JS_OFF"] = javascriptOff ? "1" : "0"
        app.launch()
        return app
    }

    func testLegalPagesRenderSignedOut() {
        for (path, heading) in [("/privacy/", "The Hub Privacy Policy"), ("/terms/", "Terms of Use"), ("/support/", "Support")] {
            let app = launch(path)
            XCTAssertTrue(app.webViews.staticTexts[heading].firstMatch.waitForExistence(timeout: 60), path)
            let screenshot = XCTAttachment(screenshot: app.screenshot())
            screenshot.name = "Signed-out \(path)"
            screenshot.lifetime = .keepAlways
            add(screenshot)
            app.terminate()
        }
    }

    func testLegalPagesRenderWithoutContentJavaScript() {
        for (path, heading) in [("/privacy/", "The Hub Privacy Policy"), ("/terms/", "Terms of Use"), ("/support/", "Support")] {
            let app = launch(path, javascriptOff: true)
            XCTAssertTrue(app.webViews.staticTexts[heading].firstMatch.waitForExistence(timeout: 60), path)
            app.terminate()
        }
    }

    func testBothLoginFormsRenderInPackagedApp() {
        for (path, button) in [("/login/", "Sign In"), ("/parent-login/", "Sign In to Parent Portal")] {
            let app = launch(path)
            XCTAssertTrue(app.webViews.textFields.firstMatch.waitForExistence(timeout: 60), path)
            XCTAssertTrue(app.webViews.secureTextFields.firstMatch.exists, path)
            XCTAssertTrue(app.webViews.buttons[button].firstMatch.exists, path)
            if path == "/parent-login/" {
                XCTAssertTrue(app.webViews.buttons[button].firstMatch.isHittable, "Parent sign-in must be visible on the phone without horizontal scrolling")
            }
            let screenshot = XCTAttachment(screenshot: app.screenshot())
            screenshot.name = "App Store \(path)"
            screenshot.lifetime = .keepAlways
            add(screenshot)
            app.terminate()
        }
    }
}
