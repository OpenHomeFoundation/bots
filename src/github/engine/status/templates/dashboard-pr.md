<!-- ha-bot-dashboard -->

👋 Hi! Thanks for contributing to **{{friendlyName}}**.

This is your PR dashboard which flags anything you need to address before your PR can be reviewed. Once everything is green, you can press the **'Ready for review'** button at the bottom of the page to notify reviewers to take a look.

<details><summary>More information about this dashboard</summary>

This dashboard automatically updates on every change to this PR and reevaluates the rules as you go. Until everything has been addressed, the bot will keep the PR in draft.

### Skip a check that doesn't apply

If you think a check doesn't apply to your PR (or the rule is bugged), comment `@{{commandSlug}} ignore "<check name>" "<reason>"`. The check name as shown in the table above. This will mark the check as ignored and let you put your PR in 'Ready for review'; `@{{commandSlug}} unignore "<check name>"` restores the rule.

### Bot commands

{{#hasCommands}}
Reply with `@{{commandSlug}} <command>`. Several commands can be stacked, one per line:

{{#commands}}
- `{{name}}` — {{description}}{{permissionNote}}{{exampleSuffix}}
{{/commands}}

{{/hasCommands}}
</details>

{{#hasChecks}}
## Checks

{{^hasVisibleRows}}
{{^hasWaitingRows}}
**✨ Everything's in order!**

{{/hasWaitingRows}}
{{/hasVisibleRows}}
{{#hasVisibleRows}}
{{#hasFailures}}
Things to address:
{{/hasFailures}}
{{^hasFailures}}
Things to look out for:
{{/hasFailures}}

| Status | Check | Details |
|--------|-------|---------|
{{#visibleRows}}
| {{icon}} | {{title}} | {{message}} |
{{/visibleRows}}

{{/hasVisibleRows}}
{{#hasWaitingRows}}
👀 Waiting on others before this PR can be merged:

| Status | Check | Details |
|--------|-------|---------|
{{#waitingRows}}
| {{icon}} | {{title}} | {{message}} |
{{/waitingRows}}

{{/hasWaitingRows}}
{{#hasCollapsedRows}}
<details>
<summary>{{collapsedSummary}}</summary>

| Status | Check | Details |
|--------|-------|---------|
{{#collapsedRows}}
| {{icon}} | {{title}} | {{message}} |
{{/collapsedRows}}

</details>

{{/hasCollapsedRows}}
{{/hasChecks}}
{{persistenceTail}}