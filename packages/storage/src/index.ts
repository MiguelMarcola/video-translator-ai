import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";

export type ObjectStorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export type ObjectStorage = {
  putObject(input: { key: string; body: Buffer; contentType: string }): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  presignGet(input: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
    downloadFileName?: string;
  }): Promise<string>;
  deletePrefix(prefix: string): Promise<void>;
  openObject(input: { key: string; range?: string }): Promise<{
    body: Readable;
    contentLength?: number;
    contentRange?: string;
    statusCode: number;
  }>;
};

function createS3Client(config: ObjectStorageConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export function createObjectStorage(config: ObjectStorageConfig): ObjectStorage {
  const client = createS3Client(config);
  return {
    async putObject(input) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
        }),
      );
    },
    async getObject(key: string): Promise<Buffer> {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    );
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error("Objeto vazio");
    }
    return Buffer.from(bytes);
  },
  async presignGet(input) {
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: input.key,
          ResponseContentType: input.contentType,
          ResponseContentDisposition: input.downloadFileName
            ? `attachment; filename="${input.downloadFileName.replaceAll('"', "")}"`
            : undefined,
        }),
        { expiresIn: input.expiresInSeconds },
      );
    },
    async deletePrefix(prefix) {
      let continuationToken: string | undefined;
      do {
        const listed = await client.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );
        const objects = (listed.Contents ?? []).flatMap((item) => (item.Key ? [{ Key: item.Key }] : []));
        if (objects.length > 0) {
          await client.send(
            new DeleteObjectsCommand({
              Bucket: config.bucket,
              Delete: { Objects: objects },
            }),
          );
        }
        continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
      } while (continuationToken);
    },
    async openObject(input) {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: input.key,
          Range: input.range,
        }),
      );
      if (!response.Body || !(response.Body instanceof Readable)) {
        throw new Error("Resposta de objeto sem fluxo");
      }
      return {
        body: response.Body,
        contentLength: response.ContentLength,
        contentRange: response.ContentRange,
        statusCode: response.$metadata.httpStatusCode ?? (input.range ? 206 : 200),
      };
    },
  };
}

export async function ensurePrivateBucket(config: ObjectStorageConfig, allowedOrigin: string): Promise<void> {
  const client = createS3Client(config);
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
  } catch {
    try {
      await client.send(new CreateBucketCommand({ Bucket: config.bucket }));
    } catch (error) {
      const code = storageErrorCode(error);
      if (code !== "BucketAlreadyOwnedByYou" && code !== "BucketAlreadyExists") {
        throw error;
      }
    }
  }
  try {
    await client.send(
      new PutBucketCorsCommand({
        Bucket: config.bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: [allowedOrigin],
              AllowedMethods: ["GET", "HEAD"],
              AllowedHeaders: ["*"],
              ExposeHeaders: ["Accept-Ranges", "Content-Range", "Content-Length", "Content-Type", "ETag"],
            },
          ],
        },
      }),
    );
  } catch (error) {
    if (storageErrorCode(error) !== "NotImplemented") {
      throw error;
    }
  }
}

function storageErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "Code" in error && typeof error.Code === "string") {
    return error.Code;
  }
  return "";
}

export function objectKey(videoId: string, version: number, kind: string, fileName: string): string {
  return `videos/${videoId}/v${version}/${kind}/${fileName}`;
}
