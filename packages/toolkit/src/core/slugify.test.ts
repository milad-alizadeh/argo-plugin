import { describe, expect, it } from "vitest";
import { slugify } from "./slugify.js";

describe("slugify", () => {
  it("lowercases the title", () => {
    expect(slugify("HELLO")).toBe("hello");
  });
});
