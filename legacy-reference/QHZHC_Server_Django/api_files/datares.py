'''
content:清华走航车文档中心
designer:Mr.Hu
'''
import datetime
import uuid
# from django.views impor
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from django.http import JsonResponse
from rest_framework import status
from .models import AppDatares, Homepage
from rest_framework.response import Response
from api_auth.decorators import any_permission_required, permission_required
from django.core.paginator import Paginator
from django.db.models import Q
import random

# class DataResource():
## 路径替换
replace_path = fr"/mnt/qhzhc_res/"
ip_port = "http://175.27.170.78:80/"
uploadpng_dir = fr"/mnt/qhzhc_res/picture"
# homepage 主页图片
up_homepagedir = fr"/mnt/qhzhc_res/picture/homepage"
# ### html路径替换
# html_replace_path = fr"/mnt/qhzhc_res/html"
# html_ip_port = "http://175.27.170.78:80/html"
# uploadpng_dir = fr"C:\Users\Administrator\Desktop\testpng"
# 获取对应的uuid的值


def fileinfo2uuid(cstring=None,reprotzone=None):
    # tname:类型名称，fname:文件名称，ctime:文件创建时间
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f'{cstring}_{reprotzone}'))



@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
# @permission_classes([IsAuthenticated])
### 获取新闻资源请求接口
def DataResource(request):
    # news_center = request.POST.get('news_center')
    # if request.method == 'POST':
    resultdict = dict()
    news_center_list = ["论文", "模型算法", "专利软著", "项目",
                        "政策法规"]
    new_centets_result = ['paper', 'model_algorithm', 'Patent_Software_Works',
                          'project', 'Policies_regulations']
    # for i in range(len(news_center_list)):
    #     resultdict[news_center_list[i]] = new_centets_result[i]
    ### 对应的数据集合
    return JsonResponse({f'datatype': news_center_list}, status=status.HTTP_200_OK)


@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['GET'])
# @permission_classes([IsAuthenticated])
######  咨询中心接口请求
def CentreResource(request):
    # news_center = request.POST.get('news_center')
    # if request.method == 'POST':
    #resultdict = dict() 5.新闻动态、专家观点、科研进展、通知公告、人才招聘
    news_center_list = ["新闻动态", "专家观点", "科研进展", "通知公告", "人才招聘"]
    #new_centets_result = ['paper', 'model_algorithm', 'Patent_Software_Works','project', 'Policies_regulations']
    # for i in range(len(news_center_list)):
    #     resultdict[news_center_list[i]] = new_centets_result[i]
    ### 对应的数据集合
    return JsonResponse({f'centretype': news_center_list}, status=status.HTTP_200_OK)


@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
## 新增上传新闻资源的接口
def UploadRess(request):
    filetime = datetime.datetime.now().strftime("%Y-%m-%d")

    if request.POST.get('titlename') ==None or request.POST.get('filetype') ==None or \
        request.POST.get('describtion') ==None or request.POST.get('author') ==None or \
        request.POST.get('fileurl') ==None or request.FILES['file'] ==None:
        return JsonResponse({'error': '标题、文件类型、描述信息、作者、新闻链接，封面图片信息需要填写'},
                            status=status.HTTP_201_CREATED)
    # if request.FILES['file'] !=None:
    file = request.FILES['file']
    file_group = file.name.split('.')[1]
    if request.POST.get("filetime") !=None:
        filetime = request.POST.get('filetime')

    news_center_dict = {'paper': "论文", "model_algorithm": '模型算法', "Patent_Software_Works": "专利软著",
                        'project': '项目', "Policies_regulations": '政策法规', 'News_Dynamics': '新闻动态',
                        "Expert_opinion": "专家观点", "Scientific_research": "科研进展",
                        "Notice_announcement": "通知公告", "Talent_Acquisition": "人才招聘"}
    ##
    titlename = request.POST.get('titlename')
    filetype = news_center_dict[request.POST.get('filetype')]
    describtion = request.POST.get('describtion')
    author = request.POST.get('author')
    fileurl = request.POST.get('fileurl')
    # pngpath = request.POST.get('pngpath')
    id = fileinfo2uuid(fr"{titlename}_{filetype}_{describtion}_{author}_{fileurl}")
    pngpath = fr'{uploadpng_dir}/{id}.{file_group}'
    with open(pngpath, 'wb') as fq:
        for chunk in file.chunks():
            fq.write(chunk)
    new_record = AppDatares.objects.create(
        id=id,
        titlename=titlename,
        filetype=filetype,
        describtion=describtion,
        author=author,
        fileurl=fileurl,
        pngpath=pngpath,
        filetime=filetime,
        is_exterlinks=False,
    )
    ###
    new_record.save()
    return JsonResponse({fr'status': fr"文件信息添加成功"}, status=status.HTTP_200_OK)


@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
# @permission_classes([IsAuthenticated])
###获取特定的html文件展示
def RessourceShow(request):
    news_character = fr"paper"
    data_size = 5  ## 分页条数
    page_number = 1 ### 默认一页
    if request.POST.get('news_character') !=None:
        news_character = request.POST.get('news_character')
    if request.POST.get('page_number') != None:
        page_number = int(request.POST.get('page_number'))
    if request.POST.get('data_size') != None:
        data_size = int(request.POST.get('data_size'))
    news_center_dict = {'paper': "论文", "model_algorithm": '模型算法', "Patent_Software_Works": "专利软著",
                        'project': '项目', "Policies_regulations": '政策法规', 'News_Dynamics': '新闻动态',
                        "Expert_opinion": "专家观点", "Scientific_research": "科研进展",
                        "Notice_announcement": "通知公告", "Talent_Acquisition": "人才招聘"}

    try:
        news_center = news_center_dict[news_character]
        obj = AppDatares.objects.filter(filetype__contains=news_center).values('describtion', 'author', 'filetime',
                                                                               'fileurl', 'titlename', 'filetype',
                                                                               'htmlpath', 'pngpath', 'is_exterlinks').order_by('-filetime')

        paginator = Paginator(obj, data_size)  # 每页显示10个帖子
        flag =False
        try:
            page_obj = paginator.page(page_number)
        except :
            # 如果请求的页码不是整数，返回第一页。
            # 如果请求的页码超出可用的页数，返回最后一页。
            page_obj = paginator.page(paginator.num_pages)
            page_number = paginator.num_pages
            flag = True
        ### 根据时间进行倒序排列
        resultdict = dict()
        templist = list()
        for data in page_obj:
            tempdict = dict()
            tempdict['filetype'] = data['filetype']
            tempdict['titlename'] = data['titlename']
            tempdict['describtion'] = data['describtion']
            tempdict['author'] = data['author']
            tempdict['filetime'] = data['filetime']
            tempdict['fileurl'] = data['fileurl']
            try:
                pngpath = data['pngpath'].replace(replace_path, ip_port)
            except:
                pngpath = data['pngpath']
            tempdict['pngpath'] = pngpath
            tempdict['is_exterlinks'] = data['is_exterlinks'] ### 判断是否为外部链接
            ### 做成一个html
            try:
                tempdict['htmlpath'] = data['htmlpath'].replace(replace_path, ip_port)
            except:
                ###对应空的html替换为url文件链接
                tempdict['htmlpath'] = data['fileurl']
            templist.append(tempdict)
            del tempdict
        resultdict['record'] = templist
        resultdict['current_total'] =len(page_obj)
        resultdict['data_total'] = len(obj)
        resultdict['page_number'] = page_number

        if flag:
            resultdict['message'] = fr"末尾页为第{page_number}页"
        return JsonResponse(resultdict, status=status.HTTP_200_OK)
    except:
        return JsonResponse({f'erroe': fr"信息内容获取报错"}, status=status.HTTP_201_CREATED)


### 广泛查询
@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
def widely_search(request):
    news_character = fr"paper"
    data_size = 5  ## 分页条数
    page_number = 1 ### 默认一页
    search_content = fr"中国政府"
    if request.POST.get('news_character') !=None:
        news_character = request.POST.get('news_character')
    if request.POST.get('page_number') != None:
        page_number = int(request.POST.get('page_number'))
    if request.POST.get('data_size') != None:
        data_size = int(request.POST.get('data_size'))
    if request.POST.get('search_content') != None:
        search_content = request.POST.get('search_content')
    datatypedict = {'paper': "论文", "model_algorithm": '模型算法', "Patent_Software_Works": "专利软著",
                    'project': '项目', "Policies_regulations": '政策法规', 'News_Dynamics': '新闻动态',
                    "Expert_opinion": "专家观点", "Scientific_research": "科研进展",
                    "Notice_announcement": "通知公告", "Talent_Acquisition": "人才招聘"}
    try:
        datatype = datatypedict[news_character]
        obj = AppDatares.objects.filter(
            # 第一个条件：三个字段中任意一个包含"考古"
            Q(titlename__contains=search_content) |
            Q(describtion__contains=search_content) |
            Q(author__contains=search_content),
            filetype__contains=datatype).values('describtion', 'author', 'filetime',
                                             'fileurl', 'titlename', 'filetype',
                                            'htmlpath', 'pngpath', 'is_exterlinks').order_by('-filetime')

        paginator = Paginator(obj, data_size)  # 每页显示10个帖子
        flag = False
        try:
            page_obj = paginator.page(page_number)
        except:
            # 如果请求的页码不是整数，返回第一页。
            # 如果请求的页码超出可用的页数，返回最后一页。
            page_obj = paginator.page(paginator.num_pages)
            page_number = paginator.num_pages
            flag = True
        ### 根据时间进行倒序排列
        resultdict = dict()
        templist = list()
        for data in page_obj:
            tempdict = dict()
            tempdict['filetype'] = data['filetype']
            tempdict['titlename'] = data['titlename']
            tempdict['describtion'] = data['describtion']
            tempdict['author'] = data['author']
            tempdict['filetime'] = data['filetime']
            tempdict['fileurl'] = data['fileurl']
            try:
                pngpath = data['pngpath'].replace(replace_path, ip_port)
            except:
                pngpath = data['pngpath']
            tempdict['pngpath'] = pngpath
            tempdict['is_exterlinks'] = data['is_exterlinks']  ### 判断是否为外部链接
            ### 做成一个html
            try:
                tempdict['htmlpath'] = data['htmlpath'].replace(replace_path, ip_port)
            except:
                ###对应空的html替换为url文件链接
                tempdict['htmlpath'] = data['fileurl']
            templist.append(tempdict)
            del tempdict
        resultdict['record'] = templist
        resultdict['current_total'] = len(page_obj)
        resultdict['data_total'] = len(obj)
        resultdict['page_number'] = page_number

        if flag:
            resultdict['message'] = fr"末尾页为第{page_number}页"
        return JsonResponse(resultdict, status=status.HTTP_200_OK)

    except:
        return JsonResponse({f'erroe': fr"信息内容获取报错"}, status=status.HTTP_201_CREATED)

## 获取对应的图片
@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
# @permission_classes([IsAuthenticated]) ### 鉴权
def gethomepage(request):
    is_home_page = False
    if request.POST.get('is_home_page') != None:
        is_home_page = request.POST.get('is_home_page')
    obj = Homepage.objects.filter(is_home_page=is_home_page).values('pngpath', 'filetime', 'filedescire',
                                                            'serial_number', 'id').order_by('-serial_number')
    result = dict()
    result['record'] = list()
    for data in obj:
        tempdict = dict()
        tempdict['id'] = data['id']
        tempdict['pngpath'] = data['pngpath'].replace(replace_path, ip_port)
        tempdict['filetime'] = data['filetime']
        tempdict['serial_number'] = data['serial_number']
        tempdict['filedescire'] = data['filedescire']

        result['record'].append(tempdict)

    return JsonResponse(result, status=status.HTTP_200_OK)

## 主页图片上传
@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
@permission_required('is_superuser')  # 仅允许管理员
## 新增主页图片上传接口
def Uphomepage(request):
    filetime = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # if request.FILES['file'] !=None:
    file = request.FILES['file']
    file_group = file.name.split('.')[1]
    if request.POST.get("filetime") !=None:
        filetime = request.POST.get('filetime')

    filedescire = request.POST.get('filedescire')
    # pngpath = request.POST.get('pngpath')

    # 生成一个范围在 [a, b] 之间的随机整数
    num = random.randint(1, 1000)
    id = fileinfo2uuid(fr"{filedescire}_{filetime}_{num}")
    pngpath = fr'{up_homepagedir}/{id}.{file_group}'
    with open(pngpath, 'wb') as fq:
        for chunk in file.chunks():
            fq.write(chunk)
    new_record = Homepage.objects.create(
        id=id,
        filedescire=filedescire,
        pngpath=pngpath,
        filetime=filetime,
        is_home_page=False,
    )
    ###
    new_record.save()
    return JsonResponse({fr'status': fr"文件信息添加成功"}, status=status.HTTP_200_OK)

@csrf_exempt 
@api_view(['GET'])
# @permission_classes([IsAuthenticated])
def LatestNewsFilter(request):
    """
    获取五类资讯数据整体按时间排序的最新四条记录
    筛选条件：新闻动态、专家观点、科研进展、通知公告、人才招聘
    所有类型混合排序后取最新4条数据
    """
    # 定义需要筛选的五类数据
    news_types = ["新闻动态", "专家观点", "科研进展", "通知公告", "人才招聘"]
    
    try:
        # 构建查询条件：包含任意一种类型的数据
        from django.db.models import Q
        query = Q()
        for news_type in news_types:
            query |= Q(filetype__contains=news_type)
        
        # 查询所有符合条件的数据，按时间倒序排列，取前4条
        obj = AppDatares.objects.filter(query).values(
            'describtion', 'author', 'filetime', 'fileurl', 'titlename', 
            'filetype', 'htmlpath', 'pngpath', 'is_exterlinks'
        ).order_by('-filetime')[:4]
        
        resultdict = dict()
        templist = list()
        
        # 处理查询结果
        for data in obj:
            tempdict = dict()
            tempdict['filetype'] = data['filetype']
            tempdict['titlename'] = data['titlename']
            tempdict['describtion'] = data['describtion']
            tempdict['author'] = data['author']
            tempdict['filetime'] = data['filetime']
            tempdict['fileurl'] = data['fileurl']
            
            # 处理图片路径
            try:
                pngpath = data['pngpath'].replace(replace_path, ip_port)
            except:
                pngpath = data['pngpath']
            tempdict['pngpath'] = pngpath
            tempdict['is_exterlinks'] = data['is_exterlinks']
            
            # 处理HTML路径
            try:
                tempdict['htmlpath'] = data['htmlpath'].replace(replace_path, ip_port)
            except:
                # 对应空的html替换为url文件链接
                tempdict['htmlpath'] = data['fileurl']
            
            templist.append(tempdict)
            del tempdict
        
        resultdict['record'] = templist
        resultdict['total_count'] = len(templist)
        resultdict['categories'] = news_types
        resultdict['message'] = f"成功获取最新{len(templist)}条资讯数据"
        
        return JsonResponse(resultdict, status=status.HTTP_200_OK)
        
    except Exception as e:
        return JsonResponse({'error': f"获取最新资讯数据失败: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


### 替换图片
@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
@permission_required('is_superuser')  # 仅允许管理员
def replace_homepng(request):

    ## id 和序号
    id = request.POST.get('id')
    ## 将原来封面下掉
    if request.POST.get('is_home_page') != None:
        is_home_page = request.POST.get('is_home_page')
        Homepage.objects.filter(id=id).update(is_home_page=is_home_page)
        return JsonResponse({fr'status': fr"主页滚动图片已下架"}, status=status.HTTP_200_OK)
    else:
        # 替换原来封面图
        if request.POST.get('serial_number') != None:
            serial_number = int(request.POST.get('serial_number'))
        if serial_number < 0 or serial_number > 6:
            return JsonResponse({f'erroe': fr"序号数字填写错误"}, status=status.HTTP_201_CREATED)
        Homepage.objects.filter(id=id).update(is_home_page=True, serial_number=serial_number)
        return JsonResponse({fr'status': fr"主页图片已经更新"}, status=status.HTTP_200_OK)
