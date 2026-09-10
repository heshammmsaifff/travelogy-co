"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  LuCalendarClock,
  LuCheck,
  LuMail,
  LuMessageSquare,
  LuPhone,
  LuPlus,
  LuStickyNote,
  LuTrash2,
  LuUsers,
} from "react-icons/lu";
import type { IconType } from "react-icons";
import type { Locale } from "@/shared/i18n/config";
import { useRouter } from "@/shared/i18n/navigation";
import { confirmAction } from "@/shared/lib/confirm";
import { formatDate } from "@/shared/lib/format";
import { toast } from "@/shared/lib/toast";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { ACTIVITY_KINDS, type ActivityKind } from "@/modules/crm/domain/crm";
import type { Activity, Task } from "@/modules/crm/infrastructure/crm.repository";
import {
  deleteActivityAction,
  deleteTaskAction,
  logActivityAction,
  saveTaskAction,
  setTaskStatusAction,
  type Result,
} from "./crm-actions";

const SELECT_CLASS =
  "h-9 w-full cursor-pointer rounded-control border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus";

const KIND_ICON: Record<ActivityKind, IconType> = {
  call: LuPhone,
  email: LuMail,
  meeting: LuUsers,
  whatsapp: LuMessageSquare,
  note: LuStickyNote,
};

function useShow() {
  const t = useTranslations();
  return (result: Result) => {
    if (result.ok) toast.success({ title: t(result.messageKey) });
    else toast.error({ title: t(result.errorKey), description: result.detail });
    return result.ok;
  };
}

/** The current datetime in the shape `datetime-local` expects. */
function nowLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/**
 * Contact history and follow-up, for a lead OR an agency
 * (CLAUDE.md §13, Phase 8d).
 *
 * One component for both because the underlying tables are one table each,
 * keyed by whichever subject applies. The alternative — a lead version and an
 * agency version — would be two copies of the same screen drifting apart, and
 * the "was this said before or after we signed them" question needs the two
 * timelines to look identical anyway.
 */
export function CrmPanel({
  subject,
  activities,
  tasks,
  assignees,
  locale,
}: {
  subject: { leadId: string } | { agencyId: string };
  activities: Activity[];
  tasks: Task[];
  assignees: { id: string; name: string }[];
  locale: Locale;
}) {
  const t = useTranslations("crm");
  const tCommon = useTranslations("common");
  const [loggingActivity, setLoggingActivity] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | "new" | null>(null);
  const [pending, startTransition] = useTransition();
  const show = useShow();
  const router = useRouter();

  const currentTask = editingTask === "new" ? null : editingTask;
  const ids = {
    leadId: "leadId" in subject ? subject.leadId : undefined,
    agencyId: "agencyId" in subject ? subject.agencyId : undefined,
  };
  const today = new Date().toISOString().slice(0, 10);

  const remove = (run: () => Promise<Result>) => async () => {
    const ok = await confirmAction({
      title: t("deleteConfirmTitle"),
      body: t("deleteConfirmBody"),
      confirmLabel: tCommon("delete"),
      cancelLabel: tCommon("cancel"),
      dir: locale === "ar" ? "rtl" : "ltr",
    });
    if (!ok) return;
    startTransition(async () => {
      if (show(await run())) router.refresh();
    });
  };

  const submit = (action: (fd: FormData) => Promise<Result>, close: () => void) => (fd: FormData) =>
    startTransition(async () => {
      if (show(await action(fd))) {
        close();
        router.refresh();
      }
    });

  const hiddenSubject = (
    <>
      <input type="hidden" name="leadId" value={ids.leadId ?? ""} />
      <input type="hidden" name="agencyId" value={ids.agencyId ?? ""} />
    </>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ------------------------------------------------------ follow-up */}
      <Card>
        <CardHeader
          title={t("tasks")}
          actions={
            <Button size="sm" variant="secondary" onClick={() => setEditingTask("new")}>
              <LuPlus aria-hidden />
              {t("addTask")}
            </Button>
          }
        />
        <CardBody className="p-0">
          {tasks.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-muted">{t("noTasks")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {tasks.map((task) => {
                const overdue = task.status === "open" && task.dueOn < today;
                return (
                  <li key={task.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                        <span className={task.status === "done" ? "line-through opacity-60" : ""}>
                          {task.title}
                        </span>
                        {overdue ? <Badge tone="danger">{t("overdue")}</Badge> : null}
                        {task.status !== "open" ? (
                          <Badge tone="neutral">{t(`taskStatus.${task.status}`)}</Badge>
                        ) : null}
                      </p>
                      <p className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                        <span className="flex items-center gap-1" dir="ltr">
                          <LuCalendarClock className="size-3" aria-hidden />
                          {formatDate(task.dueOn, locale)}
                        </span>
                        <span>{task.assigneeName ?? t("fields.unassigned")}</span>
                      </p>
                      {task.notes ? <p className="text-xs text-ink-subtle">{task.notes}</p> : null}
                    </div>

                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const next = task.status === "done" ? "open" : "done";
                            if (show(await setTaskStatusAction(task.id, next, ids))) router.refresh();
                          })
                        }
                      >
                        <LuCheck aria-hidden />
                        {task.status === "done" ? t("reopen") : t("markDone")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={pending}
                        onClick={remove(() => deleteTaskAction(task.id, ids))}
                      >
                        <LuTrash2 aria-hidden />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ------------------------------------------------ contact history */}
      <Card>
        <CardHeader
          title={t("timeline")}
          actions={
            <Button size="sm" variant="secondary" onClick={() => setLoggingActivity(true)}>
              <LuPlus aria-hidden />
              {t("logActivity")}
            </Button>
          }
        />
        <CardBody className="p-0">
          {activities.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-muted">{t("noActivities")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {activities.map((a) => {
                const Icon = KIND_ICON[a.kind];
                return (
                  <li key={a.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="flex min-w-0 gap-3">
                      <Icon className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium text-ink">{a.subject}</p>
                        {a.body ? <p className="text-xs text-ink-muted">{a.body}</p> : null}
                        <p className="flex flex-wrap items-center gap-2 text-2xs text-ink-subtle">
                          <span>{t(`kind.${a.kind}`)}</span>
                          <span dir="ltr">{formatDate(a.occurredAt, locale)}</span>
                          {a.authorName ? <span>{a.authorName}</span> : null}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={pending}
                      onClick={remove(() => deleteActivityAction(a.id, ids))}
                    >
                      <LuTrash2 aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* -------------------------------------------------- activity form */}
      <Modal
        open={loggingActivity}
        onOpenChange={setLoggingActivity}
        title={t("logActivity")}
        closeLabel={tCommon("cancel")}
        size="md"
      >
        <form
          action={submit(logActivityAction, () => setLoggingActivity(false))}
          className="space-y-4"
        >
          {hiddenSubject}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t("fields.kindLabel")}</span>
              <select name="kind" defaultValue="call" className={SELECT_CLASS}>
                {ACTIVITY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`kind.${k}`)}
                  </option>
                ))}
              </select>
            </label>
            {/* When it HAPPENED, defaulting to now but editable — a call
                logged the next morning belongs on the day of the call. */}
            <Input
              name="occurredAt"
              type="datetime-local"
              dir="ltr"
              defaultValue={nowLocal()}
              label={t("fields.occurredAt")}
            />
          </div>

          <Input name="subject" required label={t("fields.subject")} />

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">{t("fields.body")}</span>
            <textarea
              name="body"
              rows={4}
              className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
            />
          </label>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setLoggingActivity(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" loading={pending}>
              {tCommon("save")}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------ task form */}
      <Modal
        open={editingTask !== null}
        onOpenChange={(open) => !open && setEditingTask(null)}
        title={currentTask ? tCommon("edit") : t("addTask")}
        closeLabel={tCommon("cancel")}
        size="md"
      >
        <form
          key={currentTask?.id ?? "new-task"}
          action={submit(saveTaskAction, () => setEditingTask(null))}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={currentTask?.id ?? ""} />
          {hiddenSubject}

          <Input
            name="title"
            required
            defaultValue={currentTask?.title ?? ""}
            label={t("fields.title")}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              name="dueOn"
              type="date"
              required
              dir="ltr"
              defaultValue={currentTask?.dueOn ?? today}
              label={t("fields.dueOn")}
            />
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t("fields.assignedTo")}</span>
              <select
                name="assignedTo"
                defaultValue={currentTask?.assignedTo ?? ""}
                className={SELECT_CLASS}
              >
                <option value="">{t("fields.unassigned")}</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">{t("fields.notes")}</span>
            <textarea
              name="notes"
              rows={3}
              defaultValue={currentTask?.notes ?? ""}
              className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
            />
          </label>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditingTask(null)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" loading={pending}>
              {tCommon("save")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
