import { describe, expect, test } from "bun:test";
import { accountDataDirectory, accountScopeKey } from "./account-scope.mjs";

describe("desktop account scopes", () => {
  test("keeps anonymous scope separate and stable user scopes deterministic", () => {
    expect(accountScopeKey("https://notes.example.com", null)).toBe("anonymous");
    expect(accountScopeKey("https://notes.example.com", "user-1")).toBe(accountScopeKey("https://notes.example.com", "user-1"));
    expect(accountScopeKey("https://notes.example.com", "user-1")).not.toBe(accountScopeKey("https://notes.example.com", "user-2"));
    expect(accountScopeKey("https://notes.example.com", "user-1")).not.toBe(accountScopeKey("https://other.example.com", "user-1"));
  });

  test("stores accounts below the managed user-data directory", () => {
    const directory = accountDataDirectory("/tmp/edgeever", "https://notes.example.com", "user-1");
    expect(directory.startsWith("/tmp/edgeever/accounts/")).toBe(true);
    expect(directory.endsWith("/user-1")).toBe(false);
  });
});
