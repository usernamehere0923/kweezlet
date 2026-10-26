// Tiny zip files for tests: what Word, PowerPoint and Excel save is a zip of XML.

type Options = {
  /** Compress the entries (method 8) instead of storing them (method 0). */
  deflate?: boolean;
  /**
   * Write sizes in a data descriptor after the data and zeros in the local
   * header, the way LibreOffice and Google Docs exports do.
   */
  descriptor?: boolean;
};

async function deflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Response(data).body!.pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A zip file holding `entries` (path -> text). CRCs are left 0: the reader does not check them. */
export async function zipFile(name: string, entries: Record<string, string>, options: Options = {}): Promise<File> {
  const { deflate = true, descriptor = false } = options;
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  for (const [path, text] of Object.entries(entries)) {
    const nameBytes = new TextEncoder().encode(path);
    const raw = new TextEncoder().encode(text);
    const data = deflate ? await deflateRaw(raw) : raw;
    const flags = 0x0800 | (descriptor ? 0x0008 : 0);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, flags, true);
    local.setUint16(8, deflate ? 8 : 0, true);
    local.setUint32(18, descriptor ? 0 : data.length, true);
    local.setUint32(22, descriptor ? 0 : raw.length, true);
    local.setUint16(26, nameBytes.length, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);
    let size = 30 + nameBytes.length + data.length;
    if (descriptor) {
      const tail = new DataView(new ArrayBuffer(16));
      tail.setUint32(0, 0x08074b50, true);
      tail.setUint32(8, data.length, true);
      tail.setUint32(12, raw.length, true);
      chunks.push(new Uint8Array(tail.buffer));
      size += 16;
    }
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, flags, true);
    entry.setUint16(10, deflate ? 8 : 0, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, raw.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += size;
  }
  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(entries).length, true);
  end.setUint16(10, Object.keys(entries).length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new File([...chunks, ...central, new Uint8Array(end.buffer)], name);
}
