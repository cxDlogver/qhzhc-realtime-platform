<!--
 * @Author: zhou
 * @Date: 2024-07-12 17:40:27
 * @LastEditors: zhou
 * @LastEditTime: 2024-07-15 13:46:41
 * @Description: 
 * @param: 
 * @return: 
-->
<template>
  <div id="app">
    <router-view></router-view>
  </div>
</template>

<script lang="ts">
export default {
  name: "App",
  components: {},
  mounted() {
    if (performance.navigation.type == performance.navigation.TYPE_RELOAD) {
      // console.info("这是一个刷新页面的操作");
    } else {
      localStorage.removeItem("mapList");
    }
  },

  destroyed() {
    localStorage.clear();
  },
};
</script>

<style></style>
