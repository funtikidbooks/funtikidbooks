"use client";

import { Upload } from "tus-js-client";
import { createClient } from "@/lib/supabase/client";

// Big files (a whole project's PSDs, a video) go up in 6MB pieces with
// Supabase's resumable (TUS) upload instead of one long request: a plain
// upload of a 1–2GB file over office Wi-Fi or a phone dies on the first
// blip and starts again from zero, this one carries on from the last piece.
// 6MB is the chunk size Supabase requires for this endpoint.
const CHUNK_SIZE = 6 * 1024 * 1024;

function resumableEndpoint(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  // The direct storage host skips a proxy hop and is what Supabase
  // recommends for large uploads; a custom domain keeps the normal path.
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url);
  return m ? `https://${m[1]}.storage.supabase.co/storage/v1/upload/resumable` : `${url}/storage/v1/upload/resumable`;
}

export function uploadResumable(
  bucket: string,
  path: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const supabase = createClient();
  return new Promise((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: resumableEndpoint(),
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      chunkSize: CHUNK_SIZE,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      // Keyed by the destination, not the file: sending the same file twice
      // must not resume into the first message's object.
      fingerprint: async () => `supabase-tus:${bucket}/${path}`,
      metadata: { bucketName: bucket, objectName: path, contentType: file.type || "application/octet-stream", cacheControl: "3600" },
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      // A 2GB upload can outlast the 1-hour sign-in token, so every piece
      // asks for the current one (supabase-js refreshes it in the background).
      onBeforeRequest: async (req) => {
        const { data } = await supabase.auth.getSession();
        if (data.session) req.setHeader("Authorization", `Bearer ${data.session.access_token}`);
      },
      onProgress: (sent, total) => onProgress?.(total ? Math.floor((sent / total) * 100) : 0),
      onSuccess: () => resolve(),
      onError: (err) => reject(err),
    });
    upload
      .findPreviousUploads()
      .then((previous) => {
        if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      })
      .catch(() => upload.start());
  });
}
