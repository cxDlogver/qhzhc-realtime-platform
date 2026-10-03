<!-- 气体数值配置范围 -->
<template>
  <el-dialog :title="dialogTitle" :visible.sync="showFlag" width="742px" @close="cancel">
    <div class="range-form">
      <div class="range-item" v-for="(item, index) in rangeList" :key="index">
        <div class="tip">请输入区间范围</div>
        <div class="range-value">
          <div class="range-color">
            <div :class="'color color' + (index * 1 + 1)"></div>
          </div>
          <div class="range-label">
            <el-row>
              <el-col :span="11">
                <el-input-number
                  v-model="item[0]"
                  size="mini"
                  :controls="false"
                  :step="0.01"
                  :aria-label="`第${index + 1}个区间下界`"
                ></el-input-number>
              </el-col>
              <el-col :span="2" style="text-align: center; line-height: 30px; color: #ffffff">-</el-col>
              <el-col :span="11">
                <el-input-number
                  v-model="item[1]"
                  size="mini"
                  :controls="false"
                  :step="0.01"
                  :aria-label="`第${index + 1}个区间上界`"
                ></el-input-number>
              </el-col>
            </el-row>
          </div>
        </div>
      </div>
    </div>
    <div v-if="validationError" class="validation-error">
      {{ validationError }}
    </div>
    <template slot="footer">
      <div class="footer-widget">
        <el-button class="footer-button" type="primary" @click="submit" size="small">
          <i class="iconfont icon-queding"></i>
          <span>确 定</span>
        </el-button>
        <el-button class="footer-button" @click="cancel" size="small">
          <i class="iconfont icon-guanbi1"></i>
          <span>取 消</span>
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts">
import { validateThresholdRanges } from "../utils/visualizationData";

export default {
  name: "ThresholdRangeConfig",
  props: {
    dialogtitle: {
      type: String,
      default: "",
    },
    gasName: {
      type: String,
    },
  },
  data() {
    return {
      dialogTitle: "CH4气体阈值区间配置",
      showFlag: true,
      rangeList: [],
      validationError: "",
    };
  },

  mounted() {
    this.dialogTitle = this.dialogtitle || `${this.gasName}气体阈值区间配置`;
    const ranges = this.$store.getters.GET_GasData[this.gasName];
    this.rangeList = JSON.parse(JSON.stringify(ranges || []));
  },
  methods: {
    // 取消
    cancel() {
      this.$emit("closeChildDialog");
    },
    // 提交
    submit() {
      try {
        const ranges = validateThresholdRanges(this.rangeList);
        this.$store.commit("SET_GasData", {
          name: this.gasName,
          value: ranges,
        });
        this.validationError = "";
        this.$emit("gasDataChange");
        this.$emit("closeChildDialog");
      } catch (error) {
        this.validationError = error.message;
      }
    },
  },

  watch: {
    gasName: {
      handler(newVal) {
        const numArea = this.$store.getters.GET_GasData;
        this.rangeList = JSON.parse(JSON.stringify(numArea[newVal] || []));
        this.dialogTitle = `${newVal}气体阈值区间配置`;
        this.validationError = "";
      },
    },
  },
};
</script>
<style lang="scss" scoped>
:deep(.el-dialog) {
  background: #1f2935;
  box-sizing: border-box;
  border: 1px solid rgba(211, 225, 255, 0.33);
  font: 400 14px "Microsoft YaHei";
  width: 40%;
  .el-dialog__header {
    height: 40px;
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 25px;

      .icon-widget {
        i {
          font-size: 30px;
          color: rgba(255, 255, 255, 0.3);
          padding: 0 10px;
          cursor: pointer;
        }
      }
    }
    .el-dialog__title {
      color: #ffffff;
    }
  }
  .el-dialog__body {
    padding: 0 20px;
    color: #ffffff;
    .validation-error {
      color: #ff9b9b;
      font-size: 13px;
      margin-bottom: 8px;
    }
    .range-form {
      height: 318px;
      // colorList: ['#00FF44', '#FCFF63', '#FF7B10', '#F90000', '#9900FF', '#ADADAD'],
      .range-item {
        width: calc(50% - 5px);
        height: 90px;
        float: left;
        .tip {
          font-size: 13px;
          color: #ffffff;
          margin-bottom: 6px;
        }
        .range-value {
          width: 100%;
          height: 40px;
          .range-color {
            width: 40px;
            height: 40px;
            background: rgba(22, 29, 38, 0.25);
            border-radius: 6px;
            box-sizing: border-box;
            border: 1px solid rgba(130, 145, 169, 0.25);
            float: left;
            margin-right: 10px;
            .color {
              width: 20px;
              height: 20px;
              border-radius: 4px;
              margin: auto;
              margin-top: 9px;
            }
          }
          .range-label {
            height: 40px;
            width: calc(100% - 70px);
            float: left;
            border-radius: 6px;

            background: rgba(22, 29, 38, 0.25);
            box-sizing: border-box;
            border: 1px solid rgba(130, 145, 169, 0.25);
            padding: 5px 8px;
            color: #ffffff;
            .el-input__inner {
              background: rgba(94, 116, 153, 0.2);
              color: #fff;
              border: 1px solid rgba(94, 116, 153, 0.2);
            }
            .el-input-number {
              width: 100%;
            }
          }
        }
      }
      .range-item:nth-child(2n) {
        margin-left: 10px;
      }
      .color1 {
        background: #00ff44;
      }
      .color2 {
        background: #fcff63;
      }
      .color3 {
        background: #ff7b10;
      }
      .color4 {
        background: #f90000;
      }
      .color5 {
        background: #9900ff;
      }
      .color6 {
        background: #adadad;
      }
    }
  }
  .el-dialog__footer {
    height: 60px;
    .footer-button {
      border-radius: 6px;
      font-size: 14px;
      i {
        margin-right: 5px;
        vertical-align: middle;
      }
    }
  }
}
</style>
