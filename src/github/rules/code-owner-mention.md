<!-- ha-bot-mention -->

{{#single}}Hey there {{mentions}}, mind taking a look at this {{itemLabel}} as it has been labeled with an integration (`{{integrationName}}`) you are listed as a [code owner]({{codeownersLine}}) for? Thanks!
{{/single}}{{^single}}Hey there, mind taking a look at this {{itemLabel}} as it has been labeled with integrations you are listed as a [code owner]({{codeownersUrl}}) for? Thanks!

{{#integrations}}
- `{{integrationName}}` ([owners]({{codeownersLine}})): {{mentions}}
{{/integrations}}{{/single}}{{#hasCommands}}<details><summary>Code owner commands</summary>

Reply with `@{{commandSlug}} <command>`:

{{#commands}}
- `{{name}}` — {{description}}{{permissionNote}}{{exampleSuffix}}
{{/commands}}

</details>{{/hasCommands}}