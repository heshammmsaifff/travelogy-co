import "server-only";

import { createClient } from "@/shared/lib/supabase/server";
import type { Locale } from "@/shared/i18n/config";

/**
 * Driver operations reads (CLAUDE.md §13, Phase 8b).
 *
 * Two audiences and one rule that separates them: a DRIVER never sees money.
 * `my_driver_jobs()` does not return a price column at all — not the sell, not
 * the net, not even a currency — so this file cannot leak one by adding a
 * field to a select. Same structural approach as `booking_costs` (§15, 14.1).
 */

export type AssignmentStatus =
  | "assigned"
  | "en_route"
  | "arrived"
  | "picked_up"
  | "completed"
  | "no_show"
  | "cancelled";

export type Driver = {
  id: string;
  profileId: string;
  code: string;
  fullName: string;
  email: string;
  phone: string;
  licenceNumber: string | null;
  licenceExpiry: string | null;
  defaultVehicleTypeId: string | null;
  isActive: boolean;
  accountStatus: string;
  notes: string | null;
};

export type DriverJob = {
  assignmentId: string;
  status: AssignmentStatus;
  vehicleSeq: number;
  vehicles: number;
  jobDate: string;
  pickupTime: string | null;
  reference: string;
  fromName: string;
  toName: string;
  city: string | null;
  direction: "arrival" | "departure" | "point_to_point";
  vehicleName: string;
  passengers: number;
  flightNumber: string | null;
  pickupNotes: string | null;
  guestName: string;
  guestPhone: string | null;
  driverNotes: string | null;
};

export type DispatchRow = {
  transferItemId: string;
  bookingId: string;
  reference: string;
  agencyName: string | null;
  jobDate: string;
  pickupTime: string | null;
  fromName: string;
  toName: string;
  city: string | null;
  direction: "arrival" | "departure" | "point_to_point";
  vehicleName: string;
  passengers: number;
  flightNumber: string | null;
  vehicleSeq: number;
  assignmentId: string | null;
  assignmentStatus: AssignmentStatus | null;
  driverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
};

/**
 * The driver directory.
 *
 * The name and email live on `profiles`, which a `drivers.manage` holder can
 * now read for driver-scoped rows only (migration `20260908190300`). Before
 * that this join returned a row with no name in it — the permission existed
 * but could not do its job.
 */
export async function listDrivers(): Promise<Driver[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("drivers")
    .select(
      "id, profile_id, code, phone, licence_number, licence_expiry, default_vehicle_type_id, is_active, notes, profiles (full_name, email, status)",
    )
    .order("code")
    .limit(500);

  return (data ?? []).map((d) => {
    const profile = d.profiles as unknown as {
      full_name: string;
      email: string;
      status: string;
    } | null;
    return {
      id: d.id,
      profileId: d.profile_id,
      code: d.code,
      fullName: profile?.full_name ?? "",
      email: profile?.email ?? "",
      phone: d.phone,
      licenceNumber: d.licence_number,
      licenceExpiry: d.licence_expiry,
      defaultVehicleTypeId: d.default_vehicle_type_id,
      isActive: d.is_active,
      accountStatus: profile?.status ?? "unknown",
      notes: d.notes,
    };
  });
}

/** The signed-in driver's own jobs. Prices are not reachable from here. */
export async function getMyJobs(
  range: { from: string; to?: string },
  locale: Locale,
): Promise<DriverJob[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_driver_jobs", {
    p_from: range.from,
    p_to: range.to,
  });
  if (error || !data) return [];

  const ar = locale === "ar";
  return data.map((r) => ({
    assignmentId: r.assignment_id,
    status: r.status as AssignmentStatus,
    vehicleSeq: r.vehicle_seq,
    vehicles: r.vehicles,
    jobDate: r.job_date,
    pickupTime: r.pickup_time,
    reference: r.reference,
    fromName: ar ? r.from_name_ar : r.from_name_en,
    toName: ar ? r.to_name_ar : r.to_name_en,
    city: (ar ? r.city_ar : r.city_en) ?? null,
    direction: r.direction as DriverJob["direction"],
    vehicleName: ar ? r.vehicle_name_ar : r.vehicle_name_en,
    passengers: r.passengers,
    flightNumber: r.flight_number,
    pickupNotes: r.pickup_notes,
    guestName: r.guest_name,
    guestPhone: r.guest_phone,
    driverNotes: r.driver_notes,
  }));
}

/**
 * The dispatch board: one row per vehicle DUE OUT, whether or not anyone is
 * driving it. A board that listed only assignments could not show the gap,
 * and the gap is what a dispatcher is looking for.
 */
export async function getDispatchBoard(date: string, locale: Locale): Promise<DispatchRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dispatch_board", { p_date: date });
  if (error || !data) return [];

  const ar = locale === "ar";
  return data.map((r) => ({
    transferItemId: r.transfer_item_id,
    bookingId: r.booking_id,
    reference: r.reference,
    agencyName: r.agency_name,
    jobDate: r.job_date,
    pickupTime: r.pickup_time,
    fromName: ar ? r.from_name_ar : r.from_name_en,
    toName: ar ? r.to_name_ar : r.to_name_en,
    city: (ar ? r.city_ar : r.city_en) ?? null,
    direction: r.direction as DispatchRow["direction"],
    vehicleName: ar ? r.vehicle_name_ar : r.vehicle_name_en,
    passengers: r.passengers,
    flightNumber: r.flight_number,
    vehicleSeq: r.vehicle_seq,
    assignmentId: r.assignment_id,
    assignmentStatus: r.assignment_status as AssignmentStatus | null,
    driverId: r.driver_id,
    driverName: r.driver_name,
    driverPhone: r.driver_phone,
  }));
}

/**
 * Who is driving, for the agent who sold the transfer.
 *
 * Three fields, from a function — not a policy on `drivers`, because RLS
 * grants rows and a row here carries a licence number (§15, Phase 1).
 */
export async function getBookingDrivers(bookingId: string): Promise<
  { vehicleSeq: number; driverName: string; driverPhone: string; status: AssignmentStatus }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("booking_driver_contacts", {
    p_booking_id: bookingId,
  });
  if (error || !data) return [];
  return data.map((r) => ({
    vehicleSeq: r.vehicle_seq,
    driverName: r.driver_name,
    driverPhone: r.driver_phone,
    status: r.status as AssignmentStatus,
  }));
}
