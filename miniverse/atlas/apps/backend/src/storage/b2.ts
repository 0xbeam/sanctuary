import { createReadStream, statSync } from "fs";
import { basename } from "path";

interface B2AuthResponse {
  authorizationToken: string;
  apiUrl: string;
}

interface B2UploadUrlResponse {
  uploadUrl: string;
  authorizationToken: string;
}

export async function uploadRecording(filePath: string, meetingId: string): Promise<string> {
  const keyId = process.env.B2_APPLICATION_KEY_ID;
  const appKey = process.env.B2_APPLICATION_KEY;
  const bucketName = process.env.B2_BUCKET_NAME || "atlas-recordings";

  if (!keyId || !appKey) throw new Error("B2 credentials not configured");

  // Authorize
  const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
    headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${appKey}`).toString("base64")}` },
  });
  const auth: B2AuthResponse = await authRes.json();

  // Get upload URL
  const bucketsRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_buckets`, {
    method: "POST",
    headers: { Authorization: auth.authorizationToken, "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: keyId!.slice(0, 12), bucketName }),
  });
  const buckets = await bucketsRes.json();
  const bucketId = buckets.buckets?.[0]?.bucketId;
  if (!bucketId) throw new Error(`Bucket ${bucketName} not found`);

  const uploadUrlRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: "POST",
    headers: { Authorization: auth.authorizationToken, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId }),
  });
  const uploadUrl: B2UploadUrlResponse = await uploadUrlRes.json();

  // Upload
  const now = new Date();
  const fileName = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${meetingId}/${basename(filePath)}`;
  const fileSize = statSync(filePath).size;
  const fileBuffer = await new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    createReadStream(filePath)
      .on("data", (chunk: Buffer) => chunks.push(chunk))
      .on("end", () => resolve(Buffer.concat(chunks)));
  });

  const uploadRes = await fetch(uploadUrl.uploadUrl, {
    method: "POST",
    headers: {
      Authorization: uploadUrl.authorizationToken,
      "X-Bz-File-Name": encodeURIComponent(fileName),
      "Content-Type": "b2/x-auto",
      "Content-Length": String(fileSize),
    },
    body: fileBuffer,
  });

  const result = await uploadRes.json();
  return `${auth.apiUrl}/file/${bucketName}/${fileName}`;
}
