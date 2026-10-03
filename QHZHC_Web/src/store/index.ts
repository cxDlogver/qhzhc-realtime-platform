import Vue from "vue";
import Vuex from "vuex";

Vue.use(Vuex);

type ThresholdRange = [number, number];

interface RootState {
  user: Record<string, unknown>;
  mapData: unknown[];
  gasData: Record<string, ThresholdRange[]>;
}

function storageSet(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function storageGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (_error) {
    return fallback;
  }
}

const state: RootState = {
  user: {},
  mapData: [],
  gasData: {
    HP_12CH4_dry: [[1.8, 2.2], [2.2, 3], [3, 5], [5, 8], [8, 12]],
    HR_12CH4_dry: [[10, 20], [20, 50], [50, 100], [100, 250], [250, 500]],
    "12CO2_dry": [[380, 500], [500, 700], [700, 1000], [1000, 1500], [1500, 2000]],
    CH4: [[0, 2.2], [2.2, 5], [5, 20], [20, 50], [50, 500]],
    C2H6: [[0, 20], [20, 40], [40, 60], [60, 80], [80, 500]],
    CO2: [[0, 500], [500, 700], [700, 1000], [1000, 1500], [1500, 3500]],
    CO: [[0, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 500]],
    N2O: [[0, 0.32], [0.32, 0.33], [0.33, 0.34], [0.34, 0.35], [0.35, 500]],
  },
};

export default new Vuex.Store<RootState>({
  state,
  getters: {
    GET_USER(currentState): Record<string, unknown> {
      currentState.user = storageGet("STORE_USER", {});
      return currentState.user;
    },
    getMapData(currentState): unknown[] {
      return currentState.mapData;
    },
    GET_GasData(currentState): Record<string, ThresholdRange[]> {
      return currentState.gasData;
    },
  },
  mutations: {
    SET_USER(currentState, data: Record<string, unknown>): void {
      currentState.user = data;
      storageSet("STORE_USER", data);
    },
    SET_MapData(currentState, data: unknown): void {
      currentState.mapData.push(data);
    },
    SET_GasData(
      currentState,
      data: { name: string; value: ThresholdRange[] },
    ): void {
      Vue.set(currentState.gasData, data.name, data.value);
    },
  },
});
