// Account levels (migrations/0007_user_level.sql): the first account is
// admin, everybody after it standard. Nothing in the API changes a level.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { LEVELS } from "../worker/types";
import { addUser, api, signedIn } from "./helpers";

const levelOf = async (id: number) =>
  (await env.DB.prepare("SELECT level FROM users WHERE id = ?").bind(id).first<{ level: string }>())!.level;

describe("account levels", () => {
  it("are admin, pro and standard", () => {
    expect(LEVELS).toEqual(["admin", "pro", "standard"]);
  });

  it("the first account is admin, the next ones standard", async () => {
    const anna = await addUser("anna", "secret-pw");
    const ben = await addUser("ben", "secret-pw");
    const cleo = await addUser("cleo", "secret-pw");
    expect([await levelOf(anna), await levelOf(ben), await levelOf(cleo)]).toEqual(["admin", "standard", "standard"]);
  });

  it("deleting the admin promotes nobody", async () => {
    const anna = await addUser("anna", "secret-pw");
    const ben = await addUser("ben", "secret-pw");
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(anna).run();
    const cleo = await addUser("cleo", "secret-pw");
    expect([await levelOf(ben), await levelOf(cleo)]).toEqual(["standard", "standard"]);
  });

  it("a user created into an emptied table is the first user again: admin", async () => {
    const anna = await addUser("anna", "secret-pw");
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(anna).run();
    expect(await levelOf(await addUser("ben", "secret-pw"))).toBe("admin");
  });

  it("pro can be stored, anything else cannot", async () => {
    await addUser("anna", "secret-pw");
    const ben = await addUser("ben", "secret-pw");
    await env.DB.prepare("UPDATE users SET level = 'pro' WHERE id = ?").bind(ben).run();
    expect(await levelOf(ben)).toBe("pro");
    await expect(env.DB.prepare("UPDATE users SET level = 'owner' WHERE id = ?").bind(ben).run()).rejects.toThrow(
      /CHECK/,
    );
  });

  it("/api/me tells the user their level", async () => {
    await addUser("anna", "secret-pw");
    const { cookie } = await signedIn("ben");
    expect(await (await api("/api/me", { cookie })).json()).toEqual(expect.objectContaining({ level: "standard" }));
  });
});
