
from django.urls import path
from .views import *

urlpatterns = [
    ### 用户注册
    path('register/', RegisterView.as_view(), name='register'),
    ### 发送验证码
    path('eamil_code/', sendemailregist, name='eamil_code'),
    #### 用户登录
    path('login/', LoginView.as_view(), name='login'),
    path('session/', SessionView.as_view(), name='session'),
    path('logout/', LogoutView.as_view(), name='logout'),
    #### 用户查找
    path('admin/find/', UserQueryView, name='find_user'),
    #### 用户列表
    path('admin/list/', UserListView, name='user_list'),
    #### 用户删除 #####
    # path('admin/delete/<str:username>/', UserDeleteView, name='user_delete'),  # 删除的用户名放在url里
    path('admin/delete/', UserDeleteView, name='user_delete'),  # 删除的用户名放在url里
    # path('admin/update_permissions/<str:username>/', UpdateUserPermissions, name='user_update_permissions'),  # 删除的用户名放在url里
    #### 用户权限更改
    path('admin/update_permissions/', UpdateUserPermissions, name='user_update_permissions'),
    #### 用户信息更改
    path('user/update_detail/', UpdateUserDetail, name='user_update_detail'),
    #### 用户密码修改
    path('user/update_passwd/', UpdateUserPasswd, name='user_update_passwd'),
]
