import RoomPlan
import SwiftUI
import UIKit

struct RoomCaptureContainerView: UIViewRepresentable {
    let onCaptureComplete: (CapturedRoom) -> Void

    func makeUIView(context: Context) -> RoomCaptureView {
        let captureView = RoomCaptureView(frame: .zero)
        captureView.captureSession.delegate = context.coordinator
        captureView.delegate = context.coordinator
        captureView.captureSession.run(configuration: RoomCaptureSession.Configuration())
        return captureView
    }

    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onCaptureComplete: onCaptureComplete)
    }

    @objc(RoomWiseRoomCaptureCoordinator)
    final class Coordinator: NSObject, RoomCaptureViewDelegate, RoomCaptureSessionDelegate {
        private let onCaptureComplete: (CapturedRoom) -> Void

        init(onCaptureComplete: @escaping (CapturedRoom) -> Void) {
            self.onCaptureComplete = onCaptureComplete
        }

        required init?(coder: NSCoder) {
            return nil
        }

        func encode(with coder: NSCoder) {}

        func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
            error == nil
        }

        func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
            guard error == nil else {
                return
            }
            DispatchQueue.main.async {
                self.onCaptureComplete(processedResult)
            }
        }

        func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: Error?) {}
    }
}

struct ActivityView: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
