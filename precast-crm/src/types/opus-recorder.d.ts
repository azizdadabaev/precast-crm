// Minimal types for opus-recorder (no types ship with the package). We only
// use the recorder for OGG/OPUS voice notes; see components/inbox/VoiceRecorder.
declare module "opus-recorder" {
  interface RecorderOptions {
    /** URL of the encoder worker (served from /public). */
    encoderPath?: string;
    numberOfChannels?: number;
    encoderSampleRate?: number;
    /** 2048 = VOIP, 2049 = Audio. */
    encoderApplication?: number;
    encoderBitRate?: number;
    /** false = emit the whole OGG once on stop. */
    streamPages?: boolean;
    [key: string]: unknown;
  }
  export default class Recorder {
    constructor(options?: RecorderOptions);
    static isRecordingSupported(): boolean;
    ondataavailable: ((typedArray: Uint8Array) => void) | null;
    onstart: (() => void) | null;
    onstop: (() => void) | null;
    onpause: (() => void) | null;
    onresume: (() => void) | null;
    start(): Promise<void>;
    stop(): void;
    pause(): void;
    resume(): void;
  }
}
