# Changelog

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
