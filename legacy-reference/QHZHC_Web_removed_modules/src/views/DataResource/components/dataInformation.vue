<template>
  <div class="Information-container">
    <!-- 基本信息框 -->
    <div class="base-widget widget-style">
      <div class="box box1"></div>
      <div class="box box2"></div>
      <div class="box box3"></div>
      <div class="box box4"></div>
      <div class="information">
        <div class="top">
          <div class="data-title">【A-xxxx数据标题】</div>
          <div class="data-author">数据作者：<span>chenxiang</span></div>
        </div>
        <div class="bottom">
          <div class="bottom-box data-source">数据来源：<span>xxxx</span></div>
          <div class="bottom-box data-id">
            数据ID：<span>A-xxxx-00100 DOL</span>
          </div>
          <div class="bottom-box update-time">
            上传时间：<span>1998年12月29日</span>
          </div>
          <div class="bottom-box recently-time">
            最近更新时间：<span>2024年02月11日</span>
          </div>
          <div class="bottom-box data-descripe">
            数据描述：<span>对xxx，时间xxxxxx，xxxx，频率xxxx</span>
          </div>
        </div>
      </div>
    </div>
    <!-- 配置信息框 -->
    <div class="conf-widget widget-style">
      <div class="configuration">
        <div class="box box1"></div>
        <div class="box box2"></div>
        <div class="box box3"></div>
        <div class="box box4"></div>
        <div class="information">
          <span>（可调数据configuration信息：如小数点精度、科学计数显示、flag、ID等）</span>
        </div>
      </div>
      <div class="download">
        <el-button type="primary">
          <!-- <i class="iconfont icon-shuyi_xiazai"></i> -->
          <span>预览</span>
        </el-button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.Information-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  /* 窗口统一样式 */
  .widget-style {
    background: rgba(0, 0, 0, 0.15);
    box-sizing: border-box;
    border: 1px solid rgba(211, 225, 255, 0.25);
    font: 400 14px "Microsoft YaHei";
    font-variation-settings: "opsz" auto; // 待解决
    font-feature-settings: "kern" on; // 待解决
    color: rgba(211, 225, 255, 0.7);
    .information {
      padding: 10px;
      width: calc(100% - 20px);
      height: calc(100% - 20px);
      overflow: auto;
      span {
        color: #ffffff;
      }
    }
    .box {
      width: 4px;
      height: 4px;
      background: rgba(255, 255, 255, 0.75);
      position: absolute;
    }
    .box1 {
      top: 0;
      left: 0;
    }
    .box2 {
      top: 0;
      right: 0;
    }
    .box3 {
      bottom: 0;
      left: 0;
    }
    .box4 {
      bottom: 0;
      right: 0;
    }
  }
  /* 基本信息框 */
  .base-widget {
    height: calc(40% - 10px);
    margin-bottom: 10px;
    width: 100%;
    position: relative;
    .top {
      display: flex;
      justify-content: space-between;
      .data-title {
        font-size: 18px;
        color: #0095ff;
      }
      .data-author {
        width: 70%;
      }
    }
    .bottom {
      display: flex;
      flex-wrap: wrap;
      margin-top: 10px;
      margin-left: 10px;
      .bottom-box {
        margin-right: 3%;
      }
    }
  }
  /* 配置信息框 */
  .conf-widget {
    height: 65%;
    width: 100%;
    .configuration {
      height: 60%;
      width: 100%;
      background: url("../../../assets/imgs/dataBg.png") no-repeat;
      background-position: 100% 100%;
      background-size: 100%;
      box-sizing: border-box;
      border-top: 0.1px solid transparent;
      border-bottom: 1px solid rgba(211, 225, 255, 0.25);
      position: relative;
    }
    .download {
      height: 40%;
      width: 100%;
      overflow: auto;
      position: relative;
      display: flex;
      justify-content: end;
      align-items: center;
      .el-button {
        margin-right: 10px;
        width: 75px;
        display: flex;
        justify-content: center;
        background: #0095ff;
        span {
          font-weight: 700;
          font-size: 14px;
        }
      }
    }
  }
}
</style>

<script>
export default {};
</script>
