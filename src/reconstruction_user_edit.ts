// Extraction of a user's out-of-band file edit (s15-user-edit-then-conv-rewind). A user editing a
// file on disk leaves no tool_use; the harness records it as an `edited_text_file` attachment whose
// `snippet` is the full post-edit content in `cat -n` form (`<lineNo>\t<line>`). This leaf module
// turns that attachment into a UserEditEvent. Used by reconstruction_extract.ts. Design: the engine
// file (reconstruction_engine.ts) + plans/s15/s15-reconstruction-plan.md.

import type { TranscriptRecord } from "./structures/envelope.ts";
import { getAttachmentEntry } from "./structures/session-meta.ts";
import { AttachmentPayloadType, EventKind } from "./structures/vocabulary.ts";
import { Path } from "./structures/domain.ts";
import type { UserEditEvent } from "./reconstruction_engine.ts";

// Strip the `<lineNo>\t` prefix every line of an `edited_text_file` snippet carries, recovering the
// file's actual post-edit text. `1\t# user edit\n2\tdef hello():` -> `# user edit\ndef hello():`.
function stripLineNumberPrefixes(snippet: string): string {
    return snippet
        .split("\n")
        .map((line) => line.replace(/^\d+\t/, ""))
        .join("\n");
}

// Turn an `edited_text_file` attachment record into a UserEditEvent, or undefined when the record is
// not such an attachment. The event's changeId is the attachment record's own uuid (a user edit has
// no tool_use id); its content is the snippet with line-number prefixes stripped.
export function userEditEventFrom(record: TranscriptRecord): UserEditEvent | undefined {
    const entry = getAttachmentEntry(record);
    if (entry === undefined) {
        return undefined;
    }
    if (entry.attachment.type !== AttachmentPayloadType.edited_text_file) {
        return undefined;
    }
    const filename = entry.attachment.filename as string;
    const snippet = entry.attachment.snippet as string;
    return {
        kind: EventKind.userEdit,
        changeId: entry.uuid,
        target: new Path(filename),
        content: stripLineNumberPrefixes(snippet),
        timestamp: entry.timestamp,
    };
}
