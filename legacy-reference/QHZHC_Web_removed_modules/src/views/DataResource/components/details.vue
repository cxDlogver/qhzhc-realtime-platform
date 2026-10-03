<!-- 数据集详情页面 -->
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
                        <div class="data-title">【{{ detailForm.datasetname }}】</div>
                        <div class="data-author">数据作者：<span>{{ detailForm.username }}</span></div>
                    </div>
                    <div class="bottom">
                        <div class="bottom-box data-source">数据来源：<span>{{ detailForm.datasource }}</span></div>
                        <div class="bottom-box data-id">
                            数据ID：<span>{{ detailForm.uniqueid }}</span>
                        </div>
                        <div class="bottom-box update-time">
                            上传时间：<span>{{ detailForm.uploadtime }}</span>
                        </div>
                        <div class="bottom-box recently-time">
                            审核时间：<span>{{ detailForm.approvedstrtime }}</span>
                        </div>
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
            <el-table height="100%" @selection-change="handleSelectionChange" :data="tableData"
                :row-class-name="tableRowClassName">
                <el-table-column type="selection" width="50"> </el-table-column>
                <el-table-column min-width="10" type="index" label="序号"></el-table-column>
                <el-table-column width="80" prop="datasource" label="数据来源"></el-table-column>
                <el-table-column width="80" prop="username" label="数据作者"></el-table-column>
                <el-table-column prop="fileName" label="文件名称"></el-table-column>
                <el-table-column prop="dataid" label="数据ID"></el-table-column>
                <el-table-column width="160" prop="uploadtime" label="上传时间"></el-table-column>
                <el-table-column width="80" label="操作">
                    <template slot-scope="scope">
                        <el-button @click="handleClick(scope.row)" type="text" size="small">查看</el-button>
                    </template>
                </el-table-column>
            </el-table>
        </div>
        <!-- <div class="page">
            <el-pagination v-if="tableData" @size-change="handleSizeChange" @current-change="handleCurrentChange"
                :page-sizes="[10]" :page-size="10" layout="total, sizes, prev, pager, next,jumper"
                :total="total"></el-pagination>
        </div> -->
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
    batchdownloadFile,//批量文件下载
    editConfigres,//配置修改
} from "../../../api/home";
export default {
    name: "DataResourceDetails",
    props: {
        detailInfo: {
            type: Object,
        }, //详情数据
    },
    data() {
        return {
            tableData: [

            ],
            detailForm: {
                datasetname: "-",
                username: "-",
                datasource: '-',
                uniqueid: "-",
                approvedstrtime: "-",
            },
            textarea: "",//配置信息
            ids: [],//勾选的id
            total: 0,
        };
    },
    watch: {
        detailInfo: {
            // deep: true,
            immediate: true,
            handler(newval) {
                this.tableData = []
                if (newval.uniqueid) {
                    this.detailForm = newval;
                    newval.data_vals.forEach(item => {
                        this.tableData.push({ ...item[1], username: this.detailForm.username, fileName: item[0], uploadtime: this.detailForm.uploadtime })
                    })
                    this.textarea = JSON.stringify(newval.configres);
                    this.total = this.tableData.length;
                } else {
                    this.detailForm = {
                        datasetname: "-",
                        username: "-",
                        datasource: '-',
                        uniqueid: "-",
                        approvedstrtime: "-",
                    }
                    this.total = this.tableData.length;
                }
            },
        },
    },
    methods: {
        tableRowClassName({ rowIndex }) {
            return rowIndex % 2 === 0 ? "row-even" : "row-odd";
        },
        // 查看详情
        handleClick(row) {
            this.$emit('getFileDetail', row);
        },
        handleSelectionChange(selection) {
            this.ids = selection.map((item) => item.dataid);
        },
        // 文件下载
        downloadFile() {
            var userform = JSON.parse(localStorage.getItem('userform'));
            const downloadFlag = userform.is_load;

            if (this.ids.length > 0) {
                if (!downloadFlag) {
                    this.$parent.protocolVisible = true;
                    userform = JSON.parse(localStorage.getItem('userform'));
                    userform.is_load = true;
                    localStorage.setItem('userform', JSON.stringify(userform));
                }
                batchdownloadFile({ fileid: this.ids.toString() }).then(res => {
                    let blob = new Blob([res.data], { type: 'application/zip' })
                    let url = window.URL.createObjectURL(blob)
                    const link = document.createElement('a') // 创建a标签
                    link.href = url
                    link.download = this.detailForm.datasetname + '.zip' // 重命名文件
                    link.click()
                    URL.revokeObjectURL(url) // 释放内存
                })
            } else {
                this.$message.warning("请选择想要下载的文件！")
            }

        },
        //修改配置信息
        edit() {
            // uniqueid【数据集id】: e4db9199 - 1932 - 5430 - 912e-2285ce0c203a
            // json【json字符串】: { "decimal": "10", "scientific": "False" }
            var json = JSON.parse(this.textarea);
            editConfigres({
                uniqueid: this.$parent.uniqueid,
                json: JSON.stringify(json)
            }).then(res => {
                this.$message.success(res.data.message)
            })
        },
        // /** 分页条 **/
        // //  分页条数改变
        // handleSizeChange(val) {
        //     console.log(`每页 ${val} 条`);
        //     this.data.data_size = val;
        //     this.getTableDataList();
        // },
        // //  页码改变
        // handleCurrentChange(val) {
        //     console.log(`当前页: ${val}`);
        //     this.data.page_number = val;
        //     this.getTableDataList();
        // },
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
                justify-content: flex-start;
                .data-title {
                    font-size: 18px;
                    color: #0095ff;
                }
                .data-author {
                    // width: 70%;
                    margin-left: 8px;
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
                height: calc(100% - 67px) !important;
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
    .page {
        :deep(.el-pagination) {

            padding: 15px;
            width: 100%;

            .el-pagination__total {
                color: #d3e1ff;
            }
            .el-input__inner {
                background: rgba(211, 225, 255, 0.22);
            }
            .btn-prev,
            .el-pager,
            .btn-next,
            .number {
                background: transparent;
                color: rgb(192, 196, 204);
            }
            .number.active {
                color: rgb(64, 158, 255);
            }
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
