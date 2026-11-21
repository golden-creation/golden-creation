import crypto from "crypto";
import path from "path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

export function safeFileName(originalName) {
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

export function createStorageKey(originalName, folder = "uploads") {
  const now = new Date();
  const folderPath = cleanSegment(folder) || "uploads";
  const datePath = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
  ].join("/");
  return `${folderPath}/${datePath}/${crypto.randomUUID()}-${safeFileName(originalName)}`;
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

  const key = createStorageKey(originalName, folder);

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

export async function uploadPrivateBufferToSpaces({
  buffer,
  originalName,
  mimeType = "application/octet-stream",
  folder = "private",
}) {
  if (!isSpacesConfigured()) {
    throw new Error("DigitalOcean Spaces is not configured");
  }

  if (!buffer?.length) {
    throw new Error("File is empty");
  }

  const key = createStorageKey(originalName, folder);

  await getSpacesClient().send(
    new PutObjectCommand({
      Bucket: cleanString(process.env.DO_SPACES_BUCKET),
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      ContentDisposition: `inline; filename="${safeFileName(originalName)}"`,
    })
  );

  return {
    key,
    mimeType,
    size: buffer.length,
    storage: "digitalocean_spaces_private",
  };
}

export async function getPrivateObjectFromSpaces(key) {
  if (!isSpacesConfigured() || !key) {
    throw new Error("Private media is unavailable");
  }

  return getSpacesClient().send(
    new GetObjectCommand({
      Bucket: cleanString(process.env.DO_SPACES_BUCKET),
      Key: key,
    })
  );
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

export async function createPublicUploadUrl({
  originalName,
  mimeType,
  folder = "videos",
  expiresIn = 900,
}) {
  if (!isSpacesConfigured()) {
    throw new Error("DigitalOcean Spaces is not configured");
  }
  const key = createStorageKey(originalName, folder);
  const command = new PutObjectCommand({
    Bucket: cleanString(process.env.DO_SPACES_BUCKET),
    Key: key,
    ContentType: mimeType,
    ACL: "public-read",
  });
  const uploadUrl = await getSignedUrl(getSpacesClient(), command, { expiresIn });
  return {
    key,
    uploadUrl,
    url: getSpacesPublicUrl(key),
    expiresIn,
    headers: {
      "Content-Type": mimeType,
      "x-amz-acl": "public-read",
    },
  };
}

export async function headSpacesObject(key) {
  if (!isSpacesConfigured() || !key) {
    throw new Error("DigitalOcean Spaces is not configured");
  }
  return getSpacesClient().send(
    new HeadObjectCommand({
      Bucket: cleanString(process.env.DO_SPACES_BUCKET),
      Key: key,
    })
  );
}

export function storageKeyFromUrl(value) {
  const input = cleanString(value);
  if (!input) return "";
  if (!/^https?:\/\//i.test(input)) return input.replace(/^\/+/, "");
  try {
    const parsed = new URL(input);
    const configuredHosts = [
      cleanString(process.env.DO_SPACES_CDN_URL),
      cleanString(process.env.DO_SPACES_PUBLIC_URL),
      cleanString(process.env.DO_SPACES_ENDPOINT),
      getSpacesPublicUrl("").replace(/\/$/, ""),
    ]
      .filter(Boolean)
      .map((url) => new URL(url).hostname.toLowerCase());
    if (!configuredHosts.includes(parsed.hostname.toLowerCase())) return "";
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  } catch {
    return "";
  }
}
