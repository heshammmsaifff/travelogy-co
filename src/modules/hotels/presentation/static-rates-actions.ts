"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { can } from "@/modules/auth/domain/user";
import {
  MAX_STATIC_RATE_FILE_BYTES,
  MAX_STATIC_RATE_ROWS,
} from "@/modules/hotels/application/static-rate-row";
import {
  TooManyRowsError,
  commitStaticRatesImport,
  parseAndValidateStaticRates,
  type ParseResult,
} from "@/modules/hotels/application/import-static-rates.service";

export type UploadResult =
  | { ok: true; data: ParseResult }
  | { ok: false; errorKey: string; detail?: string };

export type CommitResult =
  | { ok: true; importedCount: number; errors: string[] }
  | { ok: false; errorKey: string; detail?: string };

const ALLOWED_EXTENSIONS = /\.(csv|xlsx|xls)$/i;

// Only the row number and the row's own values travel back from the browser.
// Everything derived from them — validity, ids — is recomputed on the server.
const submittedRowsSchema = z
  .array(z.object({ rowNumber: z.number().int().min(1), data: z.unknown() }))
  .min(1)
  .max(MAX_STATIC_RATE_ROWS);

export async function uploadAndPreviewStaticRatesAction(
  formData: FormData,
): Promise<UploadResult> {
  const user = await getCurrentUser();
  if (!can(user, "hotels.rates.update")) {
    return { ok: false, errorKey: "access.errors.forbidden" };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, errorKey: "staticRates.errors.noFileProvided" };
  }
  if (!ALLOWED_EXTENSIONS.test(file.name)) {
    return { ok: false, errorKey: "staticRates.errors.unsupportedFormat" };
  }
  // Checked before the bytes are read: the spreadsheet parser is the most
  // expensive thing an upload can make the server do.
  if (file.size > MAX_STATIC_RATE_FILE_BYTES) {
    return { ok: false, errorKey: "staticRates.errors.fileTooLarge" };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    return { ok: true, data: await parseAndValidateStaticRates(buffer) };
  } catch (err) {
    if (err instanceof TooManyRowsError) {
      return { ok: false, errorKey: "staticRates.errors.tooManyRows" };
    }
    console.error("[static-rates] parse failed:", err);
    return { ok: false, errorKey: "staticRates.errors.parseFailed" };
  }
}

export async function commitStaticRatesAction(rows: unknown): Promise<CommitResult> {
  const user = await getCurrentUser();
  if (!can(user, "hotels.rates.update")) {
    return { ok: false, errorKey: "access.errors.forbidden" };
  }

  const parsed = submittedRowsSchema.safeParse(rows);
  if (!parsed.success) {
    return { ok: false, errorKey: "staticRates.errors.noValidRows" };
  }

  try {
    const outcome = await commitStaticRatesImport(parsed.data, user!.id);
    revalidatePath("/[locale]/admin/hotels", "page");
    revalidatePath("/[locale]/admin/hotels/[id]/rates", "page");
    return { ok: true, importedCount: outcome.importedCount, errors: outcome.errors };
  } catch (err) {
    console.error("[static-rates] commit failed:", err);
    return { ok: false, errorKey: "staticRates.errors.commitFailed" };
  }
}
