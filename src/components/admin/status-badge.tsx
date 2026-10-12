import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  REVIEW: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  DRAFT: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  REJECTED: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
  RETIRED: "bg-muted text-muted-foreground",
  QUEUED: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  RUNNING: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  DONE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  FAILED: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", STATUS_STYLE[status])}>{status}</span>;
}
