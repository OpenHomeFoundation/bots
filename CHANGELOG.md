# Changelog

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
