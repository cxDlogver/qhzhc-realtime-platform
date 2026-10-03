<!-- 数据上传协议 -->
<template>
  <el-dialog :visible.sync="dialogVisible" top="0" :fullscreen="fullScreen" width="980px">
    <!-- 标题的具名插槽 -->
    <template slot="title">
      <div class="header-widget">
        <div class="title-widget">
          <span class="title">数据上传协议</span>
        </div>
        <div class="icon-widget">
          <i class="el-icon-minus" @click="toMinusScreen"></i>
          <i v-if="!fullScreen" class="iconfont icon-quanping" @click="toFullScreen"></i>
          <i v-if="fullScreen" class="el-icon-arrow-down" @click="toFullScreen"></i>
          <i class="iconfont icon-bg-close" @click="toCloseScreen"></i>
        </div>
      </div>
    </template>
    <!-- dialog-主体 -->
    <div class="upload-container">
      <!-- 数据上传协议 -->
      <div class="protocol-content">
        <h2 style="text-align: center">
          <span style="color: #0095ff; font-size: 16px; line-height: 40px"><strong>温室气体监测和计量平台数据上传协议</strong></span>
        </h2>
        <p style="color: #fff; text-align: left">一、协议目的</p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          本数据上传协议（以下简称“协议”）旨在明确用户（以下简称“您”）与温室气体监测和计量平台（以下简称“我们”或“平台”）之间关于上传数据的权利与义务。请您仔细阅读并理解本协议的所有条款，以便在使用我们的服务时做出明智的决定。
        </p>
        <p style="color: #fff; text-align: left">二、数据上传</p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          1.
          您可以将数据上传至我们的平台，包括但不限于数据集、文本、图片、视频、音频和其他数字内容（以下简称“数据”）。
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          2. 您同意仅在遵守本协议条款的前提下上传数据。
        </p>
        <p style="color: #fff; text-align: left">三、数据所有权与许可</p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          1.
          您声明并保证您拥有上传数据的所有权利、权限和许可，包括版权和其他知识产权、并保证数据的绝对真实性。
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          2.
          您授予我们一个非独家的、全球性的、免版税的、可转让的、可再许可的许可，以使用、复制、分发、展示、执行和创建上传数据的衍生作品，以便我们进行科学研究及提供和改进服务。
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          3.
          您同意我们可以在必要时修改、编辑或调整上传数据的格式，以符合平台的技术要求或法律要求。
        </p>
        <p style="color: #fff; text-align: left">四、数据使用</p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          1. 您同意我们可以在以下情况下使用上传的数据：
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          - 提供和维护服务。
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          - 进行数据分析和科学研究。
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          - 采取适当形式推广和宣传数据;
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          - 使用任何方式存储、翻译、复制或转换数据格式。
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          - 遵守法律法规要求。
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          2.我们承诺不会将您的个人数据用于任何与本协议无关的目的，除非获得您的明确同意或法律另有规定。
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          3.平台为每一份存放的数据资料申请独一的数据对象标识符，并在明显的位置提供数据资料的规范引用文本，格式如下：
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          【数据集名称】，【永久标识符】，【作者】，【年份】，温室气体监测和计量平台,
          【版本号】。
        </p>
        <p style="color: #fff; text-align: left">五、数据保护</p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          1.
          我们采取合理的技术和组织措施来保护上传的数据免受未经授权的访问、泄露、丢失或破坏。
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          2.
          尽管我们尽力保护您的数据，但没有任何系统是绝对安全的。因不可抗力造成的损坏，需自行承担潜在风险，上传数据前请做好备份工作。
        </p>
        <p style="color: #fff; text-align: left">六、责任限制</p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          1. 您对上传数据的内容和质量负全部责任。
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          2. 我们不对上传数据的准确性、完整性、可靠性或适用性作出任何保证。
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          3.
          在法律允许的最大范围内，我们对因使用或无法使用上传数据而导致的任何直接、间接、偶然、特殊、惩罚性或后果性损害不承担责任。
        </p>
        <p style="color: #fff; text-align: left">七、协议变更</p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          1. 我们保留随时修改本协议的权利。
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          2. 任何变更将在我们平台上公布，并在公布后立即生效。
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          3. 继续上传数据即表示您接受变更后的协议。
        </p>
        <p style="color: #fff; text-align: left">八、联系我们</p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          如果您对本协议有任何疑问或需要帮助，请通过以下方式联系我们：
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          - 电子邮件：[xuchun@tsinghua.edu.cn、xuchunhabur@163.com]
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          - 邮寄地址：[北京市海淀区清华大学环境学院]
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          请您仔细阅读并理解本协议的所有条款，并在同意后继续上传数据。通过上传数据，您表示您已阅读、理解并同意遵守本协议的所有条款。
        </p>
      </div>
    </div>
    <template slot="footer">
      <div class="footer-widget">
        <el-button class="footer-button" type="primary" @click="toCloseScreen">
          <i class="iconfont icon-queding"></i>
          <span>确 定</span>
        </el-button>
        <!-- <el-button class="footer-button">
            <i class="iconfont icon-guanbi1"></i>
            <span>取 消</span>
          </el-button> -->
      </div>
    </template>
  </el-dialog>
</template>
<script>
export default {
  data() {
    return {
      fullScreen: false,
      dialogVisible: true, //弹窗是否显示
    };
  },
  methods: {
    toMinusScreen() {
      this.dialogTableVisible = false;
    },
    toFullScreen() {
      this.fullScreen = !this.fullScreen;
    },
    toCloseScreen() {
      this.$emit("closeDialog");
      //   this.dialogChanged(false, false);
    },
  },
};
</script>
<style lang="scss" scoped>
/** dialog样式布局 */
.el-dialog__wrapper {
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  :deep(.el-dialog) {
    height: 70%;
    width: 70%;
    border-radius: 6px;
    opacity: 1;
    background: #1f2935;
    box-sizing: border-box;
    border: 1px solid rgba(211, 225, 255, 0.33);
    margin-bottom: 0;
    padding: 0 30px;
    .el-dialog__header {
      height: 10%;
      width: 100%;
      display: flex;
      align-items: center;
      box-sizing: border-box;
      padding: 0;
      /** 自定义的title插槽 */
      .header-widget {
        display: flex;
        justify-content: space-between;
        width: 100%;
        .title-widget {
          color: #ffffff;
          font-variation-settings: "opsz" auto;
          .title {
            font-weight: 700;
            font-size: 24px;
            vertical-align: bottom;
            margin-right: 20px;
          }
          .subtitle {
            font-weight: 400;
            font-size: 14px;
            color: #bfd7ff;
          }
        }
        .icon-widget {
          display: flex;
          align-items: center;
          color: rgba(255, 255, 255, 0.3);
          i {
            margin: 0 17px;
            cursor: pointer;
            font-size: 34px;
          }
        }
      }
      .el-dialog__headerbtn {
        display: none;
      }
    }
    .el-dialog__body {
      height: 80%;
      width: 100%;
      border-radius: 4px;
      padding: 0;
      opacity: 1;
      //   background: rgba(94, 116, 153, 0.09);
      box-sizing: border-box;
      //   border: 1px solid rgba(255, 255, 255, 0.02);
      .upload-container {
        height: 100%;
        width: 100%;
        .protocol-content {
          height: 100%;
          width: 100%;
          background: rgba(94, 116, 153, 0.09);
          border: 1px solid rgba(255, 255, 255, 0.02);
          box-sizing: border-box;
          border-radius: 4px;
          line-height: 32px;
          overflow-y: auto;
          padding: 20px;
          font-size: 15px;
        }
      }
    }
    .el-dialog__footer {
      height: 10%;
      padding: 20px 20px 0 20px;
      .footer-button {
        border-radius: 6px;
        width: 107px;
        height: 40px;
        font-size: 14px;
        i {
          margin-right: 5px;
          vertical-align: middle;
        }
      }
    }
  }
  :deep(.el-dialog.is-fullscreen) {
    height: 100% !important;
    width: 100% !important;
  }
}
</style>
