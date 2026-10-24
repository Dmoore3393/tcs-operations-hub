import UIKit
import AVFoundation

final class HubQRScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var completion: ((Result<String, Error>) -> Void)?
    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "tcs.native-qr-camera")
    private var preview: AVCaptureVideoPreviewLayer?
    private var completed = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.04, green: 0.25, blue: 0.15, alpha: 1)
        isModalInPresentation = true
        let cancel = UIButton(type: .system); cancel.setTitle("Cancel scan", for: .normal); cancel.tintColor = .white; cancel.titleLabel?.font = .preferredFont(forTextStyle: .headline); cancel.translatesAutoresizingMaskIntoConstraints = false
        cancel.addTarget(self, action: #selector(cancelScan), for: .touchUpInside)
        view.addSubview(cancel)
        NSLayoutConstraint.activate([cancel.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20), cancel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8), cancel.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)])
        guard let camera = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: camera), session.canAddInput(input) else { finish(.failure(NSError(domain: "TCSCamera", code: 1, userInfo: [NSLocalizedDescriptionKey: "The camera could not start. Please try again."]))); return }
        session.addInput(input)
        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { finish(.failure(NSError(domain: "TCSCamera", code: 2, userInfo: [NSLocalizedDescriptionKey: "QR scanning is not available on this device."]))); return }
        session.addOutput(output); output.setMetadataObjectsDelegate(self, queue: .main); output.metadataObjectTypes = [.qr]
        let layer = AVCaptureVideoPreviewLayer(session: session); layer.videoGravity = .resizeAspectFill; layer.frame = view.bounds
        view.layer.insertSublayer(layer, at: 0); preview = layer
        let hint = UILabel(); hint.text = "Point the camera at the posted TCS location QR code."; hint.textColor = .white; hint.numberOfLines = 0; hint.textAlignment = .center; hint.font = .preferredFont(forTextStyle: .body); hint.backgroundColor = UIColor.black.withAlphaComponent(0.65); hint.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hint); NSLayoutConstraint.activate([hint.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20), hint.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20), hint.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24), hint.heightAnchor.constraint(greaterThanOrEqualToConstant: 64)])
        queue.async { self.session.startRunning() }
    }
    override func viewDidLayoutSubviews() { super.viewDidLayoutSubviews(); preview?.frame = view.bounds }
    override func viewDidDisappear(_ animated: Bool) { super.viewDidDisappear(animated); queue.async { self.session.stopRunning() } }
    @objc private func cancelScan() { finish(.failure(NSError(domain: "TCSCamera", code: 3, userInfo: [NSLocalizedDescriptionKey: "QR scanning cancelled."]))) }
    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard let value = (objects.first as? AVMetadataMachineReadableCodeObject)?.stringValue else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred(); finish(.success(value))
    }
    private func finish(_ result: Result<String, Error>) { guard !completed else { return }; completed = true; queue.async { self.session.stopRunning() }; completion?(result); completion = nil }
}
