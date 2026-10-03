from functools import wraps
from rest_framework.response import Response
from rest_framework import status


def permission_required(permission_field):
    def decorator(func):
        @wraps(func)
        def wrapper(request, *args, **kwargs):
            user = request.user
            if not user.is_authenticated:
                return Response({'detail': '用户活跃状态过期，请联系管理员激活'}, status=status.HTTP_401_UNAUTHORIZED)
            if not getattr(user, permission_field, False):
                if permission_field.find("is_superuser")>=0:
                    response = fr"此为管理员功能，无权进行操作"
                    return Response({'detail': f'{response}'}, status=status.HTTP_403_FORBIDDEN)
                elif permission_field.find("can_upload_files")>=0:
                    response = fr"文件上传"
                elif permission_field.find("can_download_files")>=0:
                    response = fr"文件下载"
                elif permission_field.find("can_visit_history") >= 0:
                    response = fr"历史数据查询"
                return Response({'detail': f'没有{response}权限，请联系管理员开通'}, status=status.HTTP_403_FORBIDDEN)
            return func(request, *args, **kwargs)
        return wrapper
    return decorator


def any_permission_required(*decorators):
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(request, *args, **kwargs):
            for decorator in decorators:
                decorated_view = decorator(view_func)
                response = decorated_view(request, *args, **kwargs)
                if response.status_code != 403:  # 通过任意一个装饰器就可以继续
                    return response
            return Response({'detail':'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        return _wrapped_view
    return decorator
