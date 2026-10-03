<template>
  <div class="user-container">
    <el-form :model="form" ref="newsForm" label-width="0" class="news-form" :rules="rules" label-position="top">
      <el-form-item label="新闻类型" prop="type">
        <el-select v-model="form.type" placeholder="请选择新闻类型" style="width: 100%">
          <el-option label="新闻动态" value="News_Dynamics" />
          <el-option label="专家观点" value="Expert_opinion" />
          <el-option label="科研进展" value="Scientific_research" />
          <el-option label="通知公告" value="Notice_announcement" />
          <el-option label="人才招聘" value="Talent_Acquisition" />
        </el-select>
      </el-form-item>
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="作者" prop="author">
            <el-input v-model="form.author" placeholder="请输入作者"></el-input>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="发布时间" prop="date">
            <el-date-picker v-model="form.date" type="date" placeholder="选择日期" style="width: 100%" clearable
              value-format="yyyy-MM-dd"></el-date-picker>
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="标题" prop="title">
        <el-input v-model="form.title" placeholder="请输入标题"></el-input>
      </el-form-item>
      <el-form-item label="链接" prop="link">
        <el-input v-model="form.link" placeholder="请输入链接地址" prefix-icon="el-icon-link"
          style="width: 100%; padding-left: 8px;"></el-input>
      </el-form-item>
      <el-form-item label="图片" prop="imageUrl">
        <div class="image-upload-wrapper">
          <el-upload class="avatar-uploader" action="#" :show-file-list="false" :on-change="handleAvatarChange"
            :before-upload="beforeAvatarUpload">
            <div v-if="form.imageUrl" class="avatar-wrapper">
              <img :src="form.imageUrl" class="avatar" />
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
      <el-form-item label="摘要" prop="summary">
        <el-input type="textarea" v-model="form.summary" placeholder="请输入文章详情" :rows="4"
          :autosize="{ minRows: 4, maxRows: 4 }"></el-input>
      </el-form-item>
      <el-form-item>
        <div class="form-btn-box">
          <el-button type="primary" @click="submitForm">
            <i class="el-icon-back" style="margin-right: 6px;"></i>发布
          </el-button>
        </div>
      </el-form-item>
    </el-form>
  </div>
</template>

<script>
import { uploadNews } from '@/api/home';
export default {
  name: 'NewsAdmin',
  data() {
    return {
      form: {
        type: '',
        author: '',
        date: '',
        title: '',
        link: '',
        imageUrl: '',
        summary: '',
      },
      file: null,
      rules: {
        type: [{ required: true, message: '请选择新闻类型', trigger: 'change' }],
        author: [{ required: true, message: '请输入作者', trigger: 'blur' }],
        date: [{ required: true, message: '请选择发布时间', trigger: 'change' }],
        title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
        link: [{ required: true, message: '请输入链接', trigger: 'blur' }],
        imageUrl: [{ required: true, message: '请上传图片', trigger: 'change' }],
        summary: [{ required: true, message: '请输入摘要', trigger: 'blur' }],
      },
    };
  },
  methods: {
    handleAvatarChange(file) {
      this.file = file.raw;
      const reader = new FileReader();
      reader.onload = e => {
        this.form.imageUrl = e.target.result;
        this.$refs.newsForm.validateField('image');
      };
      reader.readAsDataURL(file.raw);
    },
    removeImage() {
      this.form.imageUrl = '';
      this.$refs.newsForm.validateField('image');
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
    submitForm() {
      this.$refs["newsForm"].validate((valid) => {

        if (valid) {
          var formData = new FormData();
          formData.append('titlename', this.form.title);//标题
          formData.append('filetype', this.form.type);//文件类型
          formData.append('describtion', this.form.summary);//描述内容
          formData.append('author', this.form.author);//作者
          formData.append('fileurl', this.form.link);//链接
          formData.append('file', this.file);//图片
          formData.append('filetime', this.form.date);//时间
          uploadNews(formData).then(() => {
            this.$message.success("发布成功");
            this.form = {
              type: '',
              author: '',
              date: '',
              title: '',
              link: '',
              imageUrl: '',
              summary: '',
            };
            this.file = null;
          })
          // this.$message.success('发布成功');
        }
      });
    },
    goBack() {
      this.$router.push({ path: "/" });
    },
  },
};
</script>

<style lang="scss" scoped>
.user-container {
  width: 100%;
  height: 100%;
  position: relative;

  .news-form {
    position: static;
    // margin-left: 320px;
    // margin-right: 0;
    margin: auto;
    width: auto;
    max-width: 900px;
    top: auto;
    left: auto;
    right: auto;
    z-index: 10;
    background: transparent;
    box-shadow: none;
    border-radius: 0;
    padding: 10px 0 10px 0;

    .el-form-item__label {
      color: #d3e1ff;
      font-size: 16px;
      padding-bottom: 6px;
    }

    :deep(.el-input),
    :deep(.el-textarea),
    :deep(.el-select),
    :deep(.el-date-editor) {

      .el-input__inner,
      .el-textarea__inner {
        background-color: transparent !important;
        border: 1px solid rgba(211, 225, 255, 0.3) !important;
        color: #FFF !important;
        box-shadow: none !important;
        border-radius: 4px !important;
        height: 44px !important;
        line-height: 44px !important;
        padding: 0 16px !important;

        &::placeholder {
          color: #6c7a99 !important;
          opacity: 1 !important;
        }
      }

      &:hover .el-input__inner,
      &:hover .el-textarea__inner {
        border-color: rgba(211, 225, 255, 0.5) !important;
      }

      &.is-focus .el-input__inner,
      &.is-focus .el-textarea__inner,
      .el-input__inner:focus,
      .el-textarea__inner:focus {
        border-color: rgba(0, 149, 255, 0.8) !important;
        outline: none !important;
      }
    }

    :deep(.el-date-editor) {
      .el-input__inner {
        padding-left: 36px !important;
      }

      .el-input__icon {
        left: 10px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        position: absolute !important;
      }
    }

    .el-form-item {
      margin-bottom: 18px;
    }

    .el-row {
      width: 100%;
    }

    .el-col {
      padding-right: 0;
    }

    .image-upload-wrapper {
      width: 100%;
      padding: 24px;
      background: rgba(211, 225, 255, 0.05);
      border: 1px solid rgba(211, 225, 255, 0.15);
      border-radius: 6px;
      box-sizing: border-box;

      .avatar-uploader {
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
          transition: border-color 0.2s;
        }

        .el-upload:hover {
          border-color: #409EFF !important;
        }
      }

      .upload-tips {
        color: #6c7a99;
        font-size: 12px;
        line-height: 1.5;
        margin-top: 8px;
      }
    }

    .avatar-uploader {
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

    .avatar-wrapper {
      position: relative;
      display: inline-block;

      .avatar-delete {
        position: absolute;
        top: 4px;
        right: 4px;
        font-size: 20px;
        color: #fff;
        background: rgba(0, 0, 0, 0.5);
        border-radius: 50%;
        cursor: pointer;
        padding: 2px;
        z-index: 2;
        transition: background 0.2s;
      }

      .avatar-delete:hover {
        background: #f56c6c;
      }
    }

    .dashed-upload-box {
      width: 200px;
      height: 200px;
      border: 2px dashed #8c939d;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      transition: border-color 0.2s;
    }

    .dashed-upload-box:hover {
      border-color: #409EFF;
    }

    .form-btn-box {
      display: flex;
      justify-content: flex-end;
      width: 100%;
      margin-top: 20px;
    }
  }

  @media (max-width: 900px) {
    .news-form {
      margin-left: 0;
      margin-right: 0;
      max-width: 98vw;
      width: 98vw;
      padding: 0 1vw;
    }
  }
}
</style>

<style>
.el-select-dropdown {
  background: #101a2a !important;
  color: #d3e1ff !important;
  border: 1px solid rgba(211, 225, 255, 0.2) !important;
}

.el-select-dropdown__item {
  background: #101a2a !important;
  color: #d3e1ff !important;
}

.el-select-dropdown__item:hover,
.el-select-dropdown__item.hover {
  background: #22304a !important;
  color: #fff !important;
}

.el-select-dropdown__item.selected {
  background: #22304a !important;
  color: #fff !important;
  border-left: 3px solid #0095FF !important;
}

.el-scrollbar__wrap,
.el-scrollbar__view {
  background: #101a2a !important;
}

.el-select-dropdown__list {
  background: #101a2a !important;
}

.el-input__inner,
.el-textarea__inner,
.el-select .el-input__inner,
.el-date-editor .el-input__inner {
  text-align: left !important;
}
</style>
