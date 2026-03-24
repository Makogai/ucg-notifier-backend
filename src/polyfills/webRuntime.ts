import { ReadableStream, TransformStream, WritableStream } from "node:stream/web";
import { Blob, File } from "node:buffer";

const g = globalThis as typeof globalThis & {
  ReadableStream?: typeof ReadableStream;
  WritableStream?: typeof WritableStream;
  TransformStream?: typeof TransformStream;
  Blob?: typeof Blob;
  File?: typeof File;
  DOMException?: typeof DOMException;
};

if (typeof g.ReadableStream === "undefined") {
  g.ReadableStream = ReadableStream;
}

if (typeof g.WritableStream === "undefined") {
  g.WritableStream = WritableStream;
}

if (typeof g.TransformStream === "undefined") {
  g.TransformStream = TransformStream;
}

if (typeof g.Blob === "undefined") {
  g.Blob = Blob;
}

if (typeof g.File === "undefined") {
  g.File = File;
}

if (typeof g.DOMException === "undefined") {
  class PolyfilledDOMException extends Error {
    code?: number;
    constructor(message = "", name = "DOMException") {
      super(message);
      this.name = name;
    }
  }
  g.DOMException = PolyfilledDOMException as unknown as typeof DOMException;
}
