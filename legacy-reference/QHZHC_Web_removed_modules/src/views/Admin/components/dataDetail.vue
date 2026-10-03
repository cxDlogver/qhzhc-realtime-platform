<template>
    <el-dialog :visible.sync="dialogTableVisible" top="0" :fullscreen="fullScreen" width="1200px">
        <!-- 标题的具名插槽 -->
        <template slot="title">
            <div class="header-widget">
                <div class="title-widget">
                    <span class="title">数据详情</span>

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
        <el-container class="upload-container">
            <el-aside class="upload-aside">
                <div class="data-analysis">
                    <div class="title">数据列表</div>
                    <div class="analysis-menu">
                        <div class="data-navigation">
                            <el-menu :default-openeds="defaultOpeneds" @open="handleOpen" @close="handleClose">
                                <el-submenu class="second" v-for="(value, key) in menuList" :key="key"
                                    :index="key + ''">
                                    <template slot="title">
                                        <i :class="isOpen(key + '') ? 'el-icon-minus' : 'el-icon-plus'"></i>
                                        <span>{{ value.datatype }}</span>
                                    </template>
                                    <div class="submenu-body" v-for="(item, id) in value.data_include" :key="item">
                                        <div class="menu-branch">
                                            <div class="branch-one branch"></div>
                                            <div class="branch-two branch"
                                                v-if="!(id == value.data_include.length - 1)"></div>
                                        </div>
                                        <el-menu-item :index="key + '-' + id" @click="getFileDetail(value, item)">
                                            <span>{{ item }}</span>
                                        </el-menu-item>
                                    </div>
                                </el-submenu>
                            </el-menu>
                            <!-- <DataNavigation></DataNavigation> -->
                        </div>
                    </div>
                </div>
            </el-aside>
            <el-main class="upload-main" v-loading="loading" element-loading-text="加载中"
                element-loading-spinner="el-icon-loading" element-loading-background="rgba(0, 0, 0, 0.8)">
                <div class="data-information">
                    <!-- 基本信息框 -->
                    <div class="base-widget widget-style">
                        <div class="box box1"></div>
                        <div class="box box2"></div>
                        <div class="box box3"></div>
                        <div class="box box4"></div>
                        <div class="information">
                            <div class="top">
                                <div class="data-title">【{{ detailForm.dataname }}】</div>
                                <div class="data-author">数据作者：<span>{{ detailForm.user }}</span></div>
                                <div class="data-author">数据类型：<span>{{ detailForm.datatype }}</span></div>
                            </div>
                            <div class="bottom">
                                <div class="bottom-box data-source">数据来源：<span>{{ detailForm.datasource }}</span></div>
                                <div class="bottom-box data-id">
                                    数据ID：<span>{{ detailForm.dataid }}</span>
                                </div>
                                <div class="bottom-box update-time">
                                    上传时间：<span>{{ detailForm.uploadtime }}</span>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>
                <div class="data-preview">
                    <el-table height="100%" :data="tableData" :row-class-name="tableRowClassName"
                        v-show="this.tableHeader.length > 0">
                        <el-table-column min-width="10" type="index" label="序号"></el-table-column>
                        <el-table-column v-for="item in tableHeader" :key="item" :prop="item" :label="item">
                        </el-table-column>
                    </el-table>
                    <p v-show="this.tableHeader.length == 0">暂无数据</p>
                </div>
            </el-main>
        </el-container>
        <!-- 底部具名插槽 -->
        <template slot="footer">
            <div class="footer-widget">
                <el-button class="footer-button" type="primary" @click="submit">
                    <i class="iconfont icon-queding"></i>
                    <span>确 定</span>
                </el-button>
                <el-button class="footer-button" @click="cancel">
                    <i class="iconfont icon-guanbi1"></i>
                    <span>取 消</span>
                </el-button>
            </div>
        </template>
    </el-dialog>
</template>

<script>

import {
    fileview,//文件详情查询
} from "../../../api/home";

export default {

    props: {
        dialogVisible: {
            type: Boolean,
            default: true,
        },
        dialogChanged: {
            type: Function,
        },
        meunData: {
            type: Array
        }
    },
    data() {
        return {
            fullScreen: false,

            dataTitle: [],
            datatype: [],
            tableData: [],
            tableHeader: [],
            detailForm: {
                dataname: "-",
                username: "-",
                datasource: '-',
                dataid: "-",
                uploadtime: "-",
                datatype: '-'
            },
            loading: false,
            menuList: [],//菜单数据
            defaultOpeneds: ['0'],
        }
    },
    computed: {
        dialogTableVisible: {
            get() {
                return this.dialogVisible;
            },
            set(value) {
                this.dialogChanged(value, true);

            }
        }
    },
    mounted() {
        this.dataTitle = this.$parent.dataTitle;
        this.menuList = this.meunData;
        // console.log(this.menuList)
    },
    methods: {
        isOpen(index) {
            const id = this.defaultOpeneds.indexOf(index);
            if (id !== -1) {
                return true;
            } else {
                return false;
            }
        },
        /** 菜单栏展开收起操作 */
        handleOpen(index) {
            this.defaultOpeneds.push(index);
        },
        handleClose(index) {
            const id = this.defaultOpeneds.indexOf(index);
            if (id !== -1) {
                this.defaultOpeneds.splice(id, 1);
            }
        },
        tableRowClassName({ rowIndex }) {
            return rowIndex % 2 === 0 ? "row-even" : "row-odd";
        },


        toMinusScreen() {
            this.dialogTableVisible = false;
        },
        toFullScreen() {
            this.fullScreen = !this.fullScreen;
        },
        toCloseScreen() {

            this.dialogChanged(false, false)
        },
        //
        submit() {
            // if (this.menuList.length < 1) {
            //     this.$message.warning("请上传文件信息！")
            // } else {
            this.dialogChanged(false)
            // }

        },
        // 取消
        cancel() {
            this.dialogChanged(false)
        },
        getFileDetail(item, name) {
            this.loading = true;
            var formData = new FormData();
            formData.append('uniqueid', item.uniqueid);//【数据集id】
            formData.append('filename', name);//【文件名称】
            fileview(formData).then(res => {
                this.loading = false;
                var newval = res.data;
                this.detailForm = newval.configure;
                this.tableHeader = newval.csv[0];
                var arr = newval.csv.slice(1);
                arr.map(item => {
                    var a = {};
                    this.tableHeader.map((key, i) => {
                        a[key] = item[i];
                    })
                    this.tableData.push(a)
                })
            })
        },

    }
}
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
        background: #1F2935;
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
                    color: #FFFFFF;
                    font-variation-settings: "opsz" auto;
                    .title {
                        font-weight: 700;
                        font-size: 20px;
                        vertical-align: bottom;
                        margin-right: 20px;
                    }
                    .subtitle {
                        font-weight: 400;
                        font-size: 14px;
                        color: #BFD7FF;
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
            background: rgba(94, 116, 153, 0.09);
            box-sizing: border-box;
            border: 1px solid rgba(255, 255, 255, 0.02);
            .upload-container {
                height: 100%;
                width: 100%;
                .upload-aside {
                    height: 100%;
                    width: 300px;
                    padding: 10px;
                    margin: 0;

                    .title {
                        height: 30px;
                        width: 100%;
                        line-height: 30px;
                        font-weight: 400;
                        font-size: 14px;
                        color: #FFFFFF;
                        position: relative;

                    }

                    .data-analysis {
                        height: calc(100% - 20px);
                        width: 100%;
                        // margin-top: 20px;
                        .analysis-menu {
                            height: calc(100% - 20px);
                            border-radius: 4px;
                            opacity: 1;
                            background: rgba(94, 116, 153, 0.09);
                            box-sizing: border-box;
                            border: 1px solid rgba(255, 255, 255, 0.02);
                            padding: 0 10px;
                            margin-top: 10px;
                            display: flex;
                            flex-direction: column;
                            justify-content: space-between;
                            .data-navigation {
                                height: 100%;
                                width: 100%;
                                overflow-y: auto;
                                padding-right: 6px;
                                .el-menu {
                                    background-color: transparent;
                                    border: 0px;
                                    .el-submenu {
                                        .el-submenu__title {
                                            height: 35px;
                                            line-height: 35px;
                                            margin-top: 15px;
                                            background: rgba(94, 116, 153, 0.5);
                                            color: #ffffff;
                                            i {
                                                color: #ffffff;
                                            }
                                            span {
                                                font-weight: 500;
                                                font-size: 14px;
                                            }
                                        }
                                        .second .el-submenu__title {
                                            height: 38px;
                                            line-height: 38px;
                                            margin-top: 10px;
                                            background: transparent;
                                            padding-left: 10px !important;
                                            font-size: 14px;
                                        }
                                        .submenu-body {
                                            margin: 0;
                                            padding: 0;
                                            display: flex;
                                            width: 100%;
                                            .menu-branch {
                                                width: 10%;
                                                .branch {
                                                    margin-left: 40%;
                                                    height: 50%;
                                                    width: 50%;
                                                    box-sizing: border-box;
                                                    border-left: 2px solid rgba(94, 116, 153, 0.5);
                                                }
                                                .branch-one {
                                                    border-bottom: 1px solid rgba(94, 116, 153, 0.5);
                                                }
                                                .branch-two {
                                                    border-top: 1px solid rgba(94, 116, 153, 0.5);
                                                }
                                            }
                                        }
                                        .el-menu-item {
                                            width: 90%;
                                            height: 38px;
                                            line-height: 38px;
                                            box-sizing: border-box;
                                            border: 1px solid rgba(255, 255, 255, 0.1);
                                            margin: 6px 0;
                                            color: #ffffff;
                                            font-size: 14px;
                                            font-weight: 400;
                                            position: relative;
                                            span {
                                                margin-left: -20px;
                                            }
                                            .icon-a-shujugengxin1 {
                                                color: rgb(21, 196, 21);
                                                font-size: 14px;
                                                margin-left: 10px;
                                            }
                                            button {
                                                position: absolute;
                                                top: 6px;
                                                opacity: 1;
                                                /* 自动布局 */
                                                display: flex;
                                                flex-direction: row;
                                                justify-content: center;
                                                align-items: center;
                                                padding: 7px 10px;
                                                gap: 4px;
                                                background: rgba(211, 225, 255, 0.1);
                                                box-sizing: border-box;
                                                border: 0.8px solid rgba(211, 225, 255, 0.7);
                                                box-shadow: inset 0px 0px 4px 0px rgba(211, 225, 255, 0.3);
                                                color: #d3e1ff;
                                                cursor: pointer;
                                            }
                                            .meta {
                                                right: 10px;
                                                width: 32px;
                                                height: 24px;
                                            }
                                            .download {
                                                right: 50px;
                                                width: 44px;
                                                height: 24px;
                                                font-weight: 500;
                                                font-size: 12px;
                                            }
                                            .download.full {
                                                background: linear-gradient(119deg, #0095ff 42%, #bfd7ff 100%);
                                            }
                                        }
                                        .el-menu-item:hover {
                                            background: linear-gradient(90deg,
                                                    rgba(0, 149, 255, 0.4) 0%,
                                                    rgba(94, 116, 153, 0) 100%);
                                        }
                                        .el-menu-item.is-active {
                                            background: linear-gradient(90deg,
                                                    rgba(0, 149, 255, 0.4) 0%,
                                                    rgba(94, 116, 153, 0) 100%);
                                            box-sizing: border-box;
                                            border-left: 3px solid #0095ff;
                                            box-shadow: 1px 0px 4px 0px rgba(0, 149, 255, 0.8) inset;
                                        }
                                    }
                                }
                            }

                        }
                    }
                }
                .upload-main {
                    width: calc(100% - 300px) !important;
                    height: 100%;
                    padding-top: 30px;
                    padding-bottom: 0px;
                    .data-information {
                        height: 80px;
                        width: 100%;
                        margin-bottom: 8px;
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
                            height: 80px;
                            margin-bottom: 10px;
                            width: 100%;
                            position: relative;
                            .top {
                                display: flex;

                                .data-title {
                                    font-size: 18px;
                                    color: #0095ff;
                                }
                                .data-author {
                                    margin-left: 10px;
                                    line-height: 24px;
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
                    }
                    .data-preview {
                        height: calc(100% - 90px);
                        width: 100%;
                        border: 1px solid rgba(211, 225, 255, 0.25);
                        box-sizing: border-box;
                        p {

                            height: 100%;
                            line-height: 200px;
                            text-align: center;
                            box-sizing: border-box;
                        }
                        .el-table {
                            width: 100%;
                            height: 100%;
                            background: transparent;
                            .el-table__header-wrapper {
                                // height: 27px;
                                .el-table__header {
                                    background: transparent;
                                    tr {
                                        background: transparent;
                                        th {
                                            background: transparent;
                                            border: 0px;
                                            color: #ffffff;
                                            text-align: center;
                                            padding: 5px 0;
                                            .cell {
                                                font-weight: 700;
                                                font-size: 12px;
                                            }
                                        }
                                    }
                                }
                            }
                            .el-table__body-wrapper {
                                // height: calc(100% - 27px) !important;
                                .el-table__body {
                                    background: transparent;
                                    tr {
                                        background: transparent;
                                        td {
                                            background: transparent;
                                            border: 0px;
                                            color: #ffffff;
                                            text-align: center;
                                            padding: 5px 0;
                                            .cell {
                                                font-weight: 500;
                                                font-size: 12px;
                                            }
                                        }
                                    }
                                    .row-even {
                                        background: rgba(94, 116, 153, 0.16) !important;
                                    }
                                }
                            }
                        }
                        .el-table::before {
                            display: none;
                        }
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
