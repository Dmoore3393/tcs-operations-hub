import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var lock: AppLockController
    @EnvironmentObject private var network: NetworkMonitor

    @State private var isLoading = true
    @State private var lastError: String?
    @State private var introStage: IntroStage = .launch
    @State private var introComplete = false

    var body: some View {
        ZStack {
            HubPalette.deepGreen
                .ignoresSafeArea()

            HubWebView(isLoading: $isLoading, lastError: $lastError)
                .ignoresSafeArea(.container, edges: .bottom)
                .opacity(introComplete ? 1 : 0)

            if !introComplete {
                Group {
                    if introStage == .launch {
                        HubLaunchScreen()
                    } else {
                        HubLoadingScreen()
                    }
                }
                .transition(.opacity)
                .zIndex(5)
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
            .zIndex(6)

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
                .zIndex(7)
            }

            if lock.isLocked {
                LockScreen()
                    .transition(.opacity)
                    .zIndex(8)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: lock.isLocked)
        .task {
            guard !introComplete else { return }

            try? await Task.sleep(nanoseconds: 900_000_000)
            withAnimation(.easeInOut(duration: 0.24)) {
                introStage = .loading
            }

            try? await Task.sleep(nanoseconds: 900_000_000)
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

private enum HubPalette {
    static let deepGreen = Color(red: 0.018, green: 0.105, blue: 0.071)
    static let forest = Color(red: 0.027, green: 0.243, blue: 0.137)
    static let brightGreen = Color(red: 0.22, green: 0.92, blue: 0.20)
    static let lime = Color(red: 0.58, green: 1.0, blue: 0.18)
    static let yellow = Color(red: 1.0, green: 0.82, blue: 0.04)
    static let gold = Color(red: 1.0, green: 0.63, blue: 0.03)
}

private struct HubBackdrop: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [HubPalette.deepGreen, HubPalette.forest, HubPalette.deepGreen],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            RadialGradient(
                colors: [HubPalette.brightGreen.opacity(0.24), .clear],
                center: .topTrailing,
                startRadius: 10,
                endRadius: 330
            )

            Circle()
                .stroke(HubPalette.brightGreen.opacity(0.14), lineWidth: 2)
                .frame(width: 430, height: 430)
                .offset(x: 170, y: -250)

            Circle()
                .stroke(HubPalette.yellow.opacity(0.12), lineWidth: 2)
                .frame(width: 360, height: 360)
                .offset(x: -180, y: 310)
        }
        .ignoresSafeArea()
    }
}

private struct HubBrandMark: View {
    var body: some View {
        ZStack {
            Circle()
                .fill(
                    RadialGradient(
                        colors: [HubPalette.brightGreen.opacity(0.28), .clear],
                        center: .center,
                        startRadius: 8,
                        endRadius: 105
                    )
                )
                .frame(width: 210, height: 210)

            HStack(spacing: 18) {
                PersonDot(color: HubPalette.brightGreen, size: 42)
                PersonDot(color: HubPalette.yellow, size: 52)
                PersonDot(color: HubPalette.brightGreen, size: 42)
            }
            .offset(y: -44)

            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(.white)
                .frame(width: 145, height: 112)
                .overlay {
                    VStack(spacing: 10) {
                        ChecklistRow(width: 64)
                        ChecklistRow(width: 54)
                        ChecklistRow(width: 70)
                    }
                    .padding(.horizontal, 16)
                }
                .shadow(color: .black.opacity(0.25), radius: 16, y: 10)
                .offset(y: 34)

            Capsule()
                .trim(from: 0.05, to: 0.78)
                .stroke(
                    LinearGradient(
                        colors: [HubPalette.yellow, HubPalette.lime, HubPalette.brightGreen],
                        startPoint: .leading,
                        endPoint: .trailing
                    ),
                    style: StrokeStyle(lineWidth: 10, lineCap: .round)
                )
                .frame(width: 192, height: 112)
                .rotationEffect(.degrees(-8))
                .offset(y: 36)
                .shadow(color: HubPalette.yellow.opacity(0.35), radius: 10)
        }
        .frame(width: 220, height: 220)
    }
}

private struct PersonDot: View {
    let color: Color
    let size: CGFloat

    var body: some View {
        VStack(spacing: -2) {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [color.opacity(0.65), color],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(width: size * 0.46, height: size * 0.46)
            Capsule()
                .fill(
                    LinearGradient(
                        colors: [color, color.opacity(0.65)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(width: size, height: size * 0.62)
        }
        .shadow(color: color.opacity(0.32), radius: 8)
    }
}

private struct ChecklistRow: View {
    let width: CGFloat

    var body: some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [HubPalette.brightGreen, HubPalette.forest],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(width: 22, height: 22)
                .overlay {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .black))
                        .foregroundStyle(.white)
                }

            Capsule()
                .fill(HubPalette.forest)
                .frame(width: width, height: 7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct HubLaunchScreen: View {
    var body: some View {
        ZStack {
            HubBackdrop()

            VStack(spacing: 0) {
                Spacer()

                ZStack(alignment: .bottom) {
                    Ellipse()
                        .fill(.black.opacity(0.34))
                        .frame(width: 270, height: 54)
                        .blur(radius: 12)
                        .offset(y: 24)

                    VStack(spacing: -12) {
                        HubBrandMark()

                        ZStack {
                            Capsule()
                                .fill(
                                    LinearGradient(
                                        colors: [
                                            HubPalette.brightGreen.opacity(0.88),
                                            HubPalette.forest,
                                            HubPalette.deepGreen
                                        ],
                                        startPoint: .top,
                                        endPoint: .bottom
                                    )
                                )
                                .frame(width: 250, height: 74)
                                .overlay {
                                    Capsule()
                                        .stroke(
                                            LinearGradient(
                                                colors: [HubPalette.yellow, HubPalette.brightGreen],
                                                startPoint: .leading,
                                                endPoint: .trailing
                                            ),
                                            lineWidth: 2
                                        )
                                }

                            Ellipse()
                                .fill(
                                    LinearGradient(
                                        colors: [HubPalette.lime, HubPalette.yellow],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                                .frame(width: 214, height: 20)
                                .offset(y: -26)
                                .blur(radius: 0.4)
                        }
                    }
                }

                VStack(spacing: 8) {
                    Text("THE HUB")
                        .font(.system(size: 38, weight: .black, design: .rounded))
                        .tracking(1.5)
                        .foregroundStyle(
                            LinearGradient(
                                colors: [.white, HubPalette.lime],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )

                    Text("TCS OPERATIONS")
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                        .tracking(4)
                        .foregroundStyle(HubPalette.yellow)
                }
                .padding(.top, 28)

                Spacer()

                Text("Everything your team needs. One secure hub.")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.68))
                    .multilineTextAlignment(.center)
                    .padding(.bottom, 34)
            }
            .padding(.horizontal, 24)
        }
    }
}

private struct HubLoadingScreen: View {
    @State private var expanded = false

    var body: some View {
        ZStack {
            HubBackdrop()

            VStack(spacing: 22) {
                Spacer()

                HubBrandMark()
                    .scaleEffect(0.78)

                VStack(spacing: 6) {
                    Text("The Hub")
                        .font(.system(size: 34, weight: .black, design: .rounded))
                        .foregroundStyle(.white)

                    Text("TCS OPERATIONS")
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .tracking(3.5)
                        .foregroundStyle(HubPalette.yellow)
                }

                VStack(spacing: 12) {
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(.white.opacity(0.13))
                            .frame(width: 240, height: 11)

                        Capsule()
                            .fill(
                                LinearGradient(
                                    colors: [HubPalette.brightGreen, HubPalette.lime, HubPalette.yellow],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: expanded ? 212 : 82, height: 11)
                            .shadow(color: HubPalette.yellow.opacity(0.45), radius: 8)
                    }

                    Text("Preparing your secure workspace…")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.72))
                }
                .padding(.top, 2)

                Spacer()
            }
            .padding(.horizontal, 24)
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.72).repeatForever(autoreverses: true)) {
                expanded = true
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
