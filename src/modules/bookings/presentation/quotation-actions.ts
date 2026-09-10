"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/lib/supabase/server";
import { describeDbError } from "@/shared/lib/db-error";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import {
  quotationDetailsSchema,
  quotationStatusSchema,
  saveOfferSchema,
} from "@/modules/bookings/application/quotation.schemas";

/**
 * Quotation mutations (CLAUDE.md §13, Phase 4).
 *
 * Each of these re-checks that the caller is an active agent user with an
 * agency before touching anything (§12: RLS is the floor, not the only gate).
 * The agency id is taken from the caller's own profile and never from the
 * form, so a crafted request cannot write into another company's quotations —
 * and RLS refuses it a second time if it somehow did.
 */

export type Result =
  | { ok: true; messageKey: string; quotationId?: string }
  | { ok: false; errorKey: string; detail?: string };

const FORBIDDEN: Result = { ok: false, errorKey: "access.errors.forbidden" };

function revalidateQuotations(id?: string) {
  revalidatePath("/[locale]/agent/quotations", "page");
  if (id) revalidatePath("/[locale]/agent/quotations/[id]", "page");
}

/** The caller, only if they are an active agent belonging to an agency. */
async function requireAgent() {
  const user = await getCurrentUser();
  if (!user || user.status !== "active" || user.role.scope !== "agent" || !user.agency) {
    return null;
  }
  return user;
}

export async function saveOfferToQuotationAction(formData: FormData): Promise<Result> {
  const user = await requireAgent();
  if (!user) return FORBIDDEN;

  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = saveOfferSchema.safeParse({
    quotationId: raw.quotationId,
    checkIn: raw.checkIn,
    checkOut: raw.checkOut,
    adults: raw.adults,
    children: raw.children,
    rooms: raw.rooms,
    item: {
      supplierKey: raw.supplierKey,
      hotelRef: raw.hotelRef,
      roomRef: raw.roomRef,
      ratePlanRef: raw.ratePlanRef,
      offerRef: raw.offerRef,
      hotelNameAr: raw.hotelNameAr,
      hotelNameEn: raw.hotelNameEn,
      cityAr: raw.cityAr,
      cityEn: raw.cityEn,
      countryCode: raw.countryCode,
      starRating: raw.starRating,
      coverUrl: raw.coverUrl,
      roomNameAr: raw.roomNameAr,
      roomNameEn: raw.roomNameEn,
      planNameAr: raw.planNameAr,
      planNameEn: raw.planNameEn,
      mealPlanKey: raw.mealPlanKey,
      nights: raw.nights,
      rooms: raw.itemRooms,
      currencyCode: raw.currencyCode,
      sellPerNight: raw.sellPerNight,
      sellTotal: raw.sellTotal,
      isRefundable: raw.isRefundable,
    },
  });

  if (!parsed.success) {
    return {
      ok: false,
      errorKey: "quotations.errors.invalidInput",
      detail: parsed.error.issues[0]?.message,
    };
  }

  const d = parsed.data;
  const supabase = await createClient();
  let quotationId = d.quotationId || "";

  if (!quotationId) {
    // A reference is minted by the database, not composed here: two agents
    // saving at the same moment would otherwise pick the same number.
    const { data: reference, error: refError } = await supabase.rpc("next_quotation_ref");
    if (refError || !reference) {
      console.error("[quotations] next_quotation_ref failed:", describeDbError(refError));
      return { ok: false, errorKey: "quotations.errors.saveFailed" };
    }

    const { data: created, error: createError } = await supabase
      .from("quotations")
      .insert({
        reference,
        agency_id: user.agency!.id,
        created_by: user.id,
        check_in: d.checkIn,
        check_out: d.checkOut,
        adults: d.adults,
        children: d.children,
        rooms: d.rooms,
        currency_code: d.item.currencyCode,
      })
      .select("id")
      .single();

    if (createError || !created) {
      console.error("[quotations] create failed:", describeDbError(createError));
      return { ok: false, errorKey: "quotations.errors.saveFailed" };
    }
    quotationId = created.id;
  }

  const item = d.item;
  const { error: itemError } = await supabase.from("quotation_items").insert({
    quotation_id: quotationId,
    supplier_key: item.supplierKey,
    hotel_ref: item.hotelRef,
    room_ref: item.roomRef,
    rate_plan_ref: item.ratePlanRef,
    offer_ref: item.offerRef,
    hotel_name_ar: item.hotelNameAr,
    hotel_name_en: item.hotelNameEn,
    city_ar: item.cityAr ?? null,
    city_en: item.cityEn ?? null,
    country_code: item.countryCode ?? null,
    star_rating: item.starRating ?? null,
    cover_url: item.coverUrl ?? null,
    room_name_ar: item.roomNameAr,
    room_name_en: item.roomNameEn,
    plan_name_ar: item.planNameAr,
    plan_name_en: item.planNameEn,
    meal_plan_key: item.mealPlanKey,
    nights: item.nights,
    rooms: item.rooms,
    currency_code: item.currencyCode,
    sell_per_night: item.sellPerNight,
    sell_total: item.sellTotal,
    is_refundable: item.isRefundable,
  });

  if (itemError) {
    console.error("[quotations] item insert failed:", describeDbError(itemError));
    return { ok: false, errorKey: "quotations.errors.saveFailed" };
  }

  revalidateQuotations(quotationId);
  return { ok: true, messageKey: "quotations.added", quotationId };
}

export async function updateQuotationDetailsAction(
  quotationId: string,
  formData: FormData,
): Promise<Result> {
  const user = await requireAgent();
  if (!user) return FORBIDDEN;

  const parsed = quotationDetailsSchema.safeParse({
    title: formData.get("title"),
    guestName: formData.get("guestName"),
    validUntil: formData.get("validUntil"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { ok: false, errorKey: "quotations.errors.invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("quotations")
    .update({
      title: parsed.data.title ?? null,
      guest_name: parsed.data.guestName ?? null,
      valid_until: parsed.data.validUntil ?? null,
      notes: parsed.data.notes ?? null,
    })
    .eq("id", quotationId);

  if (error) {
    console.error("[quotations] update failed:", describeDbError(error));
    return { ok: false, errorKey: "quotations.errors.saveFailed" };
  }

  revalidateQuotations(quotationId);
  return { ok: true, messageKey: "quotations.updated" };
}

export async function setQuotationStatusAction(
  quotationId: string,
  status: string,
): Promise<Result> {
  const user = await requireAgent();
  if (!user) return FORBIDDEN;

  const parsed = quotationStatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, errorKey: "quotations.errors.invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("quotations")
    .update({ status: parsed.data })
    .eq("id", quotationId);

  if (error) return { ok: false, errorKey: "quotations.errors.saveFailed" };

  revalidateQuotations(quotationId);
  return { ok: true, messageKey: "quotations.statusChanged" };
}

export async function deleteQuotationAction(quotationId: string): Promise<Result> {
  const user = await requireAgent();
  if (!user) return FORBIDDEN;

  const supabase = await createClient();
  const { error } = await supabase.from("quotations").delete().eq("id", quotationId);
  if (error) return { ok: false, errorKey: "quotations.errors.saveFailed" };

  revalidateQuotations();
  return { ok: true, messageKey: "quotations.deleted" };
}

export async function removeQuotationItemAction(
  quotationId: string,
  itemId: string,
): Promise<Result> {
  const user = await requireAgent();
  if (!user) return FORBIDDEN;

  const supabase = await createClient();
  const { error } = await supabase.from("quotation_items").delete().eq("id", itemId);
  if (error) return { ok: false, errorKey: "quotations.errors.saveFailed" };

  revalidateQuotations(quotationId);
  return { ok: true, messageKey: "quotations.itemRemoved" };
}
