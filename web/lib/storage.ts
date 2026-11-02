import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const bucket = process.env.S3_BUCKET ?? "";

const client = new S3Client({
  region: process.env.S3_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT_URL || undefined,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
});

export async function listKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const obj of page.Contents ?? []) if (obj.Key) keys.push(obj.Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys.sort();
}

export async function listFolders(prefix: string): Promise<string[]> {
  const page = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: "/" }),
  );
  return (page.CommonPrefixes ?? [])
    .map((p) => (p.Prefix ?? "").slice(prefix.length).replace(/\/$/, ""))
    .filter(Boolean)
    .sort();
}

export async function readText(key: string): Promise<string | null> {
  try {
    const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return (await out.Body?.transformToString("utf-8")) ?? null;
  } catch (err) {
    if ((err as { name?: string }).name === "NoSuchKey") return null;
    throw err;
  }
}

/**
 * readText for big files that rarely change (ads.json is ~9 MB): kept in this server's memory and
 * only downloaded again when the file's ETag changes. Within `freshMs` it isn't even checked.
 */
const memo = new Map<string, { etag?: string; text: string | null; at: number }>();
export async function readTextCached(key: string, freshMs = 20_000): Promise<string | null> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < freshMs) return hit.text;
  if (hit) {
    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      if (head.ETag && head.ETag === hit.etag) {
        hit.at = Date.now();
        return hit.text;
      }
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name !== "NotFound" && name !== "NoSuchKey") throw err;
    }
  }
  try {
    const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const text = (await out.Body?.transformToString("utf-8")) ?? null;
    memo.set(key, { etag: out.ETag, text, at: Date.now() });
    return text;
  } catch (err) {
    if ((err as { name?: string }).name === "NoSuchKey") {
      memo.set(key, { text: null, at: Date.now() });
      return null;
    }
    throw err;
  }
}

export async function writeText(key: string, text: string, contentType = "application/json") {
  memo.delete(key);
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: text, ContentType: contentType }),
  );
}

/** A short-lived link to a private file (frames, videos), so the browser loads it straight from R2. */
export async function signedUrl(key: string, seconds = 3600): Promise<string> {
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: seconds,
  });
}

export async function exists(key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.name === "NotFound" || e.$metadata?.httpStatusCode === 404) return false;
    throw err;
  }
}

export async function deleteKey(key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
