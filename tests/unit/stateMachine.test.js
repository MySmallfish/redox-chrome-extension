import { describe, it, expect } from "vitest";
import { interpret } from "xstate";
import { createAppMachine } from "../../src/popup/stateMachine.js";

function waitForState(service, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("timeout")), 2000);
    service.onTransition((state) => {
      if (predicate(state)) {
        clearTimeout(timeout);
        resolve(state);
      }
    });
  });
}

describe("stateMachine", () => {
  it("runs detection and local tracking flow", async () => {
    const machine = createAppMachine().withConfig({
      services: {
        loadBootstrap: async () => ({
          auth: null,
          localTracked: {},
          localTrackedList: []
        }),
        loadUser: async () => null,
        detectProperty: async () => ({
          detected: true,
          siteId: "yad2",
          canonicalUrl: "https://example.com",
          externalId: "123",
          normalized: { title: "Test" }
        }),
        checkTracked: async () => ({ tracked: false }),
        trackLocal: async () => ({
          tracked: true,
          source: "local",
          localRecord: { canonicalUrl: "https://example.com" },
          map: {},
          list: []
        }),
        loadTracked: async () => []
      },
      actions: {
        persistUser: () => {},
        clearStoredUser: () => {},
        persistPropertyTypes: () => {},
        clearStoredPropertyTypes: () => {}
      }
    });

    const service = interpret(machine).start();

    await waitForState(service, (state) =>
      state.matches({ ready: { currentPage: "notTracked" } })
    );

    service.send({ type: "TRACK_LOCAL" });

    const tracked = await waitForState(service, (state) =>
      state.matches({ ready: { currentPage: "tracked" } })
    );
    expect(tracked.context.trackedInfo.source).toBe("local");
    service.stop();
  });

  it("logs out on unauthorized error", async () => {
    const machine = createAppMachine().withConfig({
      services: {
        loadBootstrap: async () => ({
          auth: { token: "t", expiresAt: null },
          localTracked: {},
          localTrackedList: []
        }),
        loadUser: async () => null,
        detectProperty: async () => ({
          detected: true,
          siteId: "yad2",
          canonicalUrl: "https://example.com",
          externalId: "123",
          normalized: { title: "Test" }
        }),
        checkTracked: async () => {
          const err = new Error("unauthorized");
          err.code = "unauthorized";
          throw err;
        },
        loadTracked: async () => []
      },
      actions: {
        persistUser: () => {},
        clearStoredUser: () => {},
        persistPropertyTypes: () => {},
        clearStoredPropertyTypes: () => {}
      },
      guards: {
        isUnauthorized: (_, event) => event.data?.code === "unauthorized"
      }
    });

    const service = interpret(machine).start();

    const unauthenticated = await waitForState(service, (state) =>
      state.matches({ ready: { auth: "unauthenticated" } })
    );
    expect(unauthenticated.context.auth).toBe(null);
    service.stop();
  });
});
