import { assertAuthConfiguration } from "@video-translate/contracts";
import { findRepoRoot, readRuntimeConfig } from "@video-translate/contracts/runtime";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
export const runtimeConfig = readRuntimeConfig(process.env, repoRoot);
export const authConfiguration = assertAuthConfiguration({
  nodeEnv: runtimeConfig.nodeEnv,
  authMode: runtimeConfig.authMode,
  allowDevIdentity: runtimeConfig.allowDevIdentity,
});
