<!-- 单个文件详情查询 -->
<template>
    <div class="dataDetails">
        <div class="Information-container">
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
                        <!-- <div class="bottom-box recently-time">
                            审核时间：<span>{{ detailForm.approvedstrtime }}</span>
                        </div> -->
                        <!-- <div class="bottom-box data-descripe">
                            数据描述：<span>对xxx，时间xxxxxx，xxxx，频率xxxx</span>
                        </div> -->
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
                        <el-input type="textarea" class="inputarea" :rows="2"
                            placeholder="请输入可调数据configuration信息：如小数点精度、科学计数显示、flag、ID等" v-model="textarea">
                        </el-input>
                        <!-- <span>（可调数据configuration信息：如小数点精度、科学计数显示、flag、ID等）</span> -->
                    </div>
                </div>
                <div class="download">
                    <el-button type="primary" @click="edit">
                        <!-- <i class="iconfont icon-shuyi_xiazai"></i> -->
                        <span>预览</span>
                    </el-button>
                </div>
            </div>
        </div>
        <div class="table">
            <el-table height="100%" style="width: 100%;" :data="tableData" :row-class-name="tableRowClassName">
                <el-table-column min-width="10" type="index" label="序号"></el-table-column>
                <!-- <el-table-column width="80" prop="datasource" label="数据来源"></el-table-column>
                <el-table-column width="80" prop="username" label="数据作者"></el-table-column>
                <el-table-column prop="fileName" label="文件名称"></el-table-column>
                <el-table-column prop="dataid" label="数据ID"></el-table-column>
                <el-table-column width="160" prop="uploadtime" label="上传时间"></el-table-column> -->
                <el-table-column v-for="item in tableHeader" :key="item" :prop="item" :label="item">
                </el-table-column>
            </el-table>
        </div>
        <div class="data-download">
            <button @click="downloadFile">
                <i class="iconfont icon-shuyi_xiazai"></i>
                <span>数据下载</span>
            </button>
        </div>
    </div>
</template>
<script>
import {
    editConfigres,//配置修改
    fileDownload//单文件下载
} from "../../../api/home";
export default {
    props: {
        fileDetailInfo: {
            type: Object,
        }, //详情数据
    },
    data() {
        return {
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
            textarea: "",//配置信息
            ids: [],//勾选的id
        };
    },
    watch: {
        fileDetailInfo: {
            // deep: true,
            immediate: true,
            handler(newval) {
                this.tableData = []
                if (newval.configure) {
                    this.detailForm = newval.configure;
                    // const keys = Object.keys(newval.data_vals);
                    this.tableHeader = newval.csv[0];
                    var arr = newval.csv.slice(1);
                    arr.map(item => {
                        var a = {};
                        this.tableHeader.map((key, i) => {
                            a[key] = item[i];
                        })
                        this.tableData.push(a)
                    })
                    this.textarea = JSON.stringify(newval.configres)
                    // newval.data_vals.forEach(item => {
                    //     this.tableData.push({ ...item[1], username: this.detailForm.username, fileName: item[0], uploadtime: this.detailForm.uploadtime })
                    // })
                    // console.log(newval, "表格", this.tableData)
                } else {
                    this.detailForm = {
                        datasetname: "-",
                        username: "-",
                        datasource: '-',
                        uniqueid: "-",
                        approvedstrtime: "-",
                    }
                }

            },
        },
    },
    methods: {
        tableRowClassName({ rowIndex }) {
            return rowIndex % 2 === 0 ? "row-even" : "row-odd";
        },
        // 文件下载
        downloadFile() {
            var userform = JSON.parse(localStorage.getItem('userform'));
            const downloadFlag = userform.is_load;
            var formData = new FormData();
            formData.append("uniqueid", this.$parent.uniqueid);
            formData.append("filename", this.detailForm.dataname);
            if (!downloadFlag) {
                this.$parent.protocolVisible = true;
                userform = JSON.parse(localStorage.getItem('userform'));
                userform.is_load = true;
                localStorage.setItem('userform', JSON.stringify(userform));
            }
            fileDownload(formData).then(res => {
                let blob = new Blob([res.data])
                let url = window.URL.createObjectURL(blob)
                const link = document.createElement('a') // 创建a标签
                link.href = url
                link.download = this.detailForm.dataname; // 重命名文件
                link.click()
                URL.revokeObjectURL(url) // 释放内存
            })
        },
        edit() {
            // uniqueid【数据集id】: e4db9199 - 1932 - 5430 - 912e-2285ce0c203a
            // json【json字符串】: { "decimal": "10", "scientific": "False" }
            var json = JSON.parse(this.textarea);
            editConfigres({
                uniqueid: this.$parent.uniqueid,
                json: JSON.stringify(json),
                filename: this.detailForm.dataname
            }).then(res => {
                this.$message.success(res.data.message)
            })
        },
    },
};
</script>
<style lang="scss" scoped>
.dataDetails {
    width: 100%;
    height: 100%;
    .Information-container {
        width: 100%;
        height: 215px;
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
                :deep(.el-textarea) {
                    .el-textarea__inner {
                        background-color: transparent;
                        border: none;
                        color: #ffffff;
                    }
                }
                // .inputarea {
                //     background: transparent;
                // }
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
            height: 75px;
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
            height: 130px;
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
    .table {
        margin-top: 10px;
        height: calc(100% - 270px);
        width: 100%;
        :deep(.el-table) {
            width: 100%;
            height: 100%;
            background: transparent;
            overflow-x: auto;
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
        :deep(.el-table)::before {
            display: none;
        }
    }
    /** 数据下载按钮 */
    .data-download {
        position: absolute;
        right: 20px;
        bottom: 0px;
        width: 132px;
        height: 46px;
        background: url("../../../assets/imgs/jump.png") no-repeat;
        background-size: 100% 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        button {
            background: transparent;
            border: 0px;
            font-weight: 700;
            font-size: 14px;
            color: #ffffff;
            cursor: pointer;
            i {
                padding-right: 5px;
            }
        }
    }
}
</style>
