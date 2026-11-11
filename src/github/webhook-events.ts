import type { components } from "@octokit/openapi-webhooks-types";

type Schemas = components["schemas"];

export type IssueCommentCreatedEvent = Schemas["webhook-issue-comment-created"];
export type IssuesLabeledEvent = Schemas["webhook-issues-labeled"];
export type IssuesOpenedEvent = Schemas["webhook-issues-opened"];
export type PullRequestClosedEvent = Schemas["webhook-pull-request-closed"];
export type PullRequestEditedEvent = Schemas["webhook-pull-request-edited"];
export type PullRequestLabeledEvent = Schemas["webhook-pull-request-labeled"];
export type PullRequestOpenedEvent = Schemas["webhook-pull-request-opened"];
export type PullRequestReadyForReviewEvent = Schemas["webhook-pull-request-ready-for-review"];
export type PullRequestReopenedEvent = Schemas["webhook-pull-request-reopened"];
export type PullRequestReviewSubmittedEvent = Schemas["webhook-pull-request-review-submitted"];
export type PullRequestSynchronizeEvent = Schemas["webhook-pull-request-synchronize"];
export type PullRequestUnlabeledEvent = Schemas["webhook-pull-request-unlabeled"];
export type PullRequestUnlockedEvent = Schemas["webhook-pull-request-unlocked"];
