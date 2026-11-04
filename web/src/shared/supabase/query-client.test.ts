import { focusManager, onlineManager, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "./query-client.ts";

afterEach(() => {
  onlineManager.setOnline(true);
  focusManager.setFocused(undefined);
});

describe("createQueryClient", () => {
  it("does not read again when going back to the tab or getting the network back", async () => {
    const client = createQueryClient();
    client.mount();
    const read = vi.fn<() => Promise<string>>(() => Promise.reject(new Error("falló")));
    const observer = new QueryObserver(client, { queryKey: ["x"], queryFn: read });
    const stop = observer.subscribe(() => undefined);
    await vi.waitFor(() => {
      expect(read).toHaveBeenCalledTimes(1);
    });

    focusManager.setFocused(false);
    focusManager.setFocused(true);
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(read).toHaveBeenCalledTimes(1);
    stop();
    client.unmount();
  });

  it("does not repeat a write by itself", async () => {
    const write = vi.fn<() => Promise<never>>(() => Promise.reject(new Error("falló")));
    const mutation = createQueryClient()
      .getMutationCache()
      .build(createQueryClient(), {
        mutationFn: write,
        ...createQueryClient().getDefaultOptions().mutations,
      });

    await expect(mutation.execute(undefined)).rejects.toThrow("falló");

    expect(write).toHaveBeenCalledTimes(1);
  });

  it("a failed read shows as a failure at once", async () => {
    const read = vi.fn<() => Promise<never>>(() => Promise.reject(new Error("falló")));

    await expect(
      createQueryClient().fetchQuery({ queryKey: ["x"], queryFn: read }),
    ).rejects.toThrow("falló");

    expect(read).toHaveBeenCalledTimes(1);
  });

  it("when the browser thinks it has no network, it asks anyway instead of pausing", async () => {
    onlineManager.setOnline(false);

    await expect(
      createQueryClient().fetchQuery({ queryKey: ["x"], queryFn: () => Promise.resolve("llegó") }),
    ).resolves.toBe("llegó");
  });
});
