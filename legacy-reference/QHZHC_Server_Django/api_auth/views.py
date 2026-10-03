import pytz
import logging
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.conf import settings
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import permission_classes, api_view
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.contrib.auth import get_user_model
from django.db.models import Q
from api_auth.decorators import permission_required, any_permission_required
from api_auth.serializers import CustomUserSerializer, AdminUserSerializer
from api_auth.models import Verification
from datetime import datetime,timedelta
#### 邮件信息发送
from .verification import send_email
import random

# 导入自定义auth用户模型
User = get_user_model()
logger = logging.getLogger(__name__)


def send_configured_email(to_email, subject, html_content, username):
    smtp_config = (
        settings.QHZHC_SMTP_HOST,
        settings.QHZHC_SMTP_PORT,
        settings.QHZHC_SMTP_USER,
        settings.QHZHC_SMTP_PASSWORD,
    )
    if not all(smtp_config):
        logger.warning("SMTP is not configured; skipped email delivery.")
        return False
    return send_email(
        to_email,
        *smtp_config,
        subject,
        html_content,
        username,
    )



@api_view(['POST'])
@permission_classes([IsAuthenticated])  # 仅允许已认证用户访问
@permission_required('is_superuser')  # 仅允许管理员
def UserCreateView(request):
    # 管理员创建用户接口，可以指定权限字段
    serializer = AdminUserSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response({'message': '用户创建成功'}, status=status.HTTP_200_OK)
    return Response({'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])  # 仅允许已认证用户访问
@permission_required('is_superuser')  # 仅允许管理员
def UpdateUserPermissions(request):
    # 管理员用于设置用户权限的接口，
    try:
        username = request.data.get('username')
        user = User.objects.get(username=username)
        #### 不能修改管理员自身的权限
        if request.user == user:
            return JsonResponse({'error': '管理员自身权限无法修改'}, status=status.HTTP_201_CREATED)
    except User.DoesNotExist:
        return JsonResponse({'error': '用户未找到'}, status=status.HTTP_201_CREATED)

    permission_fields = ['can_upload_files', 'can_download_files', 'is_active',
                         'can_visit_realtime', 'can_visit_history']  # 添加你的权限字段
    data = request.data
    try:
        for field in permission_fields:
            if field in data:
                setattr(user, field, data[field])
        user.save()
    except:
        return JsonResponse({'error': '字段权限不正确，只能为False或True'}, status=status.HTTP_201_CREATED)
    ###发送邮箱通知用户修改信息
    email = user.email
    first_name = user.first_name
    dict_permission = {'True': ['已激活', 'red-text'], True: ['已激活','red-text'],
                       'False': ['待激活', 'green-text'], False: ['待激活','green-text']}
    # print(dict_permission[user.is_active])
    # print(dict_permission[user.can_upload_files])
    html_content = f"""  
       <html>
       <head>  
           <style>  
               .red-text {{  
                   color: red;  
               }}
               .green-text {{ 
                   color: green;  
               }}    
           </style>  
       </head> 
       <body>  
           <p>您好,这是来自清华走航车系统审核状态的通知</p>  
           <p>您的文件上传权限:<span class='{dict_permission[user.can_upload_files][1]}'>{dict_permission[user.can_upload_files][0]}</span>。</p> 
           <p>您的文件下载权限:<span class='{dict_permission[user.can_download_files][1]}'>{dict_permission[user.can_download_files][0]}</span>。</p> 
           <p>您的用户活跃状态:<span class="{dict_permission[user.is_active][1]}">{dict_permission[user.is_active][0]}</span>。</p> 
           <p>您的可视化实时查询权限:<span class="{dict_permission[user.can_visit_realtime][1]}">{dict_permission[user.can_visit_realtime][0]}</span>。</p> 
           <p>您的可视化历史查询权限:<span class="{dict_permission[user.can_visit_history][1]}">{dict_permission[user.can_visit_history][0]}</span>。</p>  
           <p>综上告知，希望您生活愉快。</p>  
       </body>  
       </html>  
       """
    send_configured_email(email, '权限变更通知', html_content, first_name)
    ###########
    return JsonResponse({'message': '权限修改成功'}, status=status.HTTP_200_OK)


#### 用户修改
@api_view(['POST'])
@permission_classes([IsAuthenticated])  # 仅允许已认证用户访问
def UpdateUserDetail(request):

    user = request.user
    username = request.data.get('username')

    # 如果发送请求的是管理员，则可以修改别人的
    if user.is_superuser and username:
        try:
            user_to_update = User.objects.get(username=username)
        except User.DoesNotExist:
            return JsonResponse({"error": "用户未找到"}, status=status.HTTP_201_CREATED)

    # 如果不是管理员，只能改自己的
    else:
        user_to_update = user  # 修改自己的信息

    permission_fields = ['phone_number', 'workplace', 'first_name']  # 需要修改的用户信息参数
    data = request.data
    for field in permission_fields:
        if field in data:
            if data[field] !=None:
                setattr(user_to_update, field, data[field])
    user_to_update.save()
    #### 发送邮件至修改邮箱
    html_content = f"""  
                         <html>
                         <head>  
                             <style>  
                                 .red-text {{  
                                     color: red;  
                                 }}
                             </style>  
                         </head> 
                         <body>  
                             <p>您好,这是来自清华走航车系统用户信息修改通知</p>  
                             <p>您的用户信息已经修改已经完成</p>  
                             <p>修改后您的手机号为:<span class='red-text'>{user_to_update.phone_number}</span>。</p> 
                             <p>修改后您的工作地点为:<span class='red-text'>{user_to_update.workplace}</span>。</p> 
                             <p>修改后您的邮箱地址为:<span class='red-text'>{user_to_update.email}</span>。</p> 
                             <p>修改后您的名称为:<span class='red-text'>{user_to_update.first_name}</span>。</p> 
                         </body>  
                         </html>  
                         """
    try:
        flag = send_configured_email(
            data['email'],
            '用户信息修改通知',
            html_content,
            user_to_update.first_name,
        )
        if flag == False:
            return JsonResponse({'error': '新邮箱地址无效'}, status= status.HTTP_201_CREATED)
        else:
            ## 将邮箱信息进行存储
            if user_to_update.email == data['email']:
                return JsonResponse({'error': '新邮箱地址与原邮箱相同!'}, status=status.HTTP_201_CREATED)
            setattr(user_to_update, 'email', data['email'])
            user_to_update.save()
            return JsonResponse({'message': '用户信息修改成功'}, status= status.HTTP_200_OK)
    except:
        send_configured_email(
            user_to_update.email,
            '用户信息修改通知',
            html_content,
            user_to_update.first_name,
        )
        return JsonResponse({'message': '用户信息修改成功'}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])  # 仅允许已认证用户访问
def UpdateUserPasswd(request):
    # 用户密码更新，如果是管理员可以直接改用户密码
    user = request.user
    username = request.data.get('username')

    # 如果是管理员，允许修改其他用户的密码，不需要验证旧密码
    if user.is_superuser and username:
        try:
            user_to_update = User.objects.get(username=username)
            # 重置密码
            try:
                new_password = '#@QHZHC' + user_to_update.phone_number[-4:]
            except:
                print(f"用户：{username}手机号不存在")
                new_password = '#@QHZHC' + '6789'
            # 验证新密码的有效性
            try:
                validate_password(new_password, user_to_update)
                user_to_update.set_password(new_password)
                user_to_update.save()
                #### 发送短信通知用户
                email = user_to_update.email
                first_name = user_to_update.first_name
                # print(dict_permission[user.is_active])
                # print(dict_permission[user.can_upload_files])
                html_content = f"""  
                      <html>
                      <head>  
                          <style>  
                              .red-text {{  
                                  color: red;  
                              }}
                          </style>  
                      </head> 
                      <body>  
                          <p>您好,这是来自清华走航车系统用户密码修改通知</p>  
                          <p>您的密码重置申请已经通过</p>  
                          <p>您的初始密码为:<span class='red-text'>{new_password}</span>。</p> 
                      </body>  
                      </html>  
                      """
                send_configured_email(email, '密码重置通知', html_content, first_name)
                return Response({'message': '密码重置成功！'}, status=status.HTTP_200_OK)
            except:
                return Response({"error": "新密码必须包含特殊字符，数字，英文字母"}, status=status.HTTP_201_CREATED)
        except User.DoesNotExist:
            return Response({"error": "用户未找到"}, status=status.HTTP_201_CREATED)
    else:
        # 获取传入的数据
        old_password = request.data.get('old_password')
        new_password = request.data.get('new_password')
        if len(new_password) >= 30:
            return Response({'error': '密码长度过长，请控制在30字内!'}, status=status.HTTP_400_BAD_REQUEST)
        #### 用户修改自己的密码
        user_to_update = user  # 修改自己的密码
        # 检查旧密码是否正确
        if not user_to_update.check_password(old_password):
            return Response({"error": "原密码错误"}, status=status.HTTP_200_OK)
        try:
            validate_password(new_password, user_to_update)
            user_to_update.set_password(new_password)
            user_to_update.save()
            email = user_to_update.email
            first_name = user_to_update.first_name
            # print(dict_permission[user.is_active])
            # print(dict_permission[user.can_upload_files])
            html_content = f"""  
                                 <html>
                                 <head>  
                                     <style>  
                                         .red-text {{  
                                             color: red;  
                                         }}
                                     </style>  
                                 </head> 
                                 <body>  
                                     <p>您好,这是来自清华走航车系统用户密码修改通知</p>  
                                     <p>您的密码已修改</p>  
                                 </body>  
                                 </html>  
                                 """
            send_configured_email(email, '密码修改通知', html_content, first_name)
            return Response({'message': '密码修改成功！'}, status=status.HTTP_200_OK)
        except:
            return Response({"error": "新密码必须包含特殊字符，数字，英文字母"}, status=status.HTTP_200_OK)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])  # 仅允许已认证用户访问
@permission_required('is_superuser')  # 仅允许管理员
def UserDeleteView(request):
    # 用户删除接口，以用户名作为标识，通过url传递参数。
    try:
        # 限制管理员把自己给删除
        username = request.data.get('username')
        user_to_delete = User.objects.get(username=username)

        if request.user == user_to_delete:
            return Response({'error': '无法删除当前账号'}, status=status.HTTP_201_CREATED)

        user_to_delete.delete()
        return Response({'message': '删除用户成功！'}, status=status.HTTP_200_OK)

    except User.DoesNotExist:
        return Response({'error': '用户未找到'}, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])  # 仅允许已认证用户访问
@any_permission_required(
    permission_required('is_superuser'),
)
def UserListView(request):
    # 用户list接口，返回系统中所有的用户列表
    users = User.objects.all()

    serializer = CustomUserSerializer(users, many=True)

    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])  # 仅允许已认证用户访问
@permission_required('is_superuser')    # 仅允许管理员
def UserQueryView(request):
    # 查询接口，接受一个参数“q”,字符串，用以模糊匹配，匹配字段包括username，email，phonenumber，first_name
    ### 模糊查询
    query_string = request.query_params.get('q', '')

    if not query_string:
        return Response({'error': '查询参数不能为空'}, status=status.HTTP_400_BAD_REQUEST)

    if request.query_params.get('username'):
        query = (Q(username__contains=query_string))
    elif request.query_params.get('email'):
        query = (Q(email__contains=query_string))
    elif request.query_params.get('phone_number'):
        query = (Q(phone_number__contains=query_string))
    elif request.query_params.get('first_name'):
        query = (Q(first_name__contains=query_string))
    elif request.query_params.get('is_active'):
        query = (Q(is_active__contains=query_string))
    else:
        query = (Q(username__contains=query_string)
                 | Q(email__contains=query_string)
                 | Q(phone_number__contains=query_string)
                 | Q(first_name__contains=query_string)
                 | Q(is_active__contains=query_string)
                 )
    users = User.objects.filter(query)
    if not users.exists():
        return Response({'error': '用户信息不存在'}, status= status.HTTP_201_CREATED)

    serializer = CustomUserSerializer(users, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


class RegisterView(APIView):
    # 用户注册接口，
    permission_classes = [AllowAny]

    def post(self, request):
        password = request.data.get('password')
        # print(password)
        repassword = request.data.get('repassword')
        if password != repassword:
            return Response({'error': '两次输入的密码不一致'}, status=status.HTTP_201_CREATED)
        if len(password) >= 30:
            return Response({'error': '密码长度过长，请控制在30字内!'}, status=status.HTTP_201_CREATED)

        if request.data.get('password') == None or request.data.get('username') == None:
            return Response({'error': '用户名和密码必须填写!'}, status=status.HTTP_201_CREATED)

        if request.data.get('email') ==None or  request.data.get('phone_number') ==None or \
           request.data.get('first_name') == None or request.data.get('workplace') == None  \
            or request.data.get('user_type') == None:
            return Response({'error': '姓名、邮箱、职务、电话号码、工作地点信息需要填写'}, status=status.HTTP_201_CREATED)
        ### 通过验证码判断邮箱信息是否正确;
        # verification_code =11111
        # print(fr"输入验证码{request.data.get('verification_code')}")
        if  request.data.get('verification_code') !=None:
            verification_code = request.data.get('verification_code')  # 获取用户输入的验证码
        username = request.data.get('username')  # 假设你从表单中得到了用户ID
        try:
            Verobj = Verification.objects.get(email=request.data.get('email'))  #获取对应的用户对象
            #### 判断是否超时60s
            judge_time = datetime.strptime(Verobj.judge_time, '%Y-%m-%d %H:%M:%S') + timedelta(minutes=1)
        except:
            return Response({'error': '验证码已重置, 请重新获取!'}, status=status.HTTP_201_CREATED)
        current_time = datetime.today()
        if current_time > judge_time:
            return Response({'error': '验证码超时,请重新获取!'}, status=status.HTTP_201_CREATED)
        try:
            # print(fr"数据库验证码：{int(Verobj.verification_code)}")
            # print(fr"输入验证码：{int(verification_code)}")
            if int(Verobj.verification_code) != int(verification_code):
                return Response({'error': '验证码不正确, 请重新获取!'}, status=status.HTTP_201_CREATED)
        except:
            return Response({'error': '请先获取验证码!'}, status=status.HTTP_201_CREATED)
        serializer = CustomUserSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            html_content = f"""  
                <html>
                <head>  
                    <style>  
                        .red-text {{  
                            color: red;  
                        }}  
                    </style>  
                </head> 
                <body>  
                    <p>您好,这是来自清华走行车的注册信息通知邮件</p>  
                    <p>您的昵称为： <span class="red-text">{request.data.get('first_name')}</span>。</p>  
                    <p>您的用户名为： <span class="red-text">{request.data.get('username')}</span>。</p>
                    <p>您的密码为： <span class="red-text">{request.data.get('password')}</span>。</p>         
                    <p>您的电话号码为： <span class="red-text">{request.data.get('phone_number')}</span>。</p>  
                    <p>您的工作地点是： <span class="red-text">{request.data.get('workplace')}</span>。</p> 
                    <p>您的邮箱为： <span class="red-text">{request.data.get('email')}</span>。</p> 
                    <p>您的职务为： <span class="red-text">{request.data.get('user_type')}</span>。</p>        
                    <p>综上为您的注册信息，请勿泄露，后续相关权限请等待审核~</p>  
                </body>  
                </html>  
                """
            send_configured_email(
                request.data.get('email'),
                '注册信息通知',
                html_content,
                request.data.get('first_name'),
            )
            return Response({'message': '注册信息提交成功，待管理员审核'}, status=status.HTTP_200_OK)
        else:
            ## 判断重复字段
            if User.objects.filter(username=username).exists():
                return Response({'error': '用户名已存在，请修改!'}, status=status.HTTP_201_CREATED)
            elif User.objects.filter(email=request.data.get('email')).exists():
                return Response({'error': '注册邮箱已存在，请修改!'}, status=status.HTTP_201_CREATED)
            elif User.objects.filter(phone_number=request.data.get('phone_number')).exists():
                return Response({'error': '手机号已被注册，请修改!'}, status=status.HTTP_201_CREATED)

@api_view(['POST'])
### 发送邮件鉴证注册信息
def sendemailregist(request):
    if request.data.get('email') == None:
        return Response({'error': '请先填写邮箱等信息'}, status=status.HTTP_201_CREATED)
    first_name = "注册用户001"
    if request.data.get('first_name') != None:
        first_name = request.data.get('first_name')

    ### 发送鉴证信息验证码进行验证
    verification_code = random.randint(100000, 999999)
    judge_time = datetime.today().strftime('%Y-%m-%d %H:%M:%S')
    html_content = f"""  
    <html>
    <head>  
        <style>  
            .red-text {{  
                color: red;  
            }}  
        </style>  
    </head> 
    <body>  
        <p>您好,这是清华走行车官方的验证邮件</p>  
        <p>您的验证码是： <span class="red-text">{verification_code}</span>。</p>  
        <p>请尽快输入以完成验证。</p>  
    </body>  
    </html>  
    """
    flag = send_configured_email(
        request.data.get('email'),
        '验证邮件',
        html_content,
        first_name,
    )
    if flag == False:
        Response({'message': '邮箱信息有误，请检查!'}, status=status.HTTP_201_CREATED)
    ###########为防止恶意注册，同一用户一天只能注册10回
    try:
        #### 更新对应的用户名的实例对象
        permission_fields = ['email', 'verification_code']  # 需要修改的用户信息参数
        data = request.data
        user_to_update = Verification.objects.get(email=request.data.get('email'))
        for field in permission_fields:
            if field in data:
                setattr(user_to_update, field, data[field])
        user_to_update.update(verification_code=verification_code, judge_time=judge_time)
        user_to_update.save()
    except:
        # 创建一个新的Person实例
        verificat = Verification(first_name=first_name, email=request.data.get('email'),
                                 verification_code=verification_code, judge_time=judge_time)
        # 保存数据到数据库
        verificat.save()
    return Response({'message': '验证码已经发送至注册邮箱'}, status=status.HTTP_200_OK)


def profile_payload(user):
    return {
        'phone_number': user.phone_number,
        'workplace': user.workplace,
        'email': user.email,
        'first_name': user.first_name,
        'username': user.username,
        'is_upload': user.is_upload,
        'is_load': user.is_load,
        'is_superuser': user.is_superuser,
        'can_visit_realtime': user.can_visit_realtime,
        'can_visit_history': user.can_visit_history,
    }


class LoginView(APIView):
    # authenticate函数会自动检查用户的is_active状态
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')

        user = authenticate(request, username=username, password=password)
        if user is not None:
            user.last_login = timezone.now()
            user.save(update_fields=['last_login'])
            refresh = RefreshToken.for_user(user)
            response = Response(profile_payload(user), status=status.HTTP_200_OK)
            response.set_cookie(
                settings.QHZHC_ACCESS_COOKIE_NAME,
                str(refresh.access_token),
                max_age=settings.QHZHC_ACCESS_COOKIE_MAX_AGE,
                httponly=True,
                secure=settings.QHZHC_ACCESS_COOKIE_SECURE,
                samesite=settings.QHZHC_ACCESS_COOKIE_SAMESITE,
            )
            get_token(request)
            return response
        ## 判断用户是否活跃
        else:
            try:
                judgeuser = User.objects.get(username=username)
                ### 判断密码是否正确
                if judgeuser.check_password(password):
                    return Response({'error': '审核未通过提示'}, status=status.HTTP_201_CREATED)
                else:
                    return Response({'error': '密码错误'}, status=status.HTTP_201_CREATED)
            except:
                return Response({'error': '用户名错误！'}, status=status.HTTP_201_CREATED)


class SessionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(profile_payload(request.user), status=status.HTTP_200_OK)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(
            settings.QHZHC_ACCESS_COOKIE_NAME,
            samesite=settings.QHZHC_ACCESS_COOKIE_SAMESITE,
        )
        return response


    # 用户更新
    # @api_view(['PUT'])
    # @permission_classes([IsAuthenticated])  # 仅允许已认证用户访问
    # @permission_required('is_superuser')  # 仅允许管理员
    # def user_update_view(request, username):
    #     try:
    #         user = User.objects.get(username=username)
    #     except User.DoesNotExist:
    #         return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
    #
    #     serializer = CustomUserSerializer(user, data=request.data, partial=True)
    #     if serializer.is_valid():
    #         serializer.save()
    #         return Response(serializer.data)
    #     return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    # class RegisterView(APIView):
    #     permission_classes = [AllowAny]
    #
    #     def post(self, request):
    #         username = request.data.get('username')
    #         password = request.data.get('password')
    #         first_name = request.data.get('first_name')
    #         last_name = request.data.get('last_name')
    #         email = request.data.get('email')
    #         phone_number = request.data.get('phone_number')
    #         workplace = request.data.get('workplace')
    #
    #         # # 验证必填字段
    #         # if not all([username, password, first_name, last_name, email, phone_number, workplace]):
    #         #     return Response({'error': 'All fields are required'}, status=status.HTTP_400_BAD_REQUEST)
    #
    #         if not username or not password:
    #             return Response({'error': 'Username and password are required'}, status=status.HTTP_400_BAD_REQUEST)
    #
    #         # 检查用户名是否存在
    #         if User.objects.filter(username=username).exists():
    #             return Response({'error': 'Username already exists'}, status=status.HTTP_400_BAD_REQUEST)
    #
    #         user = User.objects.create_user(
    #             username=username,
    #             password=password,
    #             first_name=first_name,
    #             last_name=last_name,
    #             email=email,
    #             phone_number=phone_number,
    #             workplace=workplace,
    #             is_active=False  # 设置为未批准状态
    #         )
    #         user.save()
    #         return Response({'message': 'User created successfully'}, status=status.HTTP_201_CREATED)
