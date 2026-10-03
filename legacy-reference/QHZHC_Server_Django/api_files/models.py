from django.db import models


# Create your models here.
class File_information(models.Model):
    filename= models.CharField(max_length=255,
                                verbose_name='文件名称')
    filedir = models.CharField(max_length=255,
                                verbose_name='dir')
    uploadtime = models.CharField(max_length=255,
                                  verbose_name='最近下载时间')
    filetype = models.CharField(max_length=255,
                                  verbose_name='文件类型')
    is_examine = models.BooleanField(max_length=255,
                                  verbose_name='文件是否经过审核')
    downloadtime = models.CharField(max_length=255,
                                    verbose_name='文件最近下载时间')
    fileid = models.UUIDField(primary_key=True, verbose_name='唯一主键id')
    approvedstrtime= models.CharField(max_length=255,
                                      verbose_name='文件审核时间')
    username = models.CharField(max_length=255,
                                       verbose_name='上传作者', default='default_username')
    datasource = models.CharField(max_length=255,
                                   verbose_name='数据资源', default='default_source')

    filedescrib = models.CharField(max_length=255,
                                   verbose_name='文件审核时间', default='default_filedescrib')
    uniqueid = models.CharField(max_length=255,
                                verbose_name= '以unique sequence指定的uuid', default='default_filedescrib')


    class Meta:
        db_table = 'file_information'


class AppDatares(models.Model):
    id = models.UUIDField(primary_key=True,
                          verbose_name='主键id')
    titlename = models.CharField(max_length=255,
                               verbose_name='标题名称')
    filepath = models.CharField(max_length=255,
                                  verbose_name='文件目录')
    ip_port = models.CharField(max_length=255,
                                verbose_name='替换的ip地址')
    filetype = models.CharField(max_length=255,
                                  verbose_name='文件类型')
    describtion = models.CharField(max_length=255,
                                verbose_name='描述')
    author = models.CharField(max_length=255,
                                  verbose_name='作者')
    filetime = models.CharField(max_length=255,
                              verbose_name='文件时间')
    fileurl = models.CharField(max_length=255,
                                verbose_name='文件链接')
    htmlpath = models.CharField(max_length=255,
                                verbose_name='html链接')
    pngpath = models.CharField(max_length=255,
                                   verbose_name='图片路径')
    is_exterlinks = models.BooleanField(verbose_name='判断是否为外部链接')
    class Meta:
        db_table = 'api_datares'



class Appexpert(models.Model):
    id = models.UUIDField(primary_key=True,
                          verbose_name='主键id')
    maininfo = models.CharField(max_length=2000,
                               verbose_name='主要信息')
    homepage = models.CharField(max_length=2000,
                               verbose_name='主页')
    address = models.CharField(max_length=255,
                                verbose_name='通讯邮箱地址')
    imageurl = models.CharField(max_length=255,
                                   verbose_name='图片')
    datatype = models.CharField(max_length=255,
                                   verbose_name='类型')
    insertime = models.DateField(verbose_name='日期时间')
    expertname = models.CharField(max_length=255,
                                  verbose_name='专家名称')
    direction = models.CharField(max_length=255,verbose_name="研究方向")
    class Meta:
        db_table = 'expertmation'


class HomepageImage(models.Model):
    # 模型字段必须与表字段完全一致
    image_url = models.CharField(max_length=255)  # 对应表中的 image 字段
    uploaded_at = models.DateTimeField(auto_now_add=True)  # 对应表中的 uploaded_at 字段
    description = models.TextField(blank=True, null=True)  # 可选字段

    class Meta:
        db_table = 'api_homepage_image'


## 主页图片
class Homepage(models.Model):
    # 模型字段必须与表字段完全一致
    id = models.UUIDField(primary_key=True,
                          verbose_name='主键id')
    filedescire = models.CharField(max_length=255,
                                verbose_name='文件描述')
    ip_port = models.CharField(max_length=255,
                               verbose_name='替换的ip地址')
    pngpath = models.CharField(max_length=255,
                               verbose_name='图片路径')
    serial_number = models.IntegerField(verbose_name='图片序号')
    filetime = models.CharField(max_length=255,
                                verbose_name='文件时间')
    fileurl = models.CharField(max_length=255,
                               verbose_name='文件链接')
    is_home_page = models.BooleanField(verbose_name='是否为主页图片')

    class Meta:
        db_table = 'api_home_page'


# from django.db import models
#
# class InformationCenter(models.Model):
#     NEWS_CATEGORIES = (
#         ('news', '新闻动态'),
#         ('expert', '专家观点'),
#         ('research', '科研进展'),
#         ('notice', '通知公告'),
#         ('recruitment', '人才招聘'),
#     )
#
#     title = models.CharField(max_length=255, verbose_name='资讯标题')
#     content = models.TextField(verbose_name='资讯内容')
#     author = models.CharField(max_length=255, verbose_name='作者', blank=True, null=True)
#     published_at = models.DateTimeField(auto_now_add=True, verbose_name='发布时间')
#     image_url = models.CharField(max_length=255, verbose_name='图片链接', blank=True, null=True)
#     is_external_link = models.BooleanField(default=False, verbose_name='是否为外部链接')
#
#     # 新增字段
#     file_url = models.URLField(max_length=500, verbose_name='文件链接', blank=True, null=True)
#     news_category = models.CharField(
#         max_length=20,
#         choices=NEWS_CATEGORIES,
#         default='news',
#         verbose_name='新闻分类'
#     )
#
#     class Meta:
#         db_table = 'information_center'
#
#
#
# class UploadedFile(models.Model):
#     # file = models.FileField(upload_to='uploads/')
#     file = models.FileField(upload_to='')
#     upload_time = models.DateTimeField(auto_now_add=True)
#     file_size = models.BigIntegerField(default=0)  # 存储文件大小（字节）
#     file_name = models.CharField(max_length=255, blank=True, null=True)  # 新增字段
#     @property
#     def get_file_name(self):  # 原file_name属性改为get_file_name
#         return os.path.basename(self.file.name)
#
#     @property
#     def display_file_size(self):
#         size = self.file_size
#         # if size <= 0:
#         #     return "0 B"
#         # # 定义单位转换规则（1024进制）
#         # units = ["B", "KB", "MB", "GB"]
#         # # 计算单位索引（如1KB=1024^1 B，索引为1）
#         # unit_index = int(math.floor(math.log(size, 1024)))
#         # # 防止超出最大单位（GB）
#         # unit_index = min(unit_index, len(units)-1)
#         # # 转换为对应单位的数值（保留2位小数）
#         # converted_size = size / (1024 ** unit_index)
#         # return f"{converted_size:.2f} {units[unit_index]}"
#     class Meta:
#         db_table = 'api_files_uploadedfile'
        # for unit in ['B', 'KB', 'MB', 'GB']:
        #     if size < 1024.0:
        #         return f"{size:.2f} {unit}"
        #     size /= 1024.0
        # return f"{size:.2f} TB"
    #
    # @property
    # def display_file_size(self):
    #     size = self.file_size

