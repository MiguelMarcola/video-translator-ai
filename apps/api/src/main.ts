import "reflect-metadata";
import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findRepoRoot } from "@video-translate/contracts/runtime";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(currentDirectory);
loadDotenv({ path: resolve(repoRoot, ".env") });

const { bootstrap } = await import("./bootstrap.js");
await bootstrap();
