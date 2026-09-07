"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/lib/supabase/server";
import { describeDbError } from "@/shared/lib/db-error";
import { requirePermission } from "@/modules/auth/infrastructure/guard";
import {
  allocationBulkSchema,
  attachImageSchema,
  cancellationPolicySchema,
  cancellationRuleSchema,
  childPolicySchema,
  createHotelSchema,
  offerSchema,
  rateSchema,
  ratePlanSchema,
  roomTypeSchema,
  setAmenitiesSchema,
  setHotelStatusSchema,
  updateHotelSchema,
} from "@/modules/hotels/application/schemas";

/**
 * Hotel inventory actions (CLAUDE.md §13, Phase 3a).
 *
 * Each one: check the permission (§12), validate with the module's Zod schema
 * (§12), perform the write, revalidate. Errors come back as i18n keys.
 */

export type Result =
  { ok: true; messageKey: string; id?: string } | { ok: false; errorKey: string; detail?: string };

const FORBIDDEN: Result = { ok: false, errorKey: "access.errors.forbidden" };

/**
 * Maps a database refusal onto something a human can act on.
 *
 * The constraint names matter here: an overlapping rate is the single most
 * likely mistake when entering a season, and "conflicting key value violates
 * exclusion constraint" tells an admin nothing about what to change.
 */
function toResult(error: unknown, fallbackKey: string): Result {
  // Supabase rejects with a plain object, not an Error — see describeDbError.
  const message = describeDbError(error);

  if (message.includes("rates_no_overlapping_periods")) {
    return { ok: false, errorKey: "hotels.errors.rateOverlap" };
  }
  if (message.includes("child_policies_no_overlapping_ages")) {
    return { ok: false, errorKey: "hotels.errors.childAgeOverlap" };
  }
  if (
    message.includes("hotel_images_one_hotel_cover") ||
    message.includes("hotel_images_one_room_cover")
  ) {
    return { ok: false, errorKey: "hotels.errors.coverExists" };
  }
  if (message.includes("allocations_not_oversold")) {
    return { ok: false, errorKey: "hotels.errors.oversold" };
  }
  if (message.includes("room_types_occupancy_coherent")) {
    return { ok: false, errorKey: "hotels.validation.occupancyBelowStandard" };
  }
  if (/duplicate key|already exists/i.test(message)) {
    return { ok: false, errorKey: "hotels.errors.codeTaken" };
  }
  // Messages raised by our own triggers are written for humans.
  if (/belongs to|does not belong|permission/i.test(message)) {
    return { ok: false, errorKey: "access.errors.refused", detail: message };
  }
  return { ok: false, errorKey: fallbackKey };
}

function revalidateHotel(hotelId?: string) {
  revalidatePath("/[locale]/admin/hotels", "page");
  if (hotelId) revalidatePath("/[locale]/admin/hotels/[id]", "layout");
}

/**
 * Turns the inclusive last night an admin typed into the half-open range
 * Postgres stores. Jun 1-30 becomes [2026-06-01, 2026-07-01), so the next
 * season starting Jul 1 meets it exactly — no overlap, no unpriced night.
 */
function toHalfOpenRange(from: string, toInclusive: string): string {
  const end = new Date(`${toInclusive}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return `[${from},${end.toISOString().slice(0, 10)})`;
}

const emptyToNull = (v: string | undefined | null) => (v ? v : null);

// ------------------------------------------------------------------- hotels

export async function createHotelAction(formData: FormData): Promise<Result> {
  let actor;
  try {
    actor = await requirePermission("hotels.create");
  } catch {
    return FORBIDDEN;
  }

  const parsed = createHotelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errorKey: "access.errors.invalidInput", detail: firstIssue(parsed.error) };
  }

  const d = parsed.data;
  const supabase = await createClient();

  // The reference code is generated server-side from a sequence, so two admins
  // creating a hotel at the same moment cannot collide.
  const { data: seq } = await supabase.rpc("next_hotel_code");

  const { data, error } = await supabase
    .from("hotels")
    .insert({
      code: seq ?? `LLT-H-${Date.now().toString().slice(-6)}`,
      name_ar: d.nameAr,
      name_en: d.nameEn,
      description_ar: emptyToNull(d.descriptionAr),
      description_en: emptyToNull(d.descriptionEn),
      property_type: d.propertyType,
      star_rating: d.starRating ?? null,
      country_code: d.countryCode,
      city_ar: d.cityAr,
      city_en: d.cityEn,
      area_ar: emptyToNull(d.areaAr),
      area_en: emptyToNull(d.areaEn),
      address_ar: emptyToNull(d.addressAr),
      address_en: emptyToNull(d.addressEn),
      latitude: d.latitude ?? null,
      longitude: d.longitude ?? null,
      phone: emptyToNull(d.phone),
      email: emptyToNull(d.email),
      website: emptyToNull(d.website),
      check_in_time: d.checkInTime,
      check_out_time: d.checkOutTime,
      internal_notes: emptyToNull(d.internalNotes),
      status: "draft",
      created_by: actor.id,
    })
    .select("id")
    .single();

  if (error) return toResult(error, "hotels.errors.createFailed");

  revalidateHotel();
  return { ok: true, messageKey: "hotels.created", id: data.id };
}

export async function updateHotelAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("hotels.update");
  } catch {
    return FORBIDDEN;
  }

  const parsed = updateHotelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errorKey: "access.errors.invalidInput", detail: firstIssue(parsed.error) };
  }

  const d = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase
    .from("hotels")
    .update({
      name_ar: d.nameAr,
      name_en: d.nameEn,
      description_ar: emptyToNull(d.descriptionAr),
      description_en: emptyToNull(d.descriptionEn),
      property_type: d.propertyType,
      star_rating: d.starRating ?? null,
      country_code: d.countryCode,
      city_ar: d.cityAr,
      city_en: d.cityEn,
      area_ar: emptyToNull(d.areaAr),
      area_en: emptyToNull(d.areaEn),
      address_ar: emptyToNull(d.addressAr),
      address_en: emptyToNull(d.addressEn),
      latitude: d.latitude ?? null,
      longitude: d.longitude ?? null,
      phone: emptyToNull(d.phone),
      email: emptyToNull(d.email),
      website: emptyToNull(d.website),
      check_in_time: d.checkInTime,
      check_out_time: d.checkOutTime,
      internal_notes: emptyToNull(d.internalNotes),
    })
    .eq("id", d.hotelId);

  if (error) return toResult(error, "hotels.errors.updateFailed");

  revalidateHotel(d.hotelId);
  return { ok: true, messageKey: "hotels.updated" };
}

export async function setHotelStatusAction(hotelId: string, status: string): Promise<Result> {
  try {
    await requirePermission("hotels.publish");
  } catch {
    return FORBIDDEN;
  }

  const parsed = setHotelStatusSchema.safeParse({ hotelId, status });
  if (!parsed.success) return { ok: false, errorKey: "access.errors.invalidInput" };

  const supabase = await createClient();

  // Publishing a hotel with no sellable rooms would put an empty property in
  // front of agents. Refuse it rather than let it happen quietly.
  if (parsed.data.status === "active") {
    const { count } = await supabase
      .from("room_types")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", parsed.data.hotelId)
      .eq("status", "active");

    if ((count ?? 0) === 0) return { ok: false, errorKey: "hotels.errors.noRoomsToPublish" };
  }

  const { error } = await supabase
    .from("hotels")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.hotelId);

  if (error) return toResult(error, "hotels.errors.statusFailed");

  revalidateHotel(parsed.data.hotelId);
  return { ok: true, messageKey: `hotels.status.${parsed.data.status}Applied` };
}

export async function setAmenitiesAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("hotels.update");
  } catch {
    return FORBIDDEN;
  }

  const parsed = setAmenitiesSchema.safeParse({
    hotelId: formData.get("hotelId"),
    amenityKeys: formData.getAll("amenities").map(String),
  });
  if (!parsed.success) return { ok: false, errorKey: "access.errors.invalidInput" };

  const { hotelId, amenityKeys } = parsed.data;
  const supabase = await createClient();

  // Diffed rather than delete-all-then-insert, so an unchanged amenity is not
  // needlessly rewritten.
  const { data: current } = await supabase
    .from("hotel_amenities")
    .select("amenity_key")
    .eq("hotel_id", hotelId);

  const currentKeys = new Set((current ?? []).map((a) => a.amenity_key));
  const nextKeys = new Set(amenityKeys);
  const toAdd = [...nextKeys].filter((k) => !currentKeys.has(k));
  const toRemove = [...currentKeys].filter((k) => !nextKeys.has(k));

  if (toRemove.length) {
    const { error } = await supabase
      .from("hotel_amenities")
      .delete()
      .eq("hotel_id", hotelId)
      .in("amenity_key", toRemove);
    if (error) return toResult(error, "hotels.errors.updateFailed");
  }
  if (toAdd.length) {
    const { error } = await supabase
      .from("hotel_amenities")
      .insert(toAdd.map((k) => ({ hotel_id: hotelId, amenity_key: k })));
    if (error) return toResult(error, "hotels.errors.updateFailed");
  }

  revalidateHotel(hotelId);
  return { ok: true, messageKey: "hotels.amenitiesUpdated" };
}

// --------------------------------------------------------------- room types

export async function saveRoomTypeAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("hotels.rooms.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = roomTypeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errorKey: "access.errors.invalidInput", detail: firstIssue(parsed.error) };
  }

  const d = parsed.data;
  const supabase = await createClient();

  const payload = {
    hotel_id: d.hotelId,
    code: d.code,
    name_ar: d.nameAr,
    name_en: d.nameEn,
    description_ar: emptyToNull(d.descriptionAr),
    description_en: emptyToNull(d.descriptionEn),
    standard_occupancy: d.standardOccupancy,
    max_adults: d.maxAdults,
    max_children: d.maxChildren,
    max_occupancy: d.maxOccupancy,
    size_sqm: d.sizeSqm ?? null,
    bed_configuration_ar: emptyToNull(d.bedConfigurationAr),
    bed_configuration_en: emptyToNull(d.bedConfigurationEn),
    total_rooms: d.totalRooms,
  };

  const { error } = d.roomTypeId
    ? await supabase.from("room_types").update(payload).eq("id", d.roomTypeId)
    : await supabase.from("room_types").insert(payload);

  if (error) return toResult(error, "hotels.errors.roomSaveFailed");

  revalidateHotel(d.hotelId);
  return { ok: true, messageKey: d.roomTypeId ? "hotels.rooms.updated" : "hotels.rooms.created" };
}

export async function deleteRoomTypeAction(roomTypeId: string, hotelId: string): Promise<Result> {
  try {
    await requirePermission("hotels.rooms.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();

  // A room with contracted rates is referenced by pricing history; deactivate
  // it instead of destroying that.
  const { count } = await supabase
    .from("rates")
    .select("*", { count: "exact", head: true })
    .eq("room_type_id", roomTypeId);

  if ((count ?? 0) > 0) return { ok: false, errorKey: "hotels.errors.roomHasRates" };

  const { error } = await supabase.from("room_types").delete().eq("id", roomTypeId);
  if (error) return toResult(error, "hotels.errors.roomDeleteFailed");

  revalidateHotel(hotelId);
  return { ok: true, messageKey: "hotels.rooms.deleted" };
}

export async function setRoomStatusAction(
  roomTypeId: string,
  hotelId: string,
  status: "active" | "inactive",
): Promise<Result> {
  try {
    await requirePermission("hotels.rooms.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("room_types").update({ status }).eq("id", roomTypeId);
  if (error) return toResult(error, "hotels.errors.roomSaveFailed");

  revalidateHotel(hotelId);
  return { ok: true, messageKey: "hotels.rooms.updated" };
}

// --------------------------------------------------------------- rate plans

export async function saveRatePlanAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("hotels.rates.update");
  } catch {
    return FORBIDDEN;
  }

  const parsed = ratePlanSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errorKey: "access.errors.invalidInput", detail: firstIssue(parsed.error) };
  }

  const d = parsed.data;
  const supabase = await createClient();

  const payload = {
    hotel_id: d.hotelId,
    code: d.code,
    name_ar: d.nameAr,
    name_en: d.nameEn,
    meal_plan_key: d.mealPlanKey,
    currency_code: d.currencyCode,
    cancellation_policy_id: d.cancellationPolicyId || null,
    valid_from: d.validFrom,
    valid_to: d.validTo,
    status: d.status,
  };

  const { error } = d.ratePlanId
    ? await supabase.from("rate_plans").update(payload).eq("id", d.ratePlanId)
    : await supabase.from("rate_plans").insert(payload);

  if (error) return toResult(error, "hotels.errors.planSaveFailed");

  revalidateHotel(d.hotelId);
  return { ok: true, messageKey: d.ratePlanId ? "hotels.plans.updated" : "hotels.plans.created" };
}

// -------------------------------------------------------------------- rates

export async function saveRateAction(formData: FormData, hotelId: string): Promise<Result> {
  try {
    await requirePermission("hotels.rates.update");
  } catch {
    return FORBIDDEN;
  }

  const raw = Object.fromEntries(formData);
  const parsed = rateSchema.safeParse({ ...raw, isClosed: formData.get("isClosed") === "on" });
  if (!parsed.success) {
    return { ok: false, errorKey: "access.errors.invalidInput", detail: firstIssue(parsed.error) };
  }

  const d = parsed.data;
  const supabase = await createClient();

  const payload = {
    rate_plan_id: d.ratePlanId,
    room_type_id: d.roomTypeId,
    stay_period: toHalfOpenRange(d.dateFrom, d.dateTo),
    price_per_night: d.pricePerNight,
    extra_adult_price: d.extraAdultPrice,
    extra_child_price: d.extraChildPrice,
    single_occupancy_price: d.singleOccupancyPrice ?? null,
    min_stay: d.minStay,
    max_stay: d.maxStay ?? null,
    is_closed: d.isClosed,
  };

  const { error } = d.rateId
    ? await supabase.from("rates").update(payload).eq("id", d.rateId)
    : await supabase.from("rates").insert(payload);

  if (error) return toResult(error, "hotels.errors.rateSaveFailed");

  revalidateHotel(hotelId);
  return { ok: true, messageKey: d.rateId ? "hotels.rates.updated" : "hotels.rates.created" };
}

export async function deleteRateAction(rateId: string, hotelId: string): Promise<Result> {
  try {
    await requirePermission("hotels.rates.update");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("rates").delete().eq("id", rateId);
  if (error) return toResult(error, "hotels.errors.rateSaveFailed");

  revalidateHotel(hotelId);
  return { ok: true, messageKey: "hotels.rates.deleted" };
}

// ----------------------------------------------------------------- policies

export async function saveCancellationPolicyAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("hotels.rates.update");
  } catch {
    return FORBIDDEN;
  }

  const parsed = cancellationPolicySchema.safeParse({
    ...Object.fromEntries(formData),
    isNonRefundable: formData.get("isNonRefundable") === "on",
  });
  if (!parsed.success) return { ok: false, errorKey: "access.errors.invalidInput" };

  const d = parsed.data;
  const supabase = await createClient();

  const payload = {
    hotel_id: d.hotelId,
    name_ar: d.nameAr,
    name_en: d.nameEn,
    description_ar: emptyToNull(d.descriptionAr),
    description_en: emptyToNull(d.descriptionEn),
    is_non_refundable: d.isNonRefundable,
  };

  const { error } = d.policyId
    ? await supabase.from("cancellation_policies").update(payload).eq("id", d.policyId)
    : await supabase.from("cancellation_policies").insert(payload);

  if (error) return toResult(error, "hotels.errors.policySaveFailed");

  revalidateHotel(d.hotelId);
  return { ok: true, messageKey: "hotels.policies.saved" };
}

export async function addCancellationRuleAction(
  formData: FormData,
  hotelId: string,
): Promise<Result> {
  try {
    await requirePermission("hotels.rates.update");
  } catch {
    return FORBIDDEN;
  }

  const parsed = cancellationRuleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errorKey: "access.errors.invalidInput", detail: firstIssue(parsed.error) };
  }

  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("cancellation_rules").insert({
    policy_id: d.policyId,
    hours_before_checkin: d.hoursBeforeCheckin,
    charge_type: d.chargeType,
    charge_value: d.chargeValue,
  });

  if (error) {
    if (/duplicate key/i.test(error.message)) {
      return { ok: false, errorKey: "hotels.errors.ruleThresholdExists" };
    }
    return toResult(error, "hotels.errors.policySaveFailed");
  }

  revalidateHotel(hotelId);
  return { ok: true, messageKey: "hotels.policies.ruleAdded" };
}

export async function deleteCancellationRuleAction(
  ruleId: string,
  hotelId: string,
): Promise<Result> {
  try {
    await requirePermission("hotels.rates.update");
  } catch {
    return FORBIDDEN;
  }
  const supabase = await createClient();
  const { error } = await supabase.from("cancellation_rules").delete().eq("id", ruleId);
  if (error) return toResult(error, "hotels.errors.policySaveFailed");
  revalidateHotel(hotelId);
  return { ok: true, messageKey: "hotels.policies.ruleRemoved" };
}

export async function saveChildPolicyAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("hotels.rates.update");
  } catch {
    return FORBIDDEN;
  }

  const parsed = childPolicySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errorKey: "access.errors.invalidInput", detail: firstIssue(parsed.error) };
  }

  const d = parsed.data;
  const supabase = await createClient();

  const payload = {
    hotel_id: d.hotelId,
    age_from: d.ageFrom,
    age_to: d.ageTo,
    charge_type: d.chargeType,
    charge_value: d.chargeValue,
  };

  const { error } = d.policyId
    ? await supabase.from("child_policies").update(payload).eq("id", d.policyId)
    : await supabase.from("child_policies").insert(payload);

  if (error) return toResult(error, "hotels.errors.policySaveFailed");

  revalidateHotel(d.hotelId);
  return { ok: true, messageKey: "hotels.policies.saved" };
}

export async function deleteChildPolicyAction(policyId: string, hotelId: string): Promise<Result> {
  try {
    await requirePermission("hotels.rates.update");
  } catch {
    return FORBIDDEN;
  }
  const supabase = await createClient();
  const { error } = await supabase.from("child_policies").delete().eq("id", policyId);
  if (error) return toResult(error, "hotels.errors.policySaveFailed");
  revalidateHotel(hotelId);
  return { ok: true, messageKey: "hotels.policies.removed" };
}

// ------------------------------------------------------------------- offers

export async function saveOfferAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("hotels.offers.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = offerSchema.safeParse({
    ...Object.fromEntries(formData),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) {
    return { ok: false, errorKey: "access.errors.invalidInput", detail: firstIssue(parsed.error) };
  }

  const d = parsed.data;
  const supabase = await createClient();

  const payload = {
    hotel_id: d.hotelId,
    name_ar: d.nameAr,
    name_en: d.nameEn,
    description_ar: emptyToNull(d.descriptionAr),
    description_en: emptyToNull(d.descriptionEn),
    offer_type: d.offerType,
    discount_type: d.discountType,
    discount_value: d.discountValue,
    booking_window:
      d.bookingFrom && d.bookingTo ? toHalfOpenRange(d.bookingFrom, d.bookingTo) : null,
    stay_window: toHalfOpenRange(d.stayFrom, d.stayTo),
    min_nights: d.minNights ?? null,
    free_nights: d.freeNights ?? null,
    is_active: d.isActive,
  };

  const { error } = d.offerId
    ? await supabase.from("offers").update(payload).eq("id", d.offerId)
    : await supabase.from("offers").insert(payload);

  if (error) return toResult(error, "hotels.errors.offerSaveFailed");

  revalidateHotel(d.hotelId);
  return { ok: true, messageKey: d.offerId ? "hotels.offers.updated" : "hotels.offers.created" };
}

export async function deleteOfferAction(offerId: string, hotelId: string): Promise<Result> {
  try {
    await requirePermission("hotels.offers.manage");
  } catch {
    return FORBIDDEN;
  }
  const supabase = await createClient();
  const { error } = await supabase.from("offers").delete().eq("id", offerId);
  if (error) return toResult(error, "hotels.errors.offerSaveFailed");
  revalidateHotel(hotelId);
  return { ok: true, messageKey: "hotels.offers.deleted" };
}

// -------------------------------------------------------------- allocations

/**
 * Sets allotment across a date range in one operation.
 *
 * Contracts are negotiated as "20 rooms from June to September", not day by
 * day, so the bulk form is the primary way this data is entered. The rows are
 * still per-date underneath, which is what allows a single-night stop-sell.
 */
export async function setAllocationAction(formData: FormData, hotelId: string): Promise<Result> {
  try {
    await requirePermission("hotels.inventory.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = allocationBulkSchema.safeParse({
    ...Object.fromEntries(formData),
    stopSell: formData.get("stopSell") === "on",
    weekdays: formData.getAll("weekdays").map(Number),
  });
  if (!parsed.success) {
    return { ok: false, errorKey: "access.errors.invalidInput", detail: firstIssue(parsed.error) };
  }

  const d = parsed.data;
  const rows: {
    room_type_id: string;
    stay_date: string;
    allotment: number;
    stop_sell: boolean;
    min_stay: number | null;
  }[] = [];

  const cursor = new Date(`${d.dateFrom}T00:00:00Z`);
  const end = new Date(`${d.dateTo}T00:00:00Z`);

  while (cursor <= end) {
    // Empty weekday selection means every day; otherwise only the chosen ones,
    // which is how "weekend rates" are contracted.
    if (d.weekdays.length === 0 || d.weekdays.includes(cursor.getUTCDay())) {
      rows.push({
        room_type_id: d.roomTypeId,
        stay_date: cursor.toISOString().slice(0, 10),
        allotment: d.allotment,
        stop_sell: d.stopSell,
        min_stay: d.minStay ?? null,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  if (rows.length === 0) return { ok: false, errorKey: "hotels.errors.noDatesSelected" };

  const supabase = await createClient();

  // Upsert on (room_type_id, stay_date): re-running the same range replaces
  // the allotment rather than failing on the unique index.
  const { error } = await supabase
    .from("allocations")
    .upsert(rows, { onConflict: "room_type_id,stay_date" });

  if (error) return toResult(error, "hotels.errors.allocationFailed");

  revalidateHotel(hotelId);
  return { ok: true, messageKey: "hotels.allocation.saved" };
}

// -------------------------------------------------------------------- media

export async function attachImageAction(formData: FormData): Promise<Result> {
  let actor;
  try {
    actor = await requirePermission("hotels.media.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = attachImageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errorKey: "access.errors.invalidInput" };

  const d = parsed.data;
  const supabase = await createClient();

  // First image for the hotel becomes the cover, so a property is never
  // listed with no picture when one exists.
  const { count } = await supabase
    .from("hotel_images")
    .select("*", { count: "exact", head: true })
    .eq("hotel_id", d.hotelId)
    .is("room_type_id", null);

  const { error } = await supabase.from("hotel_images").insert({
    hotel_id: d.hotelId,
    room_type_id: d.roomTypeId || null,
    cloudinary_public_id: d.cloudinaryPublicId,
    secure_url: d.secureUrl,
    width: d.width ?? null,
    height: d.height ?? null,
    bytes: d.bytes ?? null,
    alt_ar: emptyToNull(d.altAr),
    alt_en: emptyToNull(d.altEn),
    is_cover: !d.roomTypeId && (count ?? 0) === 0,
    uploaded_by: actor.id,
  });

  if (error) return toResult(error, "hotels.errors.imageSaveFailed");

  revalidateHotel(d.hotelId);
  return { ok: true, messageKey: "hotels.media.added" };
}

export async function setCoverImageAction(imageId: string, hotelId: string): Promise<Result> {
  try {
    await requirePermission("hotels.media.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();

  // Clear the old cover first: the partial unique index allows only one, so
  // setting the new one before clearing the old would be rejected.
  const { error: clearError } = await supabase
    .from("hotel_images")
    .update({ is_cover: false })
    .eq("hotel_id", hotelId)
    .is("room_type_id", null)
    .eq("is_cover", true);

  if (clearError) return toResult(clearError, "hotels.errors.imageSaveFailed");

  const { error } = await supabase
    .from("hotel_images")
    .update({ is_cover: true })
    .eq("id", imageId);
  if (error) return toResult(error, "hotels.errors.imageSaveFailed");

  revalidateHotel(hotelId);
  return { ok: true, messageKey: "hotels.media.coverSet" };
}

export async function deleteImageAction(imageId: string, hotelId: string): Promise<Result> {
  try {
    await requirePermission("hotels.media.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("hotel_images").delete().eq("id", imageId);
  if (error) return toResult(error, "hotels.errors.imageSaveFailed");

  // NOTE: the Cloudinary asset itself is deliberately left in place. Deleting
  // it needs a signed destroy call, and an orphaned asset is cheap whereas a
  // deleted one that is still referenced by an old voucher is not. A sweep is
  // a Phase 10 item.
  revalidateHotel(hotelId);
  return { ok: true, messageKey: "hotels.media.removed" };
}

/** First validation message, so a rejected form says which field was wrong. */
function firstIssue(error: {
  issues: { message: string; path: PropertyKey[] }[];
}): string | undefined {
  const issue = error.issues[0];
  return issue ? `${issue.path.join(".")}: ${issue.message}` : undefined;
}
