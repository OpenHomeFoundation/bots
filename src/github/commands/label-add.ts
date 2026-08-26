import type { Command } from "../engine/types.js";
import { UsageError } from "../engine/usage-error.js";

export function addLabel(manageable: readonly string[]): Command {
  const valid = new Set(manageable);
  return {
    name: "add-label",
    description: `Adds a label (${manageable.join(", ")}) to the issue or pull request.`,
    args: "required",
    example: `add-label "${manageable[0]}"`,
    permission: "code_owner",

    async handle(context) {
      if (context.args.length !== 1) throw new UsageError('usage: add-label "<label>"');
      const label = context.args[0];
      if (!valid.has(label)) {
        throw new UsageError(`Label "${label}" is not manageable via commands`);
      }
      return { effects: [{ type: "addLabels", labels: [label] }] };
    },
  };
}
