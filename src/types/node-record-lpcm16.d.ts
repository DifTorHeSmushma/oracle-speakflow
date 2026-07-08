declare module "node-record-lpcm16" {
  import { Readable } from "node:stream";

  interface RecordOptions {
    sampleRate?: number;
    channels?: number;
    audioType?: string;
    recorder?: string;
    device?: string | null;
    verbose?: boolean;
    silence?: string;
  }

  interface Recording {
    stream(): Readable;
    stop(): void;
  }

  function record(options?: RecordOptions): Recording;

  export = { record };
}
