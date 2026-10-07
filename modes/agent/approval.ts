import { select, isCancel } from "@clack/prompts";
import chalk from "chalk";
import type { ActionTracker } from "./action.tracker";
import type { ActionLog } from "./types";
import { buildEffectiveText, formatPatch } from "./diff-view";

interface ReviewGroup {
    label: string;
    actionIds: string[];
    patch: string | null;
}

function groupPending(pending: ActionLog[]): ReviewGroup[] {
    const byPath = new Map<string, ActionLog[]>();
    const shells: ActionLog[] = [];

    for (const act of pending) {
        if (act.type === 'tool_execute' && act.details?.command) {
            shells.push(act);
        } else if (act.path) {
            const list = byPath.get(act.path) || [];
            list.push(act);
            byPath.set(act.path, list);
        }
    }

    const groups: ReviewGroup[] = [];

    const pathEntries = [...byPath.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [p, acts] of pathEntries) {
        const sorted = acts.sort((x, y) => x.timestamp.getTime() - y.timestamp.getTime());
        const ids = sorted.map((x) => x.id);

        if (sorted.every((x) => x.type === 'folder_create')) {
            groups.push({ label: `Create folder: ${p}`, actionIds: ids, patch: null });
            continue;
        }

        const { before, after } = buildEffectiveText(sorted);
        const patch = formatPatch(p, before, after);
        const kinds = [...new Set(sorted.map((x) => x.type))].join(', ');
        groups.push({ label: `${p} (${kinds})`, actionIds: ids, patch });
    }

    for (const s of shells) {
        groups.push({
            label: `Shell: ${s.details?.command || s.id}`,
            actionIds: [s.id],
            patch: s.details?.command || null
        });
    }

    return groups;
}

export async function runApprovalFlow(tracker: ActionTracker): Promise<boolean> {
  const pending = tracker.getPendingMutations();

  if (pending.length === 0) {
    console.log(chalk.dim('\n No staged file, folder, or shell changes to review.\n'));
    return false;
  }

  const choice = await select({
    message: "Apply staged changes ?",
    options: [
        {
            value: "all",
            label: chalk.green("Yes, Apply all changes")
        },
        {
            value: "select",
            label: chalk.blue("selectively apply changes")
        },
        {
            value: "cancel",
            label: chalk.red("No, Cancel")
        }
    ]
  });

  if (isCancel(choice)) {
    for (const a of pending) tracker.updateStatus(a.id, "rejected", false);
    return false;
  }

  if (choice === "all") {
    for (const a of pending) tracker.updateStatus(a.id, "approved", false);
    return true;
  }

  if (choice === "cancel") {
    for (const a of pending) tracker.updateStatus(a.id, "rejected", false);
    return false;
  }

  if (choice === "select") {
    return true;
  }

  return false;
}