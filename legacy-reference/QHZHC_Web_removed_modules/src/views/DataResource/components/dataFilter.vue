<template>
  <div class="filter-container">
    <div class="box box1"></div>
    <div class="box box2"></div>
    <div class="box box3"></div>
    <div class="box box4"></div>
    <div class="information">
      <div class="combobox combobox1">
        <div class="top">
          时间：
          <el-cascader placeholder="（ex年份可选下来列表）" :options="options"></el-cascader>
        </div>
        <div class="bottom">已选对象1（ex时间）</div>
      </div>
      <div class="combobox combobox2">
        <div class="top">
          变量：
          <el-cascader placeholder="变量可选列表"></el-cascader>
        </div>
        <div class="bottom">已选对象2（ex变量）</div>
      </div>
      <div class="combobox combobox3">
        <div class="top">
          对象：
          <el-cascader placeholder="（ex对象可选列表）"></el-cascader>
        </div>
      </div>
      <div class="combobox combobox4">
        <div class="top">
          变量2：
          <el-cascader placeholder="变量2可选列表"></el-cascader>
        </div>
      </div>
      <div class="refresh">
        <el-button type="primary">
          <i class="el-icon-refresh"></i>
          <span>刷新</span>
        </el-button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      options: [
        {
          value: "zhinan",
          label: "指南",
          children: [
            {
              value: "shejiyuanze",
              label: "设计原则",
              children: [
                {
                  value: "yizhi",
                  label: "一致",
                },
                {
                  value: "fankui",
                  label: "反馈",
                },
                {
                  value: "xiaolv",
                  label: "效率",
                },
                {
                  value: "kekong",
                  label: "可控",
                },
              ],
            },
            {
              value: "daohang",
              label: "导航",
              children: [
                {
                  value: "cexiangdaohang",
                  label: "侧向导航",
                },
                {
                  value: "dingbudaohang",
                  label: "顶部导航",
                },
              ],
            },
          ],
        },
        {
          value: "zujian",
          label: "组件",
          children: [
            {
              value: "basic",
              label: "Basic",
              children: [
                {
                  value: "layout",
                  label: "Layout 布局",
                },
                {
                  value: "color",
                  label: "Color 色彩",
                },
                {
                  value: "typography",
                  label: "Typography 字体",
                },
                {
                  value: "icon",
                  label: "Icon 图标",
                },
                {
                  value: "button",
                  label: "Button 按钮",
                },
              ],
            },
            {
              value: "form",
              label: "Form",
              children: [
                {
                  value: "radio",
                  label: "Radio 单选框",
                },
                {
                  value: "checkbox",
                  label: "Checkbox 多选框",
                },
                {
                  value: "input",
                  label: "Input 输入框",
                },
                {
                  value: "input-number",
                  label: "InputNumber 计数器",
                },
                {
                  value: "select",
                  label: "Select 选择器",
                },
                {
                  value: "cascader",
                  label: "Cascader 级联选择器",
                },
                {
                  value: "switch",
                  label: "Switch 开关",
                },
                {
                  value: "slider",
                  label: "Slider 滑块",
                },
                {
                  value: "time-picker",
                  label: "TimePicker 时间选择器",
                },
                {
                  value: "date-picker",
                  label: "DatePicker 日期选择器",
                },
                {
                  value: "datetime-picker",
                  label: "DateTimePicker 日期时间选择器",
                },
                {
                  value: "upload",
                  label: "Upload 上传",
                },
                {
                  value: "rate",
                  label: "Rate 评分",
                },
                {
                  value: "form",
                  label: "Form 表单",
                },
              ],
            },
            {
              value: "data",
              label: "Data",
              children: [
                {
                  value: "table",
                  label: "Table 表格",
                },
                {
                  value: "tag",
                  label: "Tag 标签",
                },
                {
                  value: "progress",
                  label: "Progress 进度条",
                },
                {
                  value: "tree",
                  label: "Tree 树形控件",
                },
                {
                  value: "pagination",
                  label: "Pagination 分页",
                },
                {
                  value: "badge",
                  label: "Badge 标记",
                },
              ],
            },
            {
              value: "notice",
              label: "Notice",
              children: [
                {
                  value: "alert",
                  label: "Alert 警告",
                },
                {
                  value: "loading",
                  label: "Loading 加载",
                },
                {
                  value: "message",
                  label: "Message 消息提示",
                },
                {
                  value: "message-box",
                  label: "MessageBox 弹框",
                },
                {
                  value: "notification",
                  label: "Notification 通知",
                },
              ],
            },
            {
              value: "navigation",
              label: "Navigation",
              children: [
                {
                  value: "menu",
                  label: "NavMenu 导航菜单",
                },
                {
                  value: "tabs",
                  label: "Tabs 标签页",
                },
                {
                  value: "breadcrumb",
                  label: "Breadcrumb 面包屑",
                },
                {
                  value: "dropdown",
                  label: "Dropdown 下拉菜单",
                },
                {
                  value: "steps",
                  label: "Steps 步骤条",
                },
              ],
            },
            {
              value: "others",
              label: "Others",
              children: [
                {
                  value: "dialog",
                  label: "Dialog 对话框",
                },
                {
                  value: "tooltip",
                  label: "Tooltip 文字提示",
                },
                {
                  value: "popover",
                  label: "Popover 弹出框",
                },
                {
                  value: "card",
                  label: "Card 卡片",
                },
                {
                  value: "carousel",
                  label: "Carousel 走马灯",
                },
                {
                  value: "collapse",
                  label: "Collapse 折叠面板",
                },
              ],
            },
          ],
        },
        {
          value: "ziyuan",
          label: "资源",
          children: [
            {
              value: "axure",
              label: "Axure Components",
            },
            {
              value: "sketch",
              label: "Sketch Templates",
            },
            {
              value: "jiaohu",
              label: "组件交互文档",
            },
          ],
        },
      ],
    };
  },
};
</script>

<style lang="scss" scoped>
/** 下拉框输入框样式 */
:deep(.el-cascader) {
  .el-input {
    background: rgba(94, 116, 153, 0.3);
    .el-input__inner {
      background: transparent;
      box-sizing: border-box;
      border: 1px solid rgba(255, 255, 255, 0.5);
      font: 400 14px "Microsoft YaHei";
      color: #ffffff;
    }
  }
  // 下拉框列表样式——全局样式
}
.filter-container {
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.15);
  box-sizing: border-box;
  border: 1px solid rgba(211, 225, 255, 0.25);
  font: 400 14px "Microsoft YaHei";
  font-variation-settings: "opsz" auto;
  font-feature-settings: "kern" on;
  color: rgba(211, 225, 255, 0.7);
  background: url("../../../assets/imgs/dataBg.png") no-repeat;
  background-position: 100% 100%;
  background-size: 100%;
  align-items: center;
  position: relative;
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
  .information {
    display: flex;
    flex-wrap: wrap;
    overflow: auto;
    justify-content: space-between;
    padding: 10px;
    width: calc(100% - 20px);
    height: calc(100% - 20px);
    .combobox {
      margin-bottom: 10px;
      width: 20%;
      .top {
        width: 100%;
        .el-cascader {
          width: 75%;
        }
      }
      .bottom {
        margin-left: 50px;
        color: #0095ff;
      }
    }
    .refresh {
      .el-button {
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
