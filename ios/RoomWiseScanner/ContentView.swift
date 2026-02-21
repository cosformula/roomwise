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
    @Published var statusText = "Scan in progress. Use RoomPlan's Done button when finished."
    @Published var errorText: String?
    @Published var wallCount = 0
    @Published var furnitureCount = 0

    let isSupported = RoomCaptureSession.isSupported

    func startScan() {
        scanState = .scanning
        exportURL = nil
        showShareSheet = false
        errorText = nil
        wallCount = 0
        furnitureCount = 0
        statusText = "Scan in progress. Use RoomPlan's Done button when finished."
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
                    VStack {
                        Button("Start Scan") {
                            viewModel.startScan()
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                case .scanning:
                    ZStack(alignment: .top) {
                        RoomCaptureContainerView { capturedRoom in
                            viewModel.handleScanComplete(capturedRoom)
                        }
                        .ignoresSafeArea()

                        Text(viewModel.statusText)
                            .font(.footnote)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(.thinMaterial, in: Capsule())
                            .padding(.top, 12)
                    }

                case .complete:
                    VStack(spacing: 16) {
                        Text("Scan Complete")
                            .font(.title2)
                            .fontWeight(.semibold)

                        VStack(spacing: 8) {
                            Text("Walls detected: \(viewModel.wallCount)")
                            Text("Furniture detected: \(viewModel.furnitureCount)")
                        }

                        Button("Export JSON") {
                            viewModel.exportJSON()
                        }
                        .buttonStyle(.borderedProminent)
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
