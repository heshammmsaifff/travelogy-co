"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LuPencil, LuPlus, LuPower, LuTriangleAlert } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { useRouter } from "@/shared/i18n/navigation";
import { confirmAction } from "@/shared/lib/confirm";
import { formatDate } from "@/shared/lib/format";
import { toast } from "@/shared/lib/toast";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardBody } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { PhoneInput } from "@/shared/ui/phone-input";
import { Modal } from "@/shared/ui/modal";
import type { Driver } from "@/modules/driver-ops/infrastructure/drivers.repository";
import {
  createDriverAction,
  setDriverActiveAction,
  updateDriverAction,
  type Result,
} from "./driver-actions";

const SELECT_CLASS =
  "h-9 w-full cursor-pointer rounded-control border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus";

/** Days before expiry at which a licence is worth flagging on the list. */
const LICENCE_WARNING_DAYS = 30;

function useShow() {
  const t = useTranslations();
  return (result: Result) => {
    if (result.ok) toast.success({ title: t(result.messageKey) });
    else toast.error({ title: t(result.errorKey), description: result.detail });
    return result.ok;
  };
}

/**
 * The driver directory (CLAUDE.md §13, Phase 8b).
 *
 * A licence that expired yesterday is the one thing on this screen that costs
 * money if nobody notices, so it is a badge rather than a date someone has to
 * compare in their head.
 */
export function DriverManager({
  drivers,
  vehicleTypes,
  locale,
}: {
  drivers: Driver[];
  vehicleTypes: { id: string; name: string }[];
  locale: Locale;
}) {
  const t = useTranslations("drivers");
  const tCommon = useTranslations("common");
  const [editing, setEditing] = useState<Driver | "new" | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const show = useShow();
  const router = useRouter();

  const current = editing === "new" ? null : editing;
  const today = new Date().toISOString().slice(0, 10);

  /** "" / "soon" / "expired" for a licence date. */
  const licenceState = (expiry: string | null) => {
    if (!expiry) return "";
    if (expiry < today) return "expired";
    const limit = new Date(`${today}T00:00:00Z`);
    limit.setUTCDate(limit.getUTCDate() + LICENCE_WARNING_DAYS);
    return expiry <= limit.toISOString().slice(0, 10) ? "soon" : "";
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")}>
          <LuPlus aria-hidden />
          {t("create")}
        </Button>
      </div>

      {drivers.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-ink-muted">{t("empty")}</CardBody>
        </Card>
      ) : (
        <ul className="space-y-2">
          {drivers.map((d) => {
            const licence = licenceState(d.licenceExpiry);
            return (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-ink-subtle" dir="ltr">
                      {d.code}
                    </span>
                    <span className="font-medium text-ink">{d.fullName}</span>
                    {!d.isActive ? <Badge tone="neutral">{t("inactive")}</Badge> : null}
                    {licence === "expired" ? (
                      <Badge tone="danger">
                        <LuTriangleAlert className="size-3" aria-hidden />
                        {t("licenceExpired")}
                      </Badge>
                    ) : licence === "soon" ? (
                      <Badge tone="warning">{t("licenceExpiringSoon")}</Badge>
                    ) : null}
                  </p>
                  <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
                    <span dir="ltr">{d.phone}</span>
                    <span dir="ltr">{d.email}</span>
                    {d.licenceExpiry ? (
                      <span dir="ltr">
                        {t("fields.licenceExpiry")}: {formatDate(d.licenceExpiry, locale)}
                      </span>
                    ) : null}
                    {d.defaultVehicleTypeId ? (
                      <span>
                        {vehicleTypes.find((v) => v.id === d.defaultVehicleTypeId)?.name ?? "—"}
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(d)}>
                    <LuPencil aria-hidden />
                    {tCommon("edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={pending}
                    onClick={async () => {
                      if (d.isActive) {
                        const ok = await confirmAction({
                          title: t("deactivateConfirmTitle"),
                          body: t("deactivateConfirmBody"),
                          confirmLabel: t("deactivate"),
                          cancelLabel: tCommon("cancel"),
                          dir: locale === "ar" ? "rtl" : "ltr",
                        });
                        if (!ok) return;
                      }
                      startTransition(async () => {
                        if (show(await setDriverActiveAction(d.id, !d.isActive))) router.refresh();
                      });
                    }}
                  >
                    <LuPower aria-hidden />
                    {d.isActive ? t("deactivate") : t("activate")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="rounded-control bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
        {t("noPrices")}
      </p>

      <Modal
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={current ? tCommon("edit") : t("create")}
        closeLabel={tCommon("cancel")}
        size="lg"
      >
        <form
          key={current?.id ?? "new-driver"}
          action={(fd) =>
            startTransition(async () => {
              const result = current ? await updateDriverAction(fd) : await createDriverAction(fd);
              if (show(result)) {
                setEditing(null);
                // Shown once and never stored anywhere readable, exactly as a
                // new staff account's password is (§15, 3.4).
                if (result.ok && result.secret) setSecret(result.secret);
                router.refresh();
              }
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="id" value={current?.id ?? ""} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              name="fullName"
              required
              defaultValue={current?.fullName ?? ""}
              label={t("fields.fullName")}
            />
            <Input
              name="code"
              required
              dir="ltr"
              defaultValue={current?.code ?? ""}
              label={t("fields.code")}
            />

            {/* The email IS the sign-in identity, so it is set once and then
                owned by Supabase Auth (§12) — never edited from this form. */}
            {current ? null : (
              <Input name="email" type="email" required dir="ltr" label={t("fields.email")} />
            )}
            <PhoneInput
              name="phone"
              required
              defaultValue={current?.phone ?? ""}
              label={t("fields.phone")}
            />

            <Input
              name="licenceNumber"
              dir="ltr"
              defaultValue={current?.licenceNumber ?? ""}
              label={t("fields.licenceNumber")}
            />
            <Input
              name="licenceExpiry"
              type="date"
              dir="ltr"
              defaultValue={current?.licenceExpiry ?? ""}
              label={t("fields.licenceExpiry")}
            />

            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium text-ink">{t("fields.defaultVehicle")}</span>
              <select
                name="defaultVehicleTypeId"
                defaultValue={current?.defaultVehicleTypeId ?? ""}
                className={SELECT_CLASS}
              >
                <option value="">—</option>
                {vehicleTypes.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">{t("fields.notes")}</span>
            <textarea
              name="notes"
              rows={2}
              defaultValue={current?.notes ?? ""}
              className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
            />
          </label>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(null)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" loading={pending}>
              {tCommon("save")}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={secret !== null}
        onOpenChange={(open) => !open && setSecret(null)}
        title={t("createdTitle")}
        description={t("createdBody")}
        closeLabel={tCommon("cancel")}
        size="sm"
      >
        <div className="space-y-4">
          <p
            className="select-all break-all rounded-control bg-surface-sunken px-3 py-3 text-center font-mono text-sm text-ink"
            dir="ltr"
          >
            {secret}
          </p>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setSecret(null)}>
              {tCommon("confirm")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
