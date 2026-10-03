import { AdaptiveRenderController } from "@/views/DataVisualization/services/AdaptiveRenderController";

function sample(overrides = {}) {
  return {
    nowMs: 1_000,
    actualFps: 60,
    baselineFps: 60,
    arrivalRate: 20,
    consumeRate: 20,
    pending: 0,
    oldestPendingMs: 0,
    renderP95Ms: 4,
    frameIntervalMs: 1000 / 60,
    effectivePointLimit: 20,
    ...overrides,
  };
}

describe("AdaptiveRenderController", () => {
  test("distinguishes manual batch mode from automatic decisions", () => {
    const controller = new AdaptiveRenderController(1, 20);
    controller.setManualBatch(5);
    const decision = controller.evaluate(sample({ pending: 100, oldestPendingMs: 2_000 }));
    expect(decision.mode).toBe("manual");
    expect(decision.batchSize).toBe(5);
    expect(decision.requestedPointLimit).toBeNull();
  });

  test("increases batch quickly while the queue is growing and render cost is safe", () => {
    const controller = new AdaptiveRenderController(1, 20);
    const first = controller.evaluate(sample({ pending: 20, oldestPendingMs: 1_100 }));
    const second = controller.evaluate(sample({ nowMs: 2_000, pending: 40, oldestPendingMs: 1_500 }));
    expect(first.batchSize).toBe(2);
    expect(second.batchSize).toBe(3);
    expect(second.reason).toMatch(/increase batch/);
  });

  test("does not grow a batch beyond a measured frame budget", () => {
    const controller = new AdaptiveRenderController(5, 20);
    const decision = controller.evaluate(sample({
      pending: 50,
      oldestPendingMs: 2_000,
      renderP95Ms: 12,
      frameIntervalMs: 16,
    }));
    expect(decision.frameBudgetMs).toBe(8);
    expect(decision.batchSize).toBeLessThanOrEqual(4);
    expect(decision.reason).toMatch(/budget/);
  });

  test("decreases batch only after consecutive healthy windows", () => {
    const controller = new AdaptiveRenderController(4, 20, {
      healthyWindowsBeforeDecrease: 3,
    });
    controller.evaluate(sample({ nowMs: 1_000 }));
    controller.evaluate(sample({ nowMs: 2_000 }));
    const decision = controller.evaluate(sample({ nowMs: 3_000 }));
    expect(decision.batchSize).toBe(3);
    expect(decision.reason).toMatch(/decrease batch/);
  });

  test("lowers input one tier after sustained overload at the safe ceiling", () => {
    const controller = new AdaptiveRenderController(50, 20, {
      overloadWindowsBeforeThrottle: 3,
      throttleCooldownMs: 1,
    });
    controller.evaluate(sample({ nowMs: 1_000, pending: 10, oldestPendingMs: 1_100 }));
    controller.evaluate(sample({ nowMs: 2_000, pending: 20, oldestPendingMs: 1_200 }));
    const decision = controller.evaluate(sample({ nowMs: 3_000, pending: 30, oldestPendingMs: 1_300 }));
    expect(decision.requestedPointLimit).toBe(10);
    expect(decision.reason).toMatch(/lower input rate/);
  });

  test("recovers input one tier only after a sustained healthy period", () => {
    const controller = new AdaptiveRenderController(1, 20, {
      recoveryHealthyMs: 2_000,
      throttleCooldownMs: 1,
    });
    controller.evaluate(sample({ nowMs: 1_000, effectivePointLimit: 10 }));
    controller.evaluate(sample({ nowMs: 2_000, effectivePointLimit: 10 }));
    const decision = controller.evaluate(sample({ nowMs: 3_000, effectivePointLimit: 10 }));
    expect(decision.requestedPointLimit).toBe(20);
    expect(decision.reason).toMatch(/higher input rate/);
  });
});
