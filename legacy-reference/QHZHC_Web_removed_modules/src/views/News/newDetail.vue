<!-- 新闻详情 -->
<template>
  <div class="newdetail">
    <div class="news-content" v-if="!id">
      <iframe id="html" :src="htmlUrl" style="background-color: transparent"></iframe>
    </div>
    <!-- <div class="news-content" v-html="newObj.content"></div> -->
  </div>
</template>
<script>
export default {
  data() {
    return {
      newList: [
        {
          id: 1,
          title: "38位院士、500余名专家齐聚！聚焦这些领域！",
          author: "清华大学碳中和研究院",
          time: "2024-08-10 08:00:00",
          content: "",
        },
      ],

      newObj: {},
      htmlUrl: "",
      // id: undefined
    };
  },
  created() {
    this.newObj = this.newList[0];
    this.htmlUrl = this.$route.query.url;
    // this.id = this.$route.query.id;
  },
  methods: {},
};
</script>
<style lang="scss" scoped>
.newdetail {
  width: 80%;
  height: 100%;
  // min-width: 1200px;
  margin: auto;
  background: #242f3e;
  // background: rgba(94, 116, 153, 0.19);
  padding: 20px 40px;
  box-sizing: border-box;
  .news-title {
    font-size: 28px;
    font-weight: bold;
    line-height: 58px;
  }
  .news-msg {
    line-height: 28px;
    color: #b1b1b1;
    span {
      margin-right: 10px;
    }
  }
  .news-content {
    width: 100%;
    height: 100%;
    color: #d3e1ff;

    iframe {
      width: 100%;
      height: 100%;
    }
    #htmlUrl html {
      background: transparent !important;
    }
    strong {
      color: #f0f0f0;
    }
    img {
      width: 700px;
    }
  }
}
</style>
