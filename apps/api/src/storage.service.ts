import { Injectable } from "@nestjs/common";
import { createObjectStorage, type ObjectStorage } from "@video-translate/storage";
import { runtimeConfig } from "./runtime.js";

@Injectable()
export class StorageService {
  private readonly storage: ObjectStorage = createObjectStorage(runtimeConfig.s3);

  presign(key: string, contentType: string, downloadFileName?: string): Promise<string> {
    return this.storage.presignGet({
      key,
      contentType,
      expiresInSeconds: runtimeConfig.presignTtlSeconds,
      downloadFileName,
    });
  }

  openObject(key: string, range?: string) {
    return this.storage.openObject({ key, range });
  }
}
