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