import { normalizeUsername } from "./unique-constraint";

describe("unique constraint helpers", () => {
  it("normalizes usernames case-insensitively and trims whitespace", () => {
    expect(normalizeUsername("  Alice.Admin  ")).toBe("alice.admin");
  });
});
