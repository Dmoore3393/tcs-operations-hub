import SwiftUI
import UIKit

struct ContentView: View {
    @EnvironmentObject private var lock: AppLockController
    @EnvironmentObject private var network: NetworkMonitor

    @State private var isLoading = true
    @State private var lastError: String?
    @State private var introStage: IntroStage = .launch
    @State private var introComplete = false

    var body: some View {
        ZStack {
            Color(red: 0.024, green: 0.161, blue: 0.110)
                .ignoresSafeArea()

            HubWebView(isLoading: $isLoading, lastError: $lastError)
                .ignoresSafeArea(.container, edges: .bottom)
                .opacity(introComplete ? 1 : 0)

            if !introComplete {
                HubArtwork(
                    resource: introStage == .launch ? "tcs-hub-launch" : "tcs-hub-loading",
                    fileExtension: "webp"
                )
                .ignoresSafeArea()
                .transition(.opacity)
            }

            VStack(spacing: 0) {
                if !network.isOnline {
                    Label("Offline — some Hub actions will wait for a connection", systemImage: "wifi.slash")
                        .font(.caption.bold())
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(Color.red.opacity(0.92))
                }

                Spacer()
            }

            if let lastError, !network.isOnline {
                VStack(spacing: 12) {
                    Image(systemName: "wifi.exclamationmark")
                        .font(.system(size: 42, weight: .semibold))
                        .foregroundStyle(.white)
                    Text("The Hub is offline")
                        .font(.title2.bold())
                        .foregroundStyle(.white)
                    Text(lastError)
                        .font(.footnote)
                        .foregroundStyle(.white.opacity(0.78))
                        .multilineTextAlignment(.center)
                }
                .padding(24)
                .background(.black.opacity(0.38), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                .padding()
            }

            if lock.isLocked {
                LockScreen()
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: lock.isLocked)
        .task {
            guard !introComplete else { return }

            try? await Task.sleep(nanoseconds: 750_000_000)
            withAnimation(.easeInOut(duration: 0.22)) {
                introStage = .loading
            }

            try? await Task.sleep(nanoseconds: 750_000_000)
            finishIntroIfReady()
        }
        .onChange(of: isLoading) { loading in
            if !loading && introStage == .loading {
                finishIntroIfReady()
            }
        }
    }

    private func finishIntroIfReady() {
        guard !isLoading else { return }
        withAnimation(.easeOut(duration: 0.3)) {
            introComplete = true
        }
    }
}

private enum IntroStage {
    case launch
    case loading
}

private struct HubArtwork: View {
    let resource: String
    let fileExtension: String

    private var image: UIImage? {
        guard let url = Bundle.main.url(forResource: resource, withExtension: fileExtension),
              let data = try? Data(contentsOf: url) else {
            return nil
        }
        return UIImage(data: data)
    }

    var body: some View {
        ZStack {
            Color(red: 0.024, green: 0.161, blue: 0.110)
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .padding(.horizontal, 10)
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "checkmark.shield.fill")
                        .font(.system(size: 52, weight: .bold))
                    Text("The Hub")
                        .font(.largeTitle.bold())
                    Text("TCS Operations")
                        .font(.headline)
                        .opacity(0.75)
                }
                .foregroundStyle(.white)
            }
        }
    }
}

private struct LockScreen: View {
    @EnvironmentObject private var lock: AppLockController

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.07, green: 0.17, blue: 0.11),
                    Color(red: 0.14, green: 0.35, blue: 0.22)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 20) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 58))
                    .foregroundStyle(.white)

                VStack(spacing: 8) {
                    Text("The Hub")
                        .font(.largeTitle.bold())
                        .foregroundStyle(.white)
                    Text("TCS Operations")
                        .font(.headline)
                        .foregroundStyle(.white.opacity(0.75))
                }

                Text(lock.message)
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.78))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)

                Button {
                    Task { await lock.unlock() }
                } label: {
                    Label("Unlock The Hub", systemImage: "faceid")
                        .font(.headline)
                        .frame(maxWidth: 280)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.borderedProminent)
                .tint(.white)
                .foregroundStyle(Color(red: 0.12, green: 0.28, blue: 0.18))
            }
            .padding()
        }
        .task {
            await lock.unlock()
        }
    }
}
