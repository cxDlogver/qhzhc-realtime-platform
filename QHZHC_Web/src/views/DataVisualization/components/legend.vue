<template>
    <div class="legend">
        <!-- 操作行：具名 slot 供宿主注入额外按钮，始终排在「图例」按钮左侧 -->
        <div class="legend-actions">
            <slot name="actions"></slot>
            <button
                type="button"
                class="button"
                :aria-expanded="String(legendShow)"
                aria-controls="visualization-legend-content"
                @click="legendShow = !legendShow"
            >
                图例
            </button>
        </div>
        <div id="visualization-legend-content" class="legend-box" v-show="legendShow">
            <div class="legend-title"><span>浓度阈值区间</span></div>
            <div class="legend-item" v-for="item in legendList" :key="item.color">
                <div class="color" :style="{ background: item.color }"></div>
                <div class="label">{{ item.label }}</div>
            </div>

        </div>
    </div>
</template>
<script lang="ts">
export default {
    name: "VisualizationLegend",
    props: {
        gasName: {
            type: String,
            default: "",
        },
    },
    data() {
        return {
            legendList: [
                {
                    color: "#00FF44",
                    label: "",
                },
                {
                    color: "#FCFF63",
                    label: "",
                },
                {
                    color: "#FF7B10",
                    label: "",
                },
                {
                    color: "#F90000",
                    label: "",
                },
                {
                    color: "#9900FF",
                    label: "",
                },
                {
                    color: "#ADADAD",
                    label: "异常",
                },
            ],
            legendShow: true,
        }
    },
    computed: {
        gasRanges() {
            const gasData =
                this.$store &&
                this.$store.getters &&
                this.$store.getters.GET_GasData;
            return gasData && this.gasName ? gasData[this.gasName] : [];
        },
    },
    watch: {
        gasName() {
            this.getGasRange();
        },
        gasRanges: {
            deep: true,
            immediate: true,
            handler() {
                this.getGasRange();
            },
        },
    },
    methods: {
        formatRange(range) {
            if (!Array.isArray(range) || range.length < 2) {
                return "未配置";
            }
            const lower = Number(range[0]);
            const upper = Number(range[1]);
            if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
                return "未配置";
            }
            return `${lower}-${upper}`;
        },
        getGasRange(type = this.gasName) {
            const gasData =
                this.$store &&
                this.$store.getters &&
                this.$store.getters.GET_GasData;
            const ranges = gasData && type ? gasData[type] : [];
            this.legendList.slice(0, 5).forEach((item, index) => {
                item.label = this.formatRange(
                    Array.isArray(ranges) ? ranges[index] : undefined,
                );
            });
        }
    }
}
</script>
<style lang="scss" scoped>
.legend {
    height: 240px;
    width: 110px;
    position: absolute;
    /* 操作行：右边缘与容器对齐，注入的按钮自然排在「图例」按钮左侧 */
    .legend-actions {
        position: absolute;
        top: 208px;
        right: 0;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 8px;
    }
    .button {
        width: 73px;
        height: 34px;
        border-radius: 20px;
        opacity: 1;
        background: #0095FF;
        text-align: center;
        line-height: 34px;
        cursor: pointer;
        border: 0;
        color: inherit;
        font: inherit;
    }
    .legend-box {
        width: 110px;
        height: 203px;
        position: absolute;
        background: rgba(18, 35, 54, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.5);
        backdrop-filter: blur(7px);
        box-shadow: 0px 4px 10px 0px rgba(38, 102, 127, 0.3);
        border-radius: 4px;
        overflow: hidden;
        .legend-title {
            height: 29px;
            background: linear-gradient(90deg, #122141 0%, rgba(211, 225, 255, 0) 100%);
            padding: 6px 0;
            box-sizing: border-box;
            span {
                border-left: 3px solid #ffffff;
                font-weight: bold;
                text-indent: 8px;
                padding: 0 0 0 6px;
            }

        }
        .legend-item {
            width: 90px;
            height: 12px;
            margin-top: 14px;
            margin-left: 10px;
            .color {
                width: 22px;
                height: 10px;
                border-radius: 4px;
                float: left;
            }
            .label {
                float: left;
                width: 59px;
                margin-left: 8px;
                height: 12px;
                font-size: 12px;
            }
        }
    }
}
</style>
