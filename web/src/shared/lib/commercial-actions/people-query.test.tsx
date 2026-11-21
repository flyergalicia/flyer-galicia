import { describe, expect, it } from "vitest";
import { type Backend, failure, success } from "@/shared/supabase/index.ts";
import { readCommercialPeople } from "./people-query.ts";

const failed = {
  kind: "transient" as const,
  status: 500,
  code: null,
  message: "falla",
  details: null,
  hint: null,
};

const answering = (answer: Awaited<ReturnType<Backend["rpc"]>>): Pick<Backend, "rpc"> => ({
  rpc: () => Promise.resolve(answer),
});

describe("the people of Gestiones", () => {
  it("are by id", async () => {
    const backend = answering(success([{ id: "a", nombre: "Ana", rol: "vip" }, 3, null]));
    await expect(readCommercialPeople(backend)).resolves.toEqual({
      a: { id: "a", nombre: "Ana", rol: "vip" },
    });
  });

  it("a failure is a failure: nobody gets written down as nobody", async () => {
    await expect(readCommercialPeople(answering(failure(failed)))).rejects.toThrow("falla");
  });

  it("an answer that is no list has nobody", async () => {
    await expect(readCommercialPeople(answering(success(null)))).resolves.toEqual({});
  });
});
