import { createTwoFilesPatch } from "diff";
import type { ActionLog } from "./types";

export function buildEffectiveText(acts: ActionLog[]): { before: string | null; after: string | null } {
    let before: string | null = null;
    let after: string | null = null;

    for (const act of acts) {
        if (act.details?.before !== undefined && before === null) {
            before = act.details.before;
        }
        if (act.details?.after !== undefined) {
            after = act.details.after;
        }
    }

    return { before, after };
}

export function formatPatch(filePath: string, before: string | null, after: string | null): string {
    const patch = createTwoFilesPatch(
        filePath,
        filePath,
        before ?? "",
        after ?? "",
    );

    return patch;
}


export function composeBeforeAfter(sorted: ActionLog[]): {
    before: string;
    after: string;
} {
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    if (last.type === "file_delete") {
        return { before: last.details.before ?? "", after: "" };
    }
    const before = first.type === "file_create" ? "" : (first.details.before ?? "");
    const after = last.details.after ?? "";
    return { before, after };
}