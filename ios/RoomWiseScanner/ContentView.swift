import RoomPlan
import SwiftUI

@MainActor
final class RoomScannerViewModel: ObservableObject {
    enum ScanState {
        case ready
        case scanning
        case complete
    }

    @Published var scanState: ScanState = .ready
    @Published var exportURL: URL?
    @Published var showShareSheet = false
    @Published var errorText: String?
    @Published var wallCount = 0
    @Published var furnitureCount = 0

    let isSupported = RoomCaptureSession.isSupported
    let captureManager = RoomCaptureManager()

    func startScan() {
        scanState = .scanning
        exportURL = nil
        showShareSheet = false
        errorText = nil
        wallCount = 0
        furnitureCount = 0
    }

    func stopScan() {
        captureManager.stopSession()
    }

    func handleScanComplete(_ room: CapturedRoom) {
        wallCount = room.walls.count
        furnitureCount = room.objects.count
        scanState = .complete
        do {
            let url = try RoomJSONExporter.exportCapturedRoom(room)
            exportURL = url
            errorText = nil
        } catch {
            errorText = "Could not export JSON: \(error.localizedDescription)"
        }
    }

    func exportJSON() {
        guard exportURL != nil else {
            return
        }
        showShareSheet = true
    }
}

struct ContentView: View {
    @StateObject private var viewModel = RoomScannerViewModel()

    var body: some View {
        Group {
            if !viewModel.isSupported {
                Text("RoomPlan is not supported on this device.")
                    .multilineTextAlignment(.center)
                    .padding(24)
            } else {
                switch viewModel.scanState {
                case .ready:
                    VStack(spacing: 16) {
                        Text("RoomWise Scanner")
                            .font(.title2)
                            .fontWeight(.semibold)
                        Text("Scan your room with LiDAR")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Button("Start Scan") {
                            viewModel.startScan()
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                case .scanning:
                    ZStack(alignment: .bottom) {
                        RoomCaptureContainerView(
                            manager: viewModel.captureManager
                        ) { capturedRoom in
                            viewModel.handleScanComplete(capturedRoom)
                        }
                        .ignoresSafeArea()

                        Button("Done") {
                            viewModel.stopScan()
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .padding(.bottom, 40)
                    }

                case .complete:
                    VStack(spacing: 16) {
                        Text("Scan Complete")
                            .font(.title2)
                            .fontWeight(.semibold)

                        VStack(spacing: 8) {
                            Text("Walls: \(viewModel.wallCount)")
                            Text("Furniture: \(viewModel.furnitureCount)")
                        }
                        .font(.body)

                        Button("Export JSON") {
                            viewModel.exportJSON()
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .disabled(viewModel.exportURL == nil)

                        if let errorText = viewModel.errorText {
                            Text(errorText)
                                .font(.footnote)
                                .foregroundStyle(.red)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 24)
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        }
        .sheet(isPresented: $viewModel.showShareSheet) {
            if let exportURL = viewModel.exportURL {
                ActivityView(activityItems: [exportURL])
            }
        }
    }
}
