<template>
  <main class="basic-home">
    <section class="home-intro">
      <p class="eyebrow">清华大学走航车监测系统</p>
      <h1>温室气体走航监测</h1>
      <p class="summary">
        平台保留走航车实时监测与历史轨迹查询，登录后可进入原数据可视化界面。
      </p>
      <div class="home-actions">
        <router-link class="primary-action" to="/dataVisualization">
          进入数据可视化
        </router-link>
        <router-link v-if="!authenticated" class="secondary-action" to="/login">
          登录平台
        </router-link>
      </div>
    </section>
    <section class="home-notes" aria-label="平台功能">
      <article>
        <h2>实时走航</h2>
        <p>二维、三维地图同步展示车辆位置、气体浓度与气象数据。</p>
      </article>
      <article>
        <h2>历史查询</h2>
        <p>按时间范围查询历史数据，并回放走航车辆轨迹。</p>
      </article>
    </section>
  </main>
</template>

<script lang="ts">
import Vue from "vue";
import { accessTokenManager } from "@/services/accessToken";

export default Vue.extend({
  name: "IndexApp",
  computed: {
    authenticated(): boolean {
      return Boolean(accessTokenManager.getAccessToken());
    },
  },
});
</script>

<style scoped lang="scss">
.basic-home {
  min-height: calc(100vh - 65px);
  padding: 76px max(24px, 9vw);
  color: #122336;
  background: #f4f6f8;
  box-sizing: border-box;
}
.home-intro { max-width: 760px; }
.eyebrow { margin: 0 0 18px; color: #46677f; font-size: 15px; }
h1 { margin: 0; font-size: clamp(38px, 5vw, 64px); font-weight: 600; }
.summary {
  max-width: 660px;
  margin: 26px 0 0;
  color: #506778;
  font-size: 18px;
  line-height: 1.8;
}
.home-actions { display: flex; gap: 14px; margin-top: 34px; }
.home-actions a { padding: 12px 22px; border-radius: 3px; font-size: 15px; }
.primary-action { color: #fff; background: #006fb8; }
.secondary-action { color: #17364d; border: 1px solid #9aaeba; background: #fff; }
.home-notes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  max-width: 900px;
  margin-top: 74px;
}
.home-notes article { padding: 24px; border: 1px solid #d6dfe4; background: #fff; }
.home-notes h2 { margin: 0 0 12px; font-size: 19px; }
.home-notes p { margin: 0; color: #627786; line-height: 1.7; }
@media (max-width: 700px) {
  .basic-home { padding-top: 48px; }
  .home-notes { grid-template-columns: 1fr; }
  .home-actions { align-items: stretch; flex-direction: column; }
  .home-actions a { text-align: center; }
}
</style>
