"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { can } from "@/modules/auth/domain/user";
import {
  parseAndValidateStaticRates,
  commitStaticRatesImport,
  type ParseResult,
  type RowValidationResult,
} from "@/modules/hotels/application/import-static-rates.service";

export type UploadResult =
  | { ok: true; data: ParseResult }
  | { ok: false; errorKey: string; detail?: string };

export type CommitResult =
  | { ok: true; importedCount: number; errors: string[] }
  | { ok: false; errorKey: string; detail?: string };

export async function uploadAndPreviewStaticRatesAction(
  formData: FormData,
): Promise<UploadResult> {
  const user = await getCurrentUser();
  if (!can(user, "hotels.rates.update")) {
    return { ok: false, errorKey: "access.errors.forbidden" };
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { ok: false, errorKey: "staticRates.errors.noFileProvided" };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const result = await parseAndValidateStaticRates(buffer);
    return { ok: true, data: result };
  } catch (err) {
    return {
      ok: false,
      errorKey: "staticRates.errors.parseFailed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function commitStaticRatesAction(
  validRows: RowValidationResult[],
): Promise<CommitResult> {
  const user = await getCurrentUser();
  if (!can(user, "hotels.rates.update")) {
    return { ok: false, errorKey: "access.errors.forbidden" };
  }

  if (validRows.length === 0) {
    return { ok: false, errorKey: "staticRates.errors.noValidRows" };
  }

  try {
    const outcome = await commitStaticRatesImport(validRows, user!.id);
    revalidatePath("/[locale]/admin/hotels", "page");
    return { ok: true, importedCount: outcome.importedCount, errors: outcome.errors };
  } catch (err) {
    return {
      ok: false,
      errorKey: "staticRates.errors.commitFailed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
