# 项目 skill 接入细则（tdd / code-review）

SKILL.md「项目 skill 接入」判定可用后读本文件。两者都是 Read 其 SKILL.md 整份照做，以下是流水线对它们的改写——冲突处以本文件为准。

## 通用：交互步骤改为落盘继续

对方 skill 里要求问用户、向用户展示结果的步骤，一律改为「写进对应落盘文件后继续」：

- tdd「写测试前先与用户确认 seam」→ 已由阶段3 ★用户确认承接，不再重问
- code-review「展示两轴报告给用户」→ 报告原文与逐条修正写进 `review-c.md`，接着送外审
- code-review「缺 `docs/agents/issue-tracker.md` 让用户跑 setup」→ 不阻断，spec 由下方直接给

## code-review 用于门C 自审

执行 code-review，再补过 SKILL.md 自审清单第 2、3 条（第 1、4 条已由其 Spec 轴覆盖）。

- 基点＝阶段4记下的 commit；定点门审按 code-review 自己的第1步定
- diff 命令改用 `git diff <基点>`（含未提交改动）；新建文件先 `git add -N` 才进 diff
- spec＝`artifact-spec.md` 路径；定点门审＝用户本次要求

**完成判据**：Standards/Spec 两轴 findings 与第 2、3 条结果均已修完并逐条记入 `review-c.md`。
