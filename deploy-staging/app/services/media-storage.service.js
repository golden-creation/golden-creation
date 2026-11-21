import crypto from "crypto";
import path from "path";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function cleanString(value) {
  return String(value || "").trim();
}

function cleanSegment(value) {
  return cleanString(value)
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-"))
    .filter(Boolean)
    .join("/");
}

function safeFileName(originalName) {
  const parsed = path.parse(cleanString(originalName) || "file");
  const extension = parsed.ext.toLowerCase().replace(/[^a-z0-9.]/g, "") || "";
  const baseName = (parsed.name || "file")
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  return `${baseName || "file"}${extension}`;
}

export function isSpacesConfigured() {
  return Boolean(
    cleanString(process.env.DO_SPACES_BUCKET) &&
      cleanString(process.env.DO_SPACES_ACCESS_KEY_ID) &&
      cleanString(process.env.DO_SPACES_SECRET_KEY)
  );
}

function getSpacesClient() {
  const region = cleanString(process.env.DO_SPACES_REGION) || "sgp1";
  const endpoint =
    cleanString(process.env.DO_SPACES_ENDPOINT) || `https://${region}.digitaloceanspaces.com`;

  return new S3Client({
    region,
    endpoint,
    forcePathStyle: false,
    credentials: {
      accessKeyId: cleanString(process.env.DO_SPACES_ACCESS_KEY_ID),
      secretAccessKey: cleanString(process.env.DO_SPACES_SECRET_KEY),
    },
  });
}

export function getSpacesPublicUrl(key) {
  const region = cleanString(process.env.DO_SPACES_REGION) || "sgp1";
  const bucket = cleanString(process.env.DO_SPACES_BUCKET);
  const baseUrl =
    cleanString(process.env.DO_SPACES_CDN_URL) ||
    cleanString(process.env.DO_SPACES_PUBLIC_URL) ||
    `https://${bucket}.${region}.digitaloceanspaces.com`;

  return `${baseUrl.replace(/\/$/, "")}/${String(key || "").replace(/^\/+/, "")}`;
}

export async function uploadBufferToSpaces({
  buffer,
  originalName,
  mimeType = "application/octet-stream",
  folder = "uploads",
}) {
  if (!isSpacesConfigured()) {
    throw new Error("DigitalOcean Spaces is not configured");
  }

  if (!buffer?.length) {
    throw new Error("File is empty");
  }

  const now = new Date();
  const folderPath = cleanSegment(folder) || "uploads";
  const datePath = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
  ].join("/");
  const key = `${folderPath}/${datePath}/${crypto.randomUUID()}-${safeFileName(originalName)}`;

  await getSpacesClient().send(
    new PutObjectCommand({
      Bucket: cleanString(process.env.DO_SPACES_BUCKET),
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      ACL: "public-read",
    })
  );

  return {
    key,
    url: getSpacesPublicUrl(key),
    mimeType,
    size: buffer.length,
    storage: "digitalocean_spaces",
  };
}

export async function deleteFromSpaces(key) {
  if (!isSpacesConfigured() || !key) return;

  await getSpacesClient().send(
    new DeleteObjectCommand({
      Bucket: cleanString(process.env.DO_SPACES_BUCKET),
      Key: key,
    })
  );
}
