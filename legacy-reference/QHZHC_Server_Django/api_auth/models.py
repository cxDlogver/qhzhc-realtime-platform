from django.db import models
import django.utils.timezone as timezone
# Create your models here.

#
# class AppUserAuth(models.Model):
#     Id = models.IntegerField(primary_key=True, verbose_name='ID')
#     UserName = models.CharField(max_length=255, null=True, verbose_name='用户名')
#     Password = models.CharField(max_length=255, null=True,  verbose_name='密码')
#     Role = models.CharField(max_length=255, null=True,  verbose_name='管理等级')
#     Name = models.CharField(max_length=255, null=True,  verbose_name='管理名')
#     Phone = models.CharField(max_length=255, null=True,  verbose_name='电话号码')
#     Company = models.CharField(max_length=255, null=True,  verbose_name='公司名称')
#     authority = models.IntegerField(null=True, verbose_name='用户权限，1-客观预报,'
#                                                                          '2-客观，专项预报,3-客观、专项、业务预报')
#     class Meta:
#         db_table = 'sys_user'

# myapp/models.py

from django.contrib.auth.models import AbstractUser
from django.db import models


class CustomUser(AbstractUser):
    # 基本信息
    phone_number = models.CharField(max_length=15, blank=True, unique=True)
    workplace = models.CharField(max_length=255, blank=True, null=True)

    # 权限字段
    can_upload_files = models.BooleanField(default=False)
    can_download_files = models.BooleanField(default=False)
    can_visit_realtime = models.BooleanField(default=False)
    can_visit_history = models.BooleanField(default=False)

    # 允许为空
    first_name = models.CharField(max_length=30, blank=True, null=True)
    last_name = models.CharField(max_length=30, blank=True, null=True)
    email = models.CharField(max_length=255, blank=True, unique=True)
    is_upload = models.BooleanField(default=False) ### 数据资源上传
    is_load = models.BooleanField(default=False) ### 数据资源下载
    # 新增 user_type 字段
    USER_TYPE_CHOICES = (
        ('student', '学生'),
        ('teacher', '教师'),
        ('enterprise', '企业'),
    )
    user_type = models.CharField(max_length=20, choices=USER_TYPE_CHOICES, default='student')
    class Meta:
        db_table = 'api_auth_customuser'


class Verification(models.Model):
    # 基本信息
    # phone_number = models.CharField(max_length=15, blank=True, null=True)
    # workplace = models.CharField(max_length=255, blank=True, null=True)
    first_name = models.CharField(max_length=30, blank=True, null=True)
    email = models.CharField(
        max_length=255, unique=True, primary_key=True)
    # username = models.CharField(max_length=255,unique=True, primary_key=True)
    verification_code = models.IntegerField(blank=True, null=True)
    ###验证码发送次数
    sendnumber = models.IntegerField(blank=True, null=True)
    ###判断时间
    judge_time = models.CharField(max_length=255,blank=True, null=-True)
    class Meta:
        db_table = 'verification_sys'

