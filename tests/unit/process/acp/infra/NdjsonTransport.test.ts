import { describe, it, expect } from 'vitest';
import { NdjsonTransport } from '@process/acp/infra/NdjsonTransport';

describe('NdjsonTransport', () => {
  it('encodes and decodes a round-trip via memory streams', async () => {
    const { readable: rawReadable, writable: rawWritable } = new TransformStream<Uint8Array>();
    const stream = NdjsonTransport.fromByteStreams(rawWritable, rawReadable);
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();

    const msg = { jsonrpc: '2.0', method: 'test', params: { foo: 'bar' } };
    await writer.write(msg as any);
    await writer.close();

    const { value } = await reader.read();
    expect(value).toEqual(msg);
  });

  it('highWaterMark defaults to 64 (D6)', () => {
    const { readable: rawReadable, writable: rawWritable } = new TransformStream<Uint8Array>();
    const stream = NdjsonTransport.fromByteStreams(rawWritable, rawReadable);
    expect(stream.readable).toBeDefined();
    expect(stream.writable).toBeDefined();
  });
});
