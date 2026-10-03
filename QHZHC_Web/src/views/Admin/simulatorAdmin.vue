<template>
  <main class="simulator-admin" data-testid="simulator-admin-page">
    <header class="admin-header">
      <div>
        <p>清华走航车系统</p>
        <h1>数据模拟后台</h1>
      </div>
      <button type="button" @click="backToVisualization">返回数据可视化</button>
    </header>

    <section class="admin-panel">
      <div class="status-row">
        <strong :class="status.running ? 'running' : 'paused'">
          {{ status.running ? "正在插入" : "已暂停" }}
        </strong>
        <span>最新序号：{{ status.committedSequence }}</span>
        <span>已生成：{{ status.generatedPoints }}</span>
        <span>WebSocket：{{ status.connectedClients }}</span>
      </div>

      <el-form label-position="top" :model="draft" class="config-form">
        <el-form-item label="每秒插入条数">
          <el-select v-model="draft.pointsPerSecond" data-testid="points-per-second">
            <el-option :label="'1 点/秒'" :value="1" />
            <el-option :label="'5 点/秒'" :value="5" />
            <el-option :label="'10 点/秒'" :value="10" />
            <el-option :label="'20 点/秒'" :value="20" />
          </el-select>
        </el-form-item>
        <el-form-item label="车辆轨迹">
          <el-select v-model="draft.pattern">
            <el-option label="路线走航" value="route" />
            <el-option label="环形走航" value="circle" />
            <el-option label="突发采样" value="burst" />
          </el-select>
        </el-form-item>
      </el-form>

      <div class="action-row">
        <el-button type="primary" :loading="saving" @click="saveConfig">
          应用模拟参数
        </el-button>
        <el-button @click="perform(status.running ? 'pause' : 'start')">
          {{ status.running ? "中断插入" : "开始插入" }}
        </el-button>
        <el-button type="danger" plain @click="perform('disconnect')">
          模拟 WebSocket 断网
        </el-button>
      </div>
    </section>
  </main>
</template>

<script lang="ts">
import Vue from "vue";
import {
  fetchSimulatorStatus,
  runSimulatorAction,
  updateSimulatorConfig,
  type SimulatorConfig,
  type SimulatorStatus,
} from "@/services/simulatorApi";

const initialConfig = (): SimulatorConfig => ({
  robotId: "QH-ZHC-01",
  pointsPerSecond: 20,
  pattern: "route",
});

const initialStatus = (): SimulatorStatus => ({
  running: false,
  config: initialConfig(),
  committedSequence: 0,
  generatedPoints: 0,
  lastGeneratedAt: null,
  connectedClients: 0,
  updatedAt: "",
});

export default Vue.extend({
  name: "SimulatorAdmin",
  data() {
    return {
      status: initialStatus(),
      draft: initialConfig(),
      saving: false,
      pollTimer: null as number | null,
    };
  },
  async mounted() {
    await this.refresh();
    this.pollTimer = window.setInterval(() => void this.refresh(false), 1000);
  },
  beforeDestroy() {
    if (this.pollTimer !== null) window.clearInterval(this.pollTimer);
  },
  methods: {
    async refresh(syncDraft = true): Promise<void> {
      try {
        const status = await fetchSimulatorStatus();
        this.status = status;
        if (syncDraft) this.draft = { ...status.config };
      } catch (_error) {
        // 全局请求拦截器已经给出错误信息，轮询保持静默。
      }
    },
    async saveConfig(): Promise<void> {
      this.saving = true;
      try {
        this.status = await updateSimulatorConfig({ ...this.draft });
        this.$message.success("模拟参数已更新");
      } finally {
        this.saving = false;
      }
    },
    async perform(action: "start" | "pause" | "disconnect"): Promise<void> {
      const result = await runSimulatorAction(action);
      this.status = result.status;
      if (action === "disconnect") {
        this.$message.success(`已断开 ${result.disconnected || 0} 个连接`);
      }
    },
    backToVisualization(): void {
      void this.$router.push("/dataVisualization");
    },
  },
});
</script>

<style scoped lang="scss">
.simulator-admin {
  min-height: 100vh;
  padding: 42px max(24px, 8vw);
  color: #122336;
  background: #eef2f5;
  box-sizing: border-box;
}
.admin-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  max-width: 1080px;
  margin: 0 auto 24px;
}
.admin-header p { margin: 0 0 8px; color: #60788a; }
.admin-header h1 { margin: 0; font-size: 32px; }
.admin-header button {
  padding: 9px 14px;
  color: #17364d;
  border: 1px solid #9fb0bb;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
}
.admin-panel {
  max-width: 1080px;
  margin: 0 auto;
  padding: 28px;
  border: 1px solid #d1dbe1;
  background: #fff;
}
.status-row { display: flex; flex-wrap: wrap; gap: 22px; padding-bottom: 22px; border-bottom: 1px solid #e0e5e8; }
.status-row strong { padding: 3px 9px; border-radius: 2px; }
.status-row .running { color: #177347; background: #e5f4ec; }
.status-row .paused { color: #8a5a16; background: #f7eddc; }
.config-form { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 22px; margin-top: 24px; }
.config-form .el-select,
.config-form .el-input-number { width: 100%; }
.action-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
@media (max-width: 800px) {
  .admin-header { align-items: flex-start; flex-direction: column; gap: 16px; }
  .config-form { grid-template-columns: 1fr; }
  .action-row .el-button { width: 100%; margin-left: 0; }
}
</style>
