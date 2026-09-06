export class JsonBodyTooLargeError extends Error {
  constructor() {
    super('Request body exceeds the allowed size.');
    this.name = 'JsonBodyTooLargeError';
  }
}

/** Count bytes before decoding or allocating the complete JSON body. */
export async function readBoundedJson(
  source: AsyncIterable<Uint8Array>,
  maxBytes: number,
): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of source) {
    size += chunk.byteLength;
    if (size > maxBytes) throw new JsonBodyTooLargeError();
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks, size).toString('utf8')) as unknown;
}
