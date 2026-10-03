<!-- 数据协议阅读 -->
<template>
  <el-dialog :visible.sync="dialogVisible" top="0" :fullscreen="fullScreen" width="980px">
    <!-- 标题的具名插槽 -->
    <template slot="title">
      <div class="header-widget">
        <div class="title-widget">
          <span class="title">{{ type }}</span>
        </div>
        <div class="icon-widget">
          <i class="el-icon-minus" @click="toMinusScreen"></i>
          <i v-if="!fullScreen" class="iconfont icon-quanping" @click="toFullScreen"></i>
          <i v-if="fullScreen" class="el-icon-arrow-down" @click="toFullScreen"></i>
          <!-- <i class="iconfont icon-bg-close" @click="toCloseScreen"></i> -->
        </div>
      </div>
    </template>
    <!-- dialog-主体 -->
    <div class="upload-container">
      <!-- 数据使用协议 -->
      <div class="protocol-content" v-if="type == '数据使用协议'">
        <h2 style="text-align: center">
          <span style="color: #0095ff; font-size: 16px; line-height: 40px"><strong>温室气体监测和计量平台数据使用协议</strong></span>
        </h2>
        <p style="text-indent: 21pt; text-align: left">
          <span
            style="color: #fff">数据使用者（下称用户）使用温室气体监测和计量平台提供的数据产品之前，请务必仔细阅读并同意本协议。用户使用直接从本平台获取或从其他途径获取的本平台数据的行为，都将被视作无条件接受本协议所涉及全部内容。若用户对本协议的任何条款有异议，请停止使用本平台及平台数据。协议一经变动，将在相关页面提示修改内容；用户如不同意协议的修改版本，应放弃继续访问平台及使用本平台提供的任何数据、产品和服务；用户如在协议修改后继续访问平台或使用平台数据，则视为已经接受修改后的协议。</span>
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          1.
          温室气体监测和计量平台致力于提供高质量的温室气体监测数据，我们不对任何因使用我们的平台而产生的法律风险负责，数据使用者不得使用从平台获取的数据资料从事危害国家安全、社会公共利益和他人合法权益的活动。平台对于数据使用者基于数据所得出的任何结果和言论不承担任何责任。
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          2.
          平台所监测数据受监测方式、自然环境、气候等情况会发生波动。因此，使用从本平台获取的数据所产生的不当后果由用户自行承担。
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          3.
          我们将尽力保护用户的隐私。但是，由于网络的开放性，我们无法保证用户的信息绝对安全。因此，用户在使用平台时，应谨慎处理自己的个人信息。
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          4.
          如果平台出现任何技术问题，我们将尽快修复。但是，我们不对由此造成的任何损失负责。
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          5.
          在会议报告、论文发表等各种方式使用本平台数据时，（1）需致谢温室气体监测和计量平台；（2）发表论文时需引用数据提供者的相关研究成果。具体引用方式请邮箱联系xuchun@tsinghua.edu.cn、xuchunmeraki@163.com
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          6.
          本平台提供的数据仅供非商业用途使用，未经温室气体监测和计量平台书面授权之前，任何单位和个人不得将数据用于商业用途。商业机构使用本平台数据的行为均被视为商业用途，需事先获得本平台团队书面授权。申请将本平台数据用于商业用途或商业机构申请使用本平台数据请使用单位邮箱联系：<u>xuchun@tsinghua.edu.cn、xuchunmeraki@163.com</u>
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          7. 本平台数据不得用于司法途径且平台不对由此产生的任何后果负责。
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          8.
          用户保证只将平台授权使用的数据资料用于本人的研究，不得私自有偿、无偿向第三方转让本平台数据及网站账号，用户应自行承担因违反此要求而导致的责任。本平台团队保留追究上述行为人法律责任的权利。
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          9.
          用户在使用数据过程中需保证数据的完整性和独立性。未经本平台团队允许，任何用户不得将从平台获得的数据以原始形式或修改后的形式用于其他数据产品或模型中，对于违反协议的数据使用者，平台有权随时要求其停止对数据的使用和保存。对于其所造成的任何形式的损害，有权进行法律追诉。
        </p>
        <p style="text-indent: 21pt; text-align: left; color: #d3e1ff">
          10.
          对本协议的解释、修改及更新权均属于本平台团队所有。本平台数据产品会进行定期更新，请注册用户直接从平台下载，以获取最新版本信息。请用户妥善保管自己的账号、密码及其他注册资料，如果发现账号被盗用或者其他安全问题，请立即联系本平台工作人员进行处理。本平台将不承担由于用户自身原因导致的账号和密码泄露、丢失或其他安全问题所造成的损失。
        </p>
      </div>
      <!-- 数据上传协议 -->
      <div class="protocol-content" v-if="type == '数据上传协议'">
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
      <div class="agreen-box">
        <!-- <div class="checkbox">
          <el-checkbox v-model="checked"></el-checkbox>
        </div> -->
        <div class="agreen-msg">
          <span v-if="type == '数据上传协议'" @click="type = '数据使用协议'">
            《数据使用协议》
          </span>
          <span v-if="type == '数据使用协议'" @click="type = '数据上传协议'">
            《数据上传协议》
          </span>
        </div>
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
  props: {
    methodType: { type: String }
  },
  data() {
    return {
      fullScreen: false,
      dialogVisible: true, //弹窗是否显示
      type: "数据使用协议", //协议类型
      checked: true, //是否同意协议
    };
  },
  mounted() {
    if (this.methodType == 'use') {
      this.type = "数据使用协议";
    } else {
      this.type = "数据上传协议";
    }
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
          height: calc(100% - 30px);
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
        .agreen-box {
          width: 100%;
          height: 30px;
          .agreen-msg {
            margin-top: 10px;
            cursor: pointer;
            color: #0095ff;
          }
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
