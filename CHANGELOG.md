# Changelog

## [0.7.0](https://github.com/OpenHomeFoundation/bots/compare/v0.6.0...v0.7.0) (2026-11-12)


### ✨ New features

* **cla:** label only PRs with a missing signature ([#139](https://github.com/OpenHomeFoundation/bots/issues/139)) ([759e2d1](https://github.com/OpenHomeFoundation/bots/commit/759e2d1d0cbd9942c0e2b3f47bb4eff53aa98d76))
* **core:** name integrations in the code-owner approval row ([#158](https://github.com/OpenHomeFoundation/bots/issues/158)) ([20524d3](https://github.com/OpenHomeFoundation/bots/commit/20524d35b0a4518c7815e96c7383684de79dce27))
* **core:** relax code-owner approval for members' code quality ([#156](https://github.com/OpenHomeFoundation/bots/issues/156)) ([c0edeae](https://github.com/OpenHomeFoundation/bots/commit/c0edeae4a5ad2d80886f4afe481cc93248a83809))
* **core:** relax code-owner approval for members' tree-wide PRs ([#143](https://github.com/OpenHomeFoundation/bots/issues/143)) ([6b1f8c0](https://github.com/OpenHomeFoundation/bots/commit/6b1f8c0303d598fbe0569cc6f948c47d7936792d))
* **github:** enable the bot dashboard on contributors docs ([#149](https://github.com/OpenHomeFoundation/bots/issues/149)) ([f06f1a0](https://github.com/OpenHomeFoundation/bots/commit/f06f1a02cb3430fcf3db4dfe368bbd43eee8d687))
* **github:** enable the bot dashboard on home-assistant/brands ([#148](https://github.com/OpenHomeFoundation/bots/issues/148)) ([b8f0413](https://github.com/OpenHomeFoundation/bots/commit/b8f0413233a58bb202b86bcc6c401c697046e758))
* **github:** hold PRs until their linked siblings are approved ([#142](https://github.com/OpenHomeFoundation/bots/issues/142)) ([c69096a](https://github.com/OpenHomeFoundation/bots/commit/c69096a2c48b9b2853c9c21d111cbd837c137314))
* **github:** pair docs and brands PRs with the code they follow ([#147](https://github.com/OpenHomeFoundation/bots/issues/147)) ([9ed1a82](https://github.com/OpenHomeFoundation/bots/commit/9ed1a82f532eec7b62a9f5b01cc652ec1f9da947))
* **github:** pair PRs that list each other as belonging together ([#137](https://github.com/OpenHomeFoundation/bots/issues/137)) ([dc1166c](https://github.com/OpenHomeFoundation/bots/commit/dc1166c88c695a48107651da840c868bd4b0e4c6))
* **github:** re-enable the bot dashboard on contributors docs ([#155](https://github.com/OpenHomeFoundation/bots/issues/155)) ([62b6f96](https://github.com/OpenHomeFoundation/bots/commit/62b6f964daa659e1855a7b859ffcea4f9fcdb512))


### 🐛 Bug fixes

* **core:** classify all top-level core paths in parse-path ([#140](https://github.com/OpenHomeFoundation/bots/issues/140)) ([50c5cbd](https://github.com/OpenHomeFoundation/bots/commit/50c5cbd82b96b344b5c290061e33ccc217509e2d))
* **core:** forbid integration brand folders in every PR ([#141](https://github.com/OpenHomeFoundation/bots/issues/141)) ([9a31389](https://github.com/OpenHomeFoundation/bots/commit/9a31389818f7d740981439df45fc8715881807cb))
* **github:** check org membership via the API in merge-target ([#144](https://github.com/OpenHomeFoundation/bots/issues/144)) ([3bc592e](https://github.com/OpenHomeFoundation/bots/commit/3bc592ecff916552854d72b1673de86544fe0582))
* **github:** list checks waiting on others in their own table ([#157](https://github.com/OpenHomeFoundation/bots/issues/157)) ([f1cc552](https://github.com/OpenHomeFoundation/bots/commit/f1cc552b7aaf336daef6aa9bf14b0e48200626c4))
* **github:** only assign code owners GitHub accepts ([#138](https://github.com/OpenHomeFoundation/bots/issues/138)) ([4c9737b](https://github.com/OpenHomeFoundation/bots/commit/4c9737b106ad03d5e13ee16b4f190901db96aabb))
* **github:** skip locked items, re-evaluate PRs on unlock ([#135](https://github.com/OpenHomeFoundation/bots/issues/135)) ([8b37f73](https://github.com/OpenHomeFoundation/bots/commit/8b37f73a5b89b424489d14a81f9338cb30cb8135))
* **github:** treat removing an absent label as done ([#145](https://github.com/OpenHomeFoundation/bots/issues/145)) ([9738aa8](https://github.com/OpenHomeFoundation/bots/commit/9738aa86857db7e2cbe3461780f3bc66588df530))


### 🚀 Enhancements

* **github:** remove the intents manifest ([#146](https://github.com/OpenHomeFoundation/bots/issues/146)) ([860ea15](https://github.com/OpenHomeFoundation/bots/commit/860ea157b65ec7de8b13e59f726c7b601ebd006e))

## [0.6.0](https://github.com/OpenHomeFoundation/bots/compare/v0.5.0...v0.6.0) (2026-11-11)


### ✨ New features

* **github:** link the item from every log line ([#125](https://github.com/OpenHomeFoundation/bots/issues/125)) ([589118f](https://github.com/OpenHomeFoundation/bots/commit/589118fc87402ae687e13ba959022428812901ac))
* **github:** tag the API-call counter with method and route ([#124](https://github.com/OpenHomeFoundation/bots/issues/124)) ([6dfc0b6](https://github.com/OpenHomeFoundation/bots/commit/6dfc0b6569e2fdae933f2294feeeb2634ba5f935))


### 🐛 Bug fixes

* **core:** only label integrations that already exist on dev ([#132](https://github.com/OpenHomeFoundation/bots/issues/132)) ([bebc1cc](https://github.com/OpenHomeFoundation/bots/commit/bebc1ccab83c0eef332eabff8664987444a7e83c))
* **core:** require owner approval for every platinum integration ([#134](https://github.com/OpenHomeFoundation/bots/issues/134)) ([4a55349](https://github.com/OpenHomeFoundation/bots/commit/4a55349465f28c9dbd05e3e662ebc3aff68d1f5f))
* **github:** only fetch manifests for valid integration domains ([#127](https://github.com/OpenHomeFoundation/bots/issues/127)) ([5160f04](https://github.com/OpenHomeFoundation/bots/commit/5160f04f6ac94dd9ffe88fe03beea3ae7be3dc77))
* **github:** order integrations in the code-owner mention ([#122](https://github.com/OpenHomeFoundation/bots/issues/122)) ([d5b5024](https://github.com/OpenHomeFoundation/bots/commit/d5b5024f9094dd4d587f89c2d0d49b258b7a9b55))
* **github:** rate-limit the update command for non-members ([#133](https://github.com/OpenHomeFoundation/bots/issues/133)) ([6cb364c](https://github.com/OpenHomeFoundation/bots/commit/6cb364c69a70bf55367488331dd2839d2bc78f67))
* **github:** rewrite old mention comments on the next dispatch ([#120](https://github.com/OpenHomeFoundation/bots/issues/120)) ([574516c](https://github.com/OpenHomeFoundation/bots/commit/574516c5f868becb96c5b8af00c54fd14ee24234))
* keep user text in bot comments from mentioning anyone ([#126](https://github.com/OpenHomeFoundation/bots/issues/126)) ([c7bbede](https://github.com/OpenHomeFoundation/bots/commit/c7bbedea2ed5fad7813f0173bf5f58d7349c435a))


### 🧰 Maintenance

* grant artifact-metadata write to the release job ([#128](https://github.com/OpenHomeFoundation/bots/issues/128)) ([0aaaa10](https://github.com/OpenHomeFoundation/bots/commit/0aaaa102f9e87ffd03f5d1062aa730831c1bd8c6))
* run release-please as the OHF Release Bot app ([#123](https://github.com/OpenHomeFoundation/bots/issues/123)) ([a3282a1](https://github.com/OpenHomeFoundation/bots/commit/a3282a1952f20c22472d1be63227a4d16f1a075b))

## [0.5.0](https://github.com/OpenHomeFoundation/bots/compare/v0.4.1...v0.5.0) (2026-11-10)


### ✨ New features

* **core:** fail PRs that commit forbidden files ([#117](https://github.com/OpenHomeFoundation/bots/issues/117)) ([a75cb87](https://github.com/OpenHomeFoundation/bots/commit/a75cb87966fabdd81a6d1664bd94e66d88956f3a))
* **github:** edit the mention comment when integrations change ([#119](https://github.com/OpenHomeFoundation/bots/issues/119)) ([f5b5500](https://github.com/OpenHomeFoundation/bots/commit/f5b5500e910d8c5dd7db36908375c3bed97509ac))
* **github:** fail new-integration PRs that define async_migrate_entry ([#102](https://github.com/OpenHomeFoundation/bots/issues/102)) ([7276c42](https://github.com/OpenHomeFoundation/bots/commit/7276c429b023d7abda90c5ffe4c0c6269b0755b3))


### 🐛 Bug fixes

* **core:** count repo tooling in small-pr and has-tests ([#114](https://github.com/OpenHomeFoundation/bots/issues/114)) ([3f1861a](https://github.com/OpenHomeFoundation/bots/commit/3f1861a20e083c3c2f6171a0d2f6fc26661c38a2))

## [0.4.1](https://github.com/OpenHomeFoundation/bots/compare/v0.4.0...v0.4.1) (2026-11-10)


### 🐛 Bug fixes

* **github:** serialize dispatches per item ([#110](https://github.com/OpenHomeFoundation/bots/issues/110)) ([e9e4435](https://github.com/OpenHomeFoundation/bots/commit/e9e4435e4b08ba917257d54b91e084fa4436828d))

## [0.4.0](https://github.com/OpenHomeFoundation/bots/compare/v0.3.1...v0.4.0) (2026-11-09)


### ✨ New features

* **core:** fail PRs that add more than one new platform ([#48](https://github.com/OpenHomeFoundation/bots/issues/48)) ([cb0848c](https://github.com/OpenHomeFoundation/bots/commit/cb0848cd71f64870383efafee7d1d325150262d0))
* **github:** fail new-integration PRs that include diagnostics ([#47](https://github.com/OpenHomeFoundation/bots/issues/47)) ([706f6cf](https://github.com/OpenHomeFoundation/bots/commit/706f6cf538d7b12f69186a3f1f00b8f703bf94cb))


### 🐛 Bug fixes

* **discord:** point /info links at the OpenHomeFoundation/bots repository ([#46](https://github.com/OpenHomeFoundation/bots/issues/46)) ([fd70747](https://github.com/OpenHomeFoundation/bots/commit/fd707472d32653b3ed67037a600c1bc5e605eeee))
* **discord:** stop serving the ESPHome guild ([#45](https://github.com/OpenHomeFoundation/bots/issues/45)) ([ace5356](https://github.com/OpenHomeFoundation/bots/commit/ace5356452a259c66ffe01913bd2377f8f4c408f))
* **github:** ignore the stale bot's stale-label changes ([#109](https://github.com/OpenHomeFoundation/bots/issues/109)) ([b9d6486](https://github.com/OpenHomeFoundation/bots/commit/b9d648689ce3ae8b2323059768233d4fbe3876a0))


### 🧰 Maintenance

* **deps:** update all deps, move to openapi-webhooks-types ([#107](https://github.com/OpenHomeFoundation/bots/issues/107)) ([1921822](https://github.com/OpenHomeFoundation/bots/commit/1921822244fedc510b8c2c89f2211b0c382f288d))

## [0.3.1](https://github.com/OpenHomeFoundation/bots/compare/v0.3.0...v0.3.1) (2026-11-06)


### 🧰 Maintenance

* align the release workflows with web-api ([#41](https://github.com/OpenHomeFoundation/bots/issues/41)) ([5cfa86d](https://github.com/OpenHomeFoundation/bots/commit/5cfa86d423ef3b991f979bf11c62149e8cc15bc1))

## [0.3.0](https://github.com/OpenHomeFoundation/bots/compare/v0.2.0...v0.3.0) (2026-11-06)


### ⚠ BREAKING CHANGES

* **cla:** move CLA storage from DynamoDB to Postgres ([#17](https://github.com/OpenHomeFoundation/bots/issues/17))

### ✨ New features

* **cla:** move CLA storage from DynamoDB to Postgres ([#17](https://github.com/OpenHomeFoundation/bots/issues/17)) ([2380868](https://github.com/OpenHomeFoundation/bots/commit/23808683ba55710a985483ba3615e9ab468fd7f8))
* **health:** adopt the standard heartbeat and version endpoints ([#16](https://github.com/OpenHomeFoundation/bots/issues/16)) ([339b3a7](https://github.com/OpenHomeFoundation/bots/commit/339b3a7a115d66afd900e455945829e7bb3b70d6))


### 🐛 Bug fixes

* **cla:** allow the home-assistant.io sign form through CORS ([#24](https://github.com/OpenHomeFoundation/bots/issues/24)) ([129474c](https://github.com/OpenHomeFoundation/bots/commit/129474ca2cdcdc76954c4f65eefbc473af46459d))
* **core:** skip change-type and integration checks on release PRs ([#33](https://github.com/OpenHomeFoundation/bots/issues/33)) ([6e50a16](https://github.com/OpenHomeFoundation/bots/commit/6e50a16e758e073b26af975dd3b674fb6655e46a))
* **github:** derive item integrations in one helper per repo ([#35](https://github.com/OpenHomeFoundation/bots/issues/35)) ([48e24b0](https://github.com/OpenHomeFoundation/bots/commit/48e24b0b3b2b1ffbf2926d09faf2aaea58da3c43))
* **github:** evaluate every rule on first contact with a PR ([#30](https://github.com/OpenHomeFoundation/bots/issues/30)) ([ba35b58](https://github.com/OpenHomeFoundation/bots/commit/ba35b58362c3949d9356b516b275255d5d9fad43))
* **github:** make the command parser regex linear ([#26](https://github.com/OpenHomeFoundation/bots/issues/26)) ([f49b15e](https://github.com/OpenHomeFoundation/bots/commit/f49b15eb44689fc42f5a8fded25eacc8c532ef48))
* **github:** only trust status and marker comments the bot wrote ([#22](https://github.com/OpenHomeFoundation/bots/issues/22)) ([d5ca524](https://github.com/OpenHomeFoundation/bots/commit/d5ca5241a445088c118f20c8a0e5381494d2e8b0))
* **github:** report blocking labels as pending instead of failing ([#32](https://github.com/OpenHomeFoundation/bots/issues/32)) ([ec5df25](https://github.com/OpenHomeFoundation/bots/commit/ec5df25a46814a88a63815dda5603abe38da3fe9))
* **github:** retry commit statuses rejected after a fork push ([#31](https://github.com/OpenHomeFoundation/bots/issues/31)) ([463a481](https://github.com/OpenHomeFoundation/bots/commit/463a4813897602085764f4d70cf3d77e69aae734))
* **github:** run org-wide rules on repos without a manifest ([#25](https://github.com/OpenHomeFoundation/bots/issues/25)) ([d230c1d](https://github.com/OpenHomeFoundation/bots/commit/d230c1d7eecb43d57f67e52fa33792c48442b827))
* **github:** run repeated commands once per comment ([#23](https://github.com/OpenHomeFoundation/bots/issues/23)) ([e4ad429](https://github.com/OpenHomeFoundation/bots/commit/e4ad429fcb14e9a4037b8dd92934644255ea5bee))
* **github:** stop overwriting the bot's legacy commit statuses ([#28](https://github.com/OpenHomeFoundation/bots/issues/28)) ([5423512](https://github.com/OpenHomeFoundation/bots/commit/5423512ba7776f41f0cdb7497a117cac82c84129))
* let only members waive code-owner, blocking and CLA checks ([#27](https://github.com/OpenHomeFoundation/bots/issues/27)) ([81196c4](https://github.com/OpenHomeFoundation/bots/commit/81196c49788209b16cfadc5e66cc273ee30d2554))


### 🚀 Enhancements

* **github:** remove the Hacktoberfest rule ([#34](https://github.com/OpenHomeFoundation/bots/issues/34)) ([34390ac](https://github.com/OpenHomeFoundation/bots/commit/34390ac163a617e41fb61c7a6e62a6589d3c1b9f))
* inject the rule and guild registries via DI tokens ([#19](https://github.com/OpenHomeFoundation/bots/issues/19)) ([000ad08](https://github.com/OpenHomeFoundation/bots/commit/000ad086ca8fae4c23a40a541f9b2a26cb6abcb0))


### 📚 Documentation

* update readme ([#18](https://github.com/OpenHomeFoundation/bots/issues/18)) ([3a63b1f](https://github.com/OpenHomeFoundation/bots/commit/3a63b1fef3329543a1067d158fb6af2c3e90b000))


### 🧰 Maintenance

* remove tracked .envrc ([#20](https://github.com/OpenHomeFoundation/bots/issues/20)) ([aaf838c](https://github.com/OpenHomeFoundation/bots/commit/aaf838c473b15fc5b796c752a4cbfa4737cff5e7))
* sync fixture bodies with the upstream PR template ([#21](https://github.com/OpenHomeFoundation/bots/issues/21)) ([1bb7a38](https://github.com/OpenHomeFoundation/bots/commit/1bb7a38f4061d93e76d0747a3735e0116a7d6f6c))

## [0.2.0](https://github.com/OpenHomeFoundation/bots/compare/v0.1.0...v0.2.0) (2026-08-31)


### ⚠ BREAKING CHANGES

* switch comment commands to `@home-assistant <command>` ([#10](https://github.com/OpenHomeFoundation/bots/issues/10))
* remove the review-comments rule ([#7](https://github.com/OpenHomeFoundation/bots/issues/7))

### ✨ New features

* add production logging with context ([#14](https://github.com/OpenHomeFoundation/bots/issues/14)) ([5281b90](https://github.com/OpenHomeFoundation/bots/commit/5281b90fd1c5933a99f68e889c176a709f16a666))
* **github:** enable octokit throttling and retry plugins ([#5](https://github.com/OpenHomeFoundation/bots/issues/5)) ([0a77963](https://github.com/OpenHomeFoundation/bots/commit/0a779636b04e80bdda67de5b7c95b29fa7d49b9b))
* **github:** gate the PR dashboard per repo and add a legacy CLA mode ([bb67a00](https://github.com/OpenHomeFoundation/bots/commit/bb67a002bd53023dc14a68a879423ea2819a7e92))
* **github:** resolve dashboard greeting names per org instead of per repo ([#8](https://github.com/OpenHomeFoundation/bots/issues/8)) ([1631bb2](https://github.com/OpenHomeFoundation/bots/commit/1631bb285a8e636786c9f7f0e69b958198cc2155))
* **github:** scope esphome and intents to legacy parity ([#13](https://github.com/OpenHomeFoundation/bots/issues/13)) ([26d6ca6](https://github.com/OpenHomeFoundation/bots/commit/26d6ca64a3ca8a20279c7b9e5d4591347759577e))
* remove the review-comments rule ([#7](https://github.com/OpenHomeFoundation/bots/issues/7)) ([101d8de](https://github.com/OpenHomeFoundation/bots/commit/101d8de3889476139d59e60fcf08ec015707f9e3))
* switch comment commands to `[@home-assistant](https://github.com/home-assistant) <command>` ([#10](https://github.com/OpenHomeFoundation/bots/issues/10)) ([bda2af0](https://github.com/OpenHomeFoundation/bots/commit/bda2af05b6d18687ad9717eb5d2f9f6df113a687))


### 🐛 Bug fixes

* **cla:** re-evaluate the PR after signing instead of a label round-trip ([#9](https://github.com/OpenHomeFoundation/bots/issues/9)) ([72c0138](https://github.com/OpenHomeFoundation/bots/commit/72c0138ce7c3ce3e43abf1acb4dc6e757b079567))
* **github:** recognize the legacy bot's code-owner mention comments ([#6](https://github.com/OpenHomeFoundation/bots/issues/6)) ([172ce30](https://github.com/OpenHomeFoundation/bots/commit/172ce30452408c72bcdb1e32bc980c77d9884276))


### 📚 Documentation

* reference mise tasks instead of just in the PR checklist ([dc1b2c8](https://github.com/OpenHomeFoundation/bots/commit/dc1b2c8f9a837c02dc8d6b6a10281f2d24886d2d))


### 🧰 Maintenance

* sync fixture bodies with the upstream PR template ([#4](https://github.com/OpenHomeFoundation/bots/issues/4)) ([7216114](https://github.com/OpenHomeFoundation/bots/commit/72161145dc5f64f78a092d6d3640c0bfd4792507))
* use a conventional commit and the PR template in the sync-templates PR ([147957b](https://github.com/OpenHomeFoundation/bots/commit/147957bf6823cd2a95427eddcbba4c4023e1c45b))

## 0.1.0 (2026-08-26)


### ✨ New features

* initial implementation ([ddc4ebe](https://github.com/OpenHomeFoundation/bots/commit/ddc4ebe87b725549ec2fbf807b01a21a32cbb633))


### 🐛 Bug fixes

* **docker:** skip lifecycle scripts in prod install ([e9597d9](https://github.com/OpenHomeFoundation/bots/commit/e9597d9cbc02eabf4399f817fbd875302daaa6bc))
* reject command usage errors at info level, guard test logs ([0bfa9a4](https://github.com/OpenHomeFoundation/bots/commit/0bfa9a43fa923317ec714a0851c33e4171ff08e7))
* route octokit logging through pino, drop request lines ([f6905e6](https://github.com/OpenHomeFoundation/bots/commit/f6905e6981f9546126d9e55518fec7e3d161e72b))
* use 0.1.0 as initial release version ([7b17f82](https://github.com/OpenHomeFoundation/bots/commit/7b17f826eb0acaef88b5314592e7a4514c755cca))


### 🧰 Maintenance

* await async rejection assertion ([1fc4c4e](https://github.com/OpenHomeFoundation/bots/commit/1fc4c4ebb947e9fbe532a750c4e10e0f95174ca0))
* bump pnpm pin to 11.24.0 ([b1dc2a6](https://github.com/OpenHomeFoundation/bots/commit/b1dc2a66d9776686f23aa306267c073359522b59))
