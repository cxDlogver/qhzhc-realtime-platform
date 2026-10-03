import pytz
from django.utils import timezone
from rest_framework import serializers
from .models import CustomUser


class CustomUserSerializer(serializers.ModelSerializer):
    # 返回给前端的时间格式调整
    last_login = serializers.DateTimeField(format="%Y-%m-%d %H:%M:%S", required=False, read_only=True)
    user_type = serializers.ChoiceField(choices=CustomUser.USER_TYPE_CHOICES, required=True)

    # 用first_name来代表名字，不用last_name
    class Meta:
        model = CustomUser
        fields = ['username', 'password', 'first_name', 'email', 'phone_number', 'workplace', 'last_login',
                  'is_active', 'can_visit_realtime', 'can_visit_history', 'can_download_files',
                  'can_upload_files', 'user_type'
                  ]
        extra_kwargs = {'password': {'write_only': True},
                        'first_name': {'required': False, 'allow_blank': True},
                        # 'email': {'required': True, 'allow_blank': False},
                        # 'phone_number': {'required': True, 'allow_blank': False},
                        # 'username': {'required': True, 'allow_blank': False},
                        # 'workplace': {'required': True, 'allow_blank': False},
                        }

    def create(self, validated_data):
        # 移除权限字段，防止普通用户注册时设置权限
        validated_data.pop('can_visit_realtime', None)
        validated_data.pop('can_visit_history', None)
        validated_data.pop('can_download_files', None)
        validated_data.pop('can_upload_files', None)
        validated_data.pop('is_superuser', None)
        validated_data.pop('is_active', None)

        # 创建用户
        user = CustomUser.objects.create_user(
            username=validated_data['username'],
            password=validated_data['password'],
            first_name=validated_data.get('first_name'),     # 用first_name字段来存name
            email=validated_data.get('email'),
            phone_number=validated_data.get('phone_number'),
            workplace=validated_data.get('workplace'),
            is_active= True,  # 默认设置为活跃可登录状态，但是其他权限问题待开通
            is_upload= False,   # 设置上传文件未使用标识
            is_load = False,  # 设置下载文件未使用标识
            user_type=validated_data['user_type']
        )
        return user

# 管理员序列化器，可以直接设置用户的权限字段,管理员创建用户时调用，所创建的用户活跃状态默认为t
class AdminUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomUser
        fields = [
            'username', 'password', 'first_name', 'email', 'phone_number', 'workplace',
            'can_visit_realtime', 'can_visit_history', 'can_download_files', 'can_upload_files','user_type'
        ]
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data):
        # 不可以创建管理员账号
        validated_data.pop('is_superuser', None)
        user = CustomUser.objects.create_user(**validated_data)
        return user