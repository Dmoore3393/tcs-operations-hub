import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var lock: AppLockController
    @EnvironmentObject private var network: NetworkMonitor

    @State private var isLoading = true
    @State private var lastError: String?

    var body: some View {
        ZStack {
            Color(red: 0.97, green: 0.95, blue: 0.89)
                .ignoresSafeArea()

            HubWebView(isLoading: $isLoading, lastError: $lastError)
                .ignoresSafeArea(.container, edges: .bottom)

            VStack(spacing: 0) {
                if !network.isOnline {
                    Label("Offline — some Hub actions will wait for a connection", systemImage: "wifi.slash")
                        .font(.caption.bold())
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(Color.red.opacity(0.92))
                }

                if isLoading {
                    ProgressView()
                        .tint(Color(red: 0.16, green: 0.30, blue: 0.19))
                        .padding(.top, 8)
                }

                Spacer()
            }

            if let lastError, !network.isOnline {
                VStack(spacing: 12) {
                    Image(systemName: "wifi.exclamationmark")
                        .font(.system(size: 42, weight: .semibold))
                        .foregroundStyle(Color(red: 0.55, green: 0.16, blue: 0.18))
                    Text("The Hub is offline")
                        .font(.title2.bold())
                    Text(lastError)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(24)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                .padding()
            }

            if lock.isLocked {
                LockScreen()
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: lock.isLocked)
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
