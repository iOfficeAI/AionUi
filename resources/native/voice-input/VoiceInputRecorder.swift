import AVFAudio
import AVFoundation
import Foundation

private struct RecorderEnvelope: Codable {
    let event: String
    let pcmBase64: String?
    let durationMs: Int?
    let bytes: Int?
    let message: String?

    init(
        event: String,
        pcmBase64: String? = nil,
        durationMs: Int? = nil,
        bytes: Int? = nil,
        message: String? = nil
    ) {
        self.event = event
        self.pcmBase64 = pcmBase64
        self.durationMs = durationMs
        self.bytes = bytes
        self.message = message
    }
}

private enum RecorderError: LocalizedError {
    case microphonePermissionDenied
    case converterUnavailable

    var errorDescription: String? {
        switch self {
        case .microphonePermissionDenied:
            return "Microphone permission is required."
        case .converterUnavailable:
            return "Unable to create audio format converter."
        }
    }
}

private final class NativeAudioRecorder {
    private let outputFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16,
        sampleRate: 16_000,
        channels: 1,
        interleaved: true
    )!

    private let bufferLock = NSLock()
    private var engine: AVAudioEngine?
    private var recordingBuffer = Data()
    private var isCapturing = false

    func ensurePermission() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            return true
        case .denied, .restricted:
            return false
        case .notDetermined:
            return await withCheckedContinuation { continuation in
                AVCaptureDevice.requestAccess(for: .audio) { granted in
                    continuation.resume(returning: granted)
                }
            }
        @unknown default:
            return false
        }
    }

    func start() throws {
        guard !isCapturing else {
            return
        }

        teardown()

        let engine = AVAudioEngine()
        self.engine = engine

        let inputNode = engine.inputNode
        let inputFormat = inputNode.inputFormat(forBus: 0)

        bufferLock.lock()
        recordingBuffer = Data()
        bufferLock.unlock()

        let framesPerBuffer = AVAudioFrameCount(max(1_024, Int(inputFormat.sampleRate / 10)))
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: framesPerBuffer, format: inputFormat) { [weak self, outputFormat] buffer, _ in
            guard
                let self,
                let data = Self.convert(buffer: buffer, outputFormat: outputFormat)
            else {
                return
            }

            self.bufferLock.lock()
            self.recordingBuffer.append(data)
            self.bufferLock.unlock()
        }

        engine.prepare()
        try engine.start()
        isCapturing = true
    }

    func stop() -> Data {
        if isCapturing {
            teardown()
            isCapturing = false
        }

        bufferLock.lock()
        let finalBuffer = recordingBuffer
        recordingBuffer = Data()
        bufferLock.unlock()
        return finalBuffer
    }

    func cancel() {
        if isCapturing {
            teardown()
            isCapturing = false
        }

        bufferLock.lock()
        recordingBuffer = Data()
        bufferLock.unlock()
    }

    private static func convert(buffer: AVAudioPCMBuffer, outputFormat: AVAudioFormat) -> Data? {
        guard let converter = AVAudioConverter(from: buffer.format, to: outputFormat) else {
            return nil
        }

        let ratio = outputFormat.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1

        guard let convertedBuffer = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: capacity) else {
            return nil
        }

        var sourceBuffer: AVAudioPCMBuffer? = buffer
        var conversionError: NSError?
        let inputBlock: AVAudioConverterInputBlock = { _, outStatus in
            if let currentBuffer = sourceBuffer {
                outStatus.pointee = .haveData
                sourceBuffer = nil
                return currentBuffer
            }

            outStatus.pointee = .endOfStream
            return nil
        }

        converter.convert(to: convertedBuffer, error: &conversionError, withInputFrom: inputBlock)
        guard conversionError == nil else {
            return nil
        }

        guard let channelData = convertedBuffer.int16ChannelData else {
            return nil
        }

        let frameLength = Int(convertedBuffer.frameLength)
        let bytesPerFrame = Int(outputFormat.streamDescription.pointee.mBytesPerFrame)
        return Data(bytes: channelData[0], count: frameLength * bytesPerFrame)
    }

    private func teardown() {
        if let engine {
            engine.inputNode.removeTap(onBus: 0)
            engine.stop()
        }
        engine = nil
    }
}

private func emit(_ envelope: RecorderEnvelope) throws {
    let data = try JSONEncoder().encode(envelope)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0A]))
}

@main
private struct VoiceInputRecorderCLI {
    static func main() async {
        let recorder = NativeAudioRecorder()
        let startedAt = Date()

        let granted = await recorder.ensurePermission()
        guard granted else {
            try? emit(.init(event: "error", message: RecorderError.microphonePermissionDenied.localizedDescription))
            Foundation.exit(1)
        }

        do {
            try recorder.start()
            try emit(.init(event: "ready"))
        } catch {
            try? emit(.init(event: "error", message: error.localizedDescription))
            Foundation.exit(1)
        }

        while let line = readLine() {
            switch line.trimmingCharacters(in: .whitespacesAndNewlines) {
            case "stop":
                let audioData = recorder.stop()
                let durationMs = max(0, Int(Date().timeIntervalSince(startedAt) * 1000))
                try? emit(
                    .init(
                        event: "result",
                        pcmBase64: audioData.base64EncodedString(),
                        durationMs: durationMs,
                        bytes: audioData.count
                    )
                )
                Foundation.exit(0)
            case "cancel":
                recorder.cancel()
                try? emit(.init(event: "cancelled"))
                Foundation.exit(0)
            default:
                continue
            }
        }

        recorder.cancel()
        try? emit(.init(event: "cancelled"))
        Foundation.exit(0)
    }
}
