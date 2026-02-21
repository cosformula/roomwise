import RoomPlan
import SwiftUI

@MainActor
final class RoomScannerViewModel: ObservableObject {
    @Published var exportURL: URL?
    @Published var showShareSheet = false
    @Published var statusText = "Scan the room, then stop the scan in RoomPlan."
    @Published var errorText: String?

    let isSupported = RoomCaptureSession.isSupported

    func handleScanComplete(_ room: CapturedRoom) {
        do {
            let url = try RoomJSONExporter.exportCapturedRoom(room)
            exportURL = url
            statusText = "Scan complete. Tap Done to export JSON."
            errorText = nil
        } catch {
            errorText = "Could not export JSON: \(error.localizedDescription)"
        }
    }
}

struct ContentView: View {
    @StateObject private var viewModel = RoomScannerViewModel()

    var body: some View {
        ZStack(alignment: .bottom) {
            if viewModel.isSupported {
                RoomCaptureContainerView { capturedRoom in
                    viewModel.handleScanComplete(capturedRoom)
                }
                .ignoresSafeArea()
            } else {
                Text("RoomPlan is not supported on this device.")
                    .multilineTextAlignment(.center)
                    .padding(24)
            }

            VStack(spacing: 10) {
                Text(viewModel.statusText)
                    .font(.footnote)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(.thinMaterial, in: Capsule())

                if let errorText = viewModel.errorText {
                    Text(errorText)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(.thinMaterial, in: Capsule())
                }

                if viewModel.exportURL != nil {
                    Button("Done") {
                        viewModel.showShareSheet = true
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding(.bottom, 20)
        }
        .sheet(isPresented: $viewModel.showShareSheet) {
            if let exportURL = viewModel.exportURL {
                ActivityView(activityItems: [exportURL])
            }
        }
    }
}
