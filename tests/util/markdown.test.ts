import { describe, expect, it } from "vitest";
import { codeSpan, neutraliseMentions } from "../../src/util/markdown.js";

describe("codeSpan", () => {
  it("wraps plain text in single backticks", () => {
    expect(codeSpan("a@b.c")).toBe("`a@b.c`");
  });

  it("outruns any backtick run inside the text", () => {
    expect(codeSpan("x` @home-assistant/core ``y")).toBe("```x` @home-assistant/core ``y```");
  });

  it("pads text that starts or ends with a backtick", () => {
    expect(codeSpan("`x")).toBe("`` `x ``");
  });

  it("flattens newlines, which would end the span", () => {
    expect(codeSpan("a\r\nb")).toBe("`a b`");
  });
});

describe("neutraliseMentions", () => {
  it("splits user and team mentions", () => {
    expect(neutraliseMentions("ask @alice or @home-assistant/core")).toBe(
      "ask @\u200Balice or @\u200Bhome-assistant/core",
    );
  });

  it("leaves a lone @ alone", () => {
    expect(neutraliseMentions("meet @ noon")).toBe("meet @ noon");
  });
});
