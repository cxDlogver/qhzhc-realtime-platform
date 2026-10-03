<!-- 图片管理 -->
<template>
    <div class="img-content">
        <el-row class="control">
            <!-- <el-tabs v-model="activeName" @tab-click="handleClick">
                <el-tab-pane label="未使用" name="first">未使用</el-tab-pane>
                <el-tab-pane label="当前展示" name="second">当前展示</el-tab-pane>
            </el-tabs> -->
            <div class="tabs">
                <div :class="activeName == 'second' ? 'tab-li active' : 'tab-li'" @click="handleClick('second')">当前展示
                </div>
                <div :class="activeName == 'first' ? 'tab-li active' : 'tab-li'" @click="handleClick('first')">禁用图片
                </div>

            </div>
            <el-button type="primary" @click="openUpload">上传</el-button>
        </el-row>
        <div class="table-list">
            <el-table :data="tableData" highlight-current-row :row-class-name="tableRowClassName">
                <el-table-column width="60" type="index" label="序号"></el-table-column>
                <el-table-column min-width="25" prop="pngpath" label="图片">
                    <template slot-scope="scope">
                        <el-image style="width: 150px; height: 100px" :src="scope.row.pngpath" fit="contain"></el-image>
                    </template>
                </el-table-column>
                <el-table-column min-width="20" prop="serial_number" label="排序"></el-table-column>
                <el-table-column min-width="10" label="状态">
                    <template>
                        <el-tag effect="plain" :type="activeName == 'second' ? 'success' : 'danger'">
                            {{ activeName == 'second' ? '正常' : '禁用' }}
                        </el-tag>
                    </template>
                </el-table-column>
                <el-table-column min-width="20" label="操作">
                    <template slot-scope="scope">
                        <el-button size="small" type="primary" @click="openEditDialog(scope.row)">修改</el-button>
                        <el-button size="small" type="warning" v-if="activeName == 'second'"
                            @click="openColseDialog(scope.row)">禁用</el-button>
                    </template>
                </el-table-column>
            </el-table>
        </div>
        <el-dialog title="排序" :visible.sync="dialogVisible" width="30%" :before-close="handleClose">
            <el-form label-width="80px">
                <el-form-item label="排序">
                    <el-input v-model="input" type="number" placeholder="请输入序号"></el-input>
                </el-form-item>
            </el-form>
            <span slot="footer" class="dialog-footer">
                <el-button @click="dialogVisible = false">取 消</el-button>
                <el-button type="primary" @click="submitEdit">确 定</el-button>
            </span>
        </el-dialog>
        <el-dialog title="图片上传" :visible.sync="uploadVisible" width="30%" :before-close="handleCloseUpload">
            <el-form label-width="80px">
                <el-form-item label="图片">
                    <div class="image-upload-wrapper">
                        <el-upload class="avatar-uploader" action="#" :show-file-list="false"
                            :on-change="handleAvatarChange" :before-upload="beforeAvatarUpload">
                            <div v-if="imageUrl" class="avatar-wrapper">
                                <img :src="imageUrl" class="avatar" />
                                <i class="el-icon-close avatar-delete" @click.stop="removeImage"></i>
                            </div>
                            <div v-else class="dashed-upload-box">
                                <i class="el-icon-plus avatar-uploader-icon"></i>
                            </div>
                        </el-upload>
                        <div class="upload-tips">
                            支持JPG、PNG格式，文件大小不超过10MB
                        </div>
                    </div>
                </el-form-item>
            </el-form>
            <span slot="footer" class="dialog-footer">
                <el-button @click="uploadVisible = false">取 消</el-button>
                <el-button type="primary" @click="submitUpload">确 定</el-button>
            </span>
        </el-dialog>
    </div>
</template>
<script>
import {
    gethomepage,
    uphomepage,
    replace_homepng
} from '@/api/home'
export default {
    data() {
        return {
            tableData: [],
            dialogVisible: false,
            input: null,
            id: "",
            activeName: "second",
            imageUrl: "",//图片地址
            file: null,
            uploadVisible: false,//上传
        }
    },
    mounted() {
        this.handleClick(this.activeName);
    },
    methods: {
        handleAvatarChange(file) {
            this.file = file.raw;
            const reader = new FileReader();
            reader.onload = e => {
                this.imageUrl = e.target.result;
                // this.$refs.newsForm.validateField('image');
            };
            reader.readAsDataURL(file.raw);
        },
        removeImage() {
            this.imageUrl = '';
            this.file = null;
            // this.$refs.newsForm.validateField('image');
        },
        beforeAvatarUpload(file) {
            const isJPG = file.type === 'image/jpeg' || file.type === 'image/png';
            const isLt10M = file.size / 1024 / 1024 < 10;
            if (!isJPG) {
                this.$message.error('上传图片只能是 JPG/PNG 格式!');
            }
            if (!isLt10M) {
                this.$message.error('上传图片大小不能超过 10MB!');
            }
            return isJPG && isLt10M;
        },
        // 列表类型切换
        handleClick(value) {
            this.activeName = value;
            if (value == 'first') {
                this.getTableList('False')
            } else {
                this.getTableList('True')
            }
        },
        getTableList(value) {
            gethomepage({ is_home_page: value }).then(res => {
                this.tableData = res.data.record;
            })
        },
        isActive(value) {
            if (value) {
                return "正常"
            } else {
                return "禁用"
            }
        },
        tableRowClassName({ rowIndex }) {
            // Alternating row colors based on index
            return rowIndex % 2 === 0 ? 'row-even' : 'row-odd';
        },
        //弹窗关闭事件
        handleClose() { },
        openEditDialog(row) {
            this.dialogVisible = true;
            this.input = row.serial_number;
            this.id = row.id;
        },
        submitEdit() {
            replace_homepng({ id: this.id, serial_number: this.input }).then(() => {
                this.$message.success("更新成功！")
                this.dialogVisible = false;
                this.getTableList('True');
                this.activeName = 'second';
            })
        },
        //禁用图片
        openColseDialog(row) {
            this.$confirm('是否确认禁用图片,禁用后首页轮播将不展示该图片, 是否继续?', '提示', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning'
            })
                .then(() => {
                    replace_homepng({ id: row.id, is_home_page: 'False' }).then(() => {
                        this.$message.success("更新成功！");
                        this.getTableList('False')
                        this.activeName = 'first';
                    })
                }).catch(() => {
                    this.$message({
                        type: 'info',
                        message: '已取消禁用'
                    });
                });
        },
        // 打开上传弹窗
        openUpload() {
            this.uploadVisible = true;
        },
        // 图片上传事件
        submitUpload() {
            var formData = new FormData();
            formData.append('file', this.file);
            uphomepage(formData).then(() => {
                this.$message.success("上传成功");
                this.uploadVisible = false;
                this.handleClick('first');
            })
        },
    }
}
</script>
<style lang="scss" scoped>
.img-content {
    width: 100%;
    height: 100%;
    border: 1px solid rgba(211, 225, 255, 0.3);
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.15);
    width: 100%;
    padding: 8px;
    .control {
        margin-bottom: 10px;
        text-align: right;
        position: relative;
        .tabs {
            position: absolute;
            width: 400px;
            left: 0;
            text-align: left;
            .tab-li {
                display: inline-block;
                padding: 8px 17.5px;
                background: #0095FF;
                box-sizing: border-box;
                border: 1px solid #0095FF;
                border-radius: 4px;
                margin-right: 8px;
                cursor: pointer;
            }
            .tab-li.active {
                background: #CEE4FF;
                color: #0095FF;
                box-sizing: border-box;
                border: 1px solid #0095FF;
            }
        }
    }
    .table-list {
        height: calc(100% - 60px);
        :deep(.el-table::before) {
            height: 0;
        }
        :deep(.el-table) {
            height: calc(100% - 80px);
            overflow: auto;
            background-color: transparent;
            // .el-table__body-wrapper {
            //   border-bottom: 1px solid rgba(211, 225, 255, 0.7);
            // }
            tr {
                background: transparent;
                height: 60px;
                th {
                    text-align: center;
                    background: transparent;
                    font-weight: 700;
                    font-size: 16px;
                    color: #FFFFFF;
                    border: 0px;
                }
                td {
                    text-align: center;
                    background: transparent;
                    font-weight: 400;
                    font-size: 14px;
                    color: #FFFFFF;
                    border: 1px solid transparent;
                    .el-tag {
                        background: transparent;
                    }
                }
            }
            .row-even {
                background: rgba(94, 116, 153, 0.16);
            }
            .current-row {
                background: linear-gradient(90deg, rgba(0, 149, 255, 0.2) 0%, rgba(94, 116, 153, 0) 100%);
                box-shadow: 1px 0px 4px 0px rgba(0, 149, 255, 0.8) inset;
            }
            .el-table__row:hover {
                background: linear-gradient(90deg, rgba(0, 149, 255, 0.2) 0%, rgba(94, 116, 153, 0) 100%);
            }
        }
    }
    :deep(.el-dialog) {

        border-radius: 6px;
        opacity: 1;
        background: #1F2935;
        box-sizing: border-box;
        border: 1px solid rgba(211, 225, 255, 0.33);
        margin-bottom: 0;
        padding: 0 30px;
        .el-dialog__header {
            color: #FFFFFF;
            .el-dialog__title {
                color: #FFFFFF;
            }
        }
        .el-upload {
            border: 1px dashed rgba(211, 225, 255, 0.3);
            border-radius: 6px;
            cursor: pointer;
            position: relative;
            overflow: hidden;
            width: 200px;
            height: 200px;
            background: transparent;
            margin: 0;
            padding: 0;

            &:hover {
                border-color: #409EFF !important;
            }
        }

        .avatar-uploader-icon {
            font-size: 32px;
            color: #8c939d;
            width: 200px;
            height: 200px;
            line-height: 200px;
            text-align: center;
        }

        .avatar {
            width: 200px;
            height: 200px;
            display: block;
            object-fit: contain;
            border-radius: 4px;
        }
    }
}
</style>
