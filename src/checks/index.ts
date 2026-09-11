import type { CheckPack } from "../types.js";
import { crudPack } from "./crud.js";
import { paginationPack } from "./pagination.js";
import { rateLimitPack } from "./rate-limits.js";
import { binaryPack } from "./binary.js";
import { authPack } from "./auth.js";
import { validateOpPack } from "./validate-op.js";
import { referenceIntegrityPack } from "./reference-integrity.js";
import { operationOutcomePack } from "./operation-outcome.js";
import { capabilityPack } from "./capability.js";

export const allPacks: CheckPack[] = [
  crudPack,
  paginationPack,
  rateLimitPack,
  binaryPack,
  authPack,
  validateOpPack,
  referenceIntegrityPack,
  operationOutcomePack,
  capabilityPack,
];

export function resolvePacks(names: string[]): CheckPack[] {
  if (names.includes("all")) return allPacks;
  return allPacks.filter((p) => names.includes(p.name));
}
