import RoomPlan
import SceneKit
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
    @Published var capturedRoom: CapturedRoom?

    let isSupported = RoomCaptureSession.isSupported
    let captureManager = RoomCaptureManager()

    func startScan() {
        scanState = .scanning
        exportURL = nil
        showShareSheet = false
        errorText = nil
        wallCount = 0
        furnitureCount = 0
        capturedRoom = nil
    }

    func stopScan() {
        captureManager.stopSession()
    }

    func rescan() {
        startScan()
    }

    func handleScanComplete(_ room: CapturedRoom) {
        wallCount = room.walls.count
        furnitureCount = room.objects.count
        capturedRoom = room
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
        guard exportURL != nil else { return }
        showShareSheet = true
    }
}

// MARK: - 3D Preview

struct RoomPreviewView: UIViewRepresentable {
    let room: CapturedRoom

    func makeUIView(context: Context) -> SCNView {
        let scnView = SCNView()
        scnView.scene = buildScene()
        scnView.allowsCameraControl = true
        scnView.autoenablesDefaultLighting = true
        scnView.backgroundColor = .systemBackground
        return scnView
    }

    func updateUIView(_ uiView: SCNView, context: Context) {}

    private func buildScene() -> SCNScene {
        let scene = SCNScene()

        // Walls
        for wall in room.walls {
            let dims = wall.dimensions
            let box = SCNBox(width: CGFloat(dims.x), height: CGFloat(dims.y), length: CGFloat(dims.z), chamferRadius: 0)
            box.firstMaterial?.diffuse.contents = UIColor.systemGray4.withAlphaComponent(0.5)
            let node = SCNNode(geometry: box)
            node.simdTransform = wall.transform
            scene.rootNode.addChildNode(node)
        }

        // Doors
        for door in room.doors {
            let dims = door.dimensions
            let box = SCNBox(width: CGFloat(dims.x), height: CGFloat(dims.y), length: CGFloat(dims.z), chamferRadius: 0)
            box.firstMaterial?.diffuse.contents = UIColor.systemBrown.withAlphaComponent(0.6)
            let node = SCNNode(geometry: box)
            node.simdTransform = door.transform
            scene.rootNode.addChildNode(node)
        }

        // Windows
        for window in room.windows {
            let dims = window.dimensions
            let box = SCNBox(width: CGFloat(dims.x), height: CGFloat(dims.y), length: CGFloat(dims.z), chamferRadius: 0)
            box.firstMaterial?.diffuse.contents = UIColor.systemCyan.withAlphaComponent(0.4)
            let node = SCNNode(geometry: box)
            node.simdTransform = window.transform
            scene.rootNode.addChildNode(node)
        }

        // Furniture / Objects
        let colors: [UIColor] = [.systemBlue, .systemGreen, .systemOrange, .systemPink, .systemPurple, .systemRed, .systemYellow]
        for (i, obj) in room.objects.enumerated() {
            let dims = obj.dimensions
            let box = SCNBox(width: CGFloat(dims.x), height: CGFloat(dims.y), length: CGFloat(dims.z), chamferRadius: 0.02)
            let color = colors[i % colors.count]
            box.firstMaterial?.diffuse.contents = color.withAlphaComponent(0.7)
            let node = SCNNode(geometry: box)
            node.simdTransform = obj.transform
            scene.rootNode.addChildNode(node)
        }

        return scene
    }
}

// MARK: - Content View

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
                    VStack(spacing: 0) {
                        // 3D Preview
                        if let room = viewModel.capturedRoom {
                            RoomPreviewView(room: room)
                                .frame(maxWidth: .infinity)
                                .frame(height: UIScreen.main.bounds.height * 0.5)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .padding(.horizontal, 16)
                                .padding(.top, 16)
                        }

                        Spacer()

                        // Stats + Actions
                        VStack(spacing: 16) {
                            Text("Scan Complete")
                                .font(.title3)
                                .fontWeight(.semibold)

                            HStack(spacing: 24) {
                                Label("\(viewModel.wallCount) walls", systemImage: "square.split.2x1")
                                Label("\(viewModel.furnitureCount) objects", systemImage: "cube")
                            }
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                            HStack(spacing: 16) {
                                Button("Rescan") {
                                    viewModel.rescan()
                                }
                                .buttonStyle(.bordered)
                                .controlSize(.large)

                                Button("Export JSON") {
                                    viewModel.exportJSON()
                                }
                                .buttonStyle(.borderedProminent)
                                .controlSize(.large)
                                .disabled(viewModel.exportURL == nil)
                            }

                            if let errorText = viewModel.errorText {
                                Text(errorText)
                                    .font(.footnote)
                                    .foregroundStyle(.red)
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal, 24)
                            }
                        }
                        .padding(.bottom, 40)
                    }
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
