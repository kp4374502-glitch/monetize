import { del, get, put } from "@vercel/blob";

/**
 * Where analytics-proof screenshots live. The ONLY module that talks to Vercel Blob (mirrors how
 * lib/scrapecreators.ts isolates ScrapeCreators), behind a small interface so tests can inject an
 * in-memory store. Blobs are PRIVATE: they can only be read with the server-side token, so a creator's
 * analytics are never reachable by URL — reads go through the access-checked /api/proof route.
 */
export interface ProofImageStore {
  put(pathname: string, bytes: Uint8Array, contentType: string): Promise<void>;
  del(pathname: string): Promise<void>;
  get(pathname: string): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string; size: number } | null>;
}

function requireToken() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Screenshot uploads aren't set up yet. Please submit a video link instead.");
  }
}

export const vercelBlobStore: ProofImageStore = {
  async put(pathname, bytes, contentType) {
    requireToken();
    await put(pathname, Buffer.from(bytes), {
      access: "private",
      contentType,
      addRandomSuffix: false, // the pathname already contains a random UUID
      allowOverwrite: false,
    });
  },

  async del(pathname) {
    requireToken();
    await del(pathname);
  },

  async get(pathname) {
    requireToken();
    const r = await get(pathname, { access: "private" });
    if (!r || r.statusCode !== 200) return null;
    return { stream: r.stream, contentType: r.blob.contentType, size: r.blob.size };
  },
};
