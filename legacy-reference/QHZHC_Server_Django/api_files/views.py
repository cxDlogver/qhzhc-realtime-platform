import asyncio
import io
import json
import os
import random
import string
from datetime import datetime
import pandas as pd
from django.http import HttpResponse
from django.utils.text import slugify
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from api_auth.decorators import any_permission_required, permission_required
from api_chart.chartdatatrans import connect_to_db
# from django.http import StreamingHttpResponse
from django.http import JsonResponse
from django.http import FileResponse
from django.shortcuts import render
import shutil
from sever_main import settings
from django.http import HttpResponse
from django.conf import settings
from wsgiref.util import FileWrapper
from rest_framework import status
from django.core.paginator import Paginator
### 导入文件信息数据库
from .models import File_information,Appexpert
import zipfile
import os
import numpy as np
from decimal import Decimal

## 专家团队文档主目录
expert_team_dir= fr"/mnt/qhzhc_res/docx/LHYJTD"

def fill_null_new(file_path,encodeing='utf-8'):
    pass


def fill_null(file_path,encodeing='utf-8'):
    result = []
    file_name = os.path.basename(file_path)
    if file_name.find("GPS.txt")>=0:
        # result.append(["可见卫星信息GPGSV/地理定位信息GPGLL/推荐最小定位信息GPRMC/地面速度信息GPVTG/GPS定位信息GPGGA/当前卫星信息GPGSA",
        #                "总的GSV语句电文数/纬度ddmm.mmmm，度分格式/UTC 时间/正北为参考基准的地面航向/UTC 时间/定位模式",
        #                "当前GSV语句号/纬度N（北纬）或S（南纬）/定位状态/磁北为参考基准的地面航向/纬度/定位类型",
        #                "可视卫星总数/经度dddmm.mmmm，度分格式（前导位数不足则补0）/纬度/地面速率/纬度半球/PRN码(第1信道)",
        #                "PRN码/经度E（东经）或W（西经）/纬度半球N/地面速率/经度/PRN码(第2信道)", "仰角/UTC时间，hhmmss.sss格式/经度dddmm.mmmm(度分)格式/模式指示/经度半球/PRN码(第3信道)",
        #                "方位角/状态，A=定位，V=未定位/经度半球E(东经)或W(西经)/null/定位质量指示/PRN码(第4信道)",
        #                "信噪比/校验值（$与*之间的数异或后的值）/地面速率/null/使用卫星数量/PRN码(第5信道)",
        #                "null/null/地面航向/null/水平精确度/PRN码(第6信道)", "null/null/UTC 日期/null/天线离海平面的高度/PRN码(第7信道)","null/null/磁偏角/null/大地水准面高度/PRN码(第8信道)",
        #                "null/null/磁偏角方向/null/差分GPS数据期限(RTCMSC-104)，最后设立RTCM传送的秒数量/PRN码(第9信道)", "null/null/模式指示/null/差分参考基站标号/PRN码(第10信道)",
        #                "null/null/null/null/null/PRN码(第11信道)", "null/null/null/null/null/PRN码(第12信道)",
        #                "null/null/null/null/null/PDOP综合位置精度因子", "null/null/null/null/null/HDOP水平精度因子","null/null/null/null/null/VDOP垂直精度因子",
        #                "null/null/null/null/null/校验值", "标题补充1", "标题补充2", "标题补充3"])
        length = 30
        separator = ','
        # length = len(result[0])
    elif file_name.find("Picaro.txt")>=0:
        # result.append(['Time', 'CavityPressure', 'CavityTemp', 'HP_12CH4',
        #                'HP_12CH4_dry', 'HP_13CH4', 'HR_13CH4', 'Delta_iCH4_Raw',
        #                'HP_Delta_iCH4_Raw', 'HP_Delta_iCH4_30s','HP_Delta_iCH4_2min','HP_Delta_iCH4_5min',
        #                'HR_12CH4','HR_12CH4_dry','HR_Delta_iCH4_Raw','HR_Delta_iCH4_30s','HR_Delta_iCH4_2min',
        #                'HR_Delta_iCH4_5min','ChemDetect', 'H2O', '12CO2','12CO2_dry','13CO2','Delta_Raw_iCO2',
        #                'Delta_30s_iCO2','Delta_2min_iCO2', 'Delta_5min_iCO2', 'CH4','CO2'
        #                ])
        length = 30
        separator = ';'
    elif file_name.find("PRI.txt")>=0:
        # result.append(['Time','CO2', 'H2O', 'N2O',
        #                'CH4', 'C2H6', 'CO', 'T1',
        #                'T2', 'T3','P1','P2',
        #                'P3'
        #                ])
        length = 13
        separator = ','
    elif file_name.find("WindSpeed.txt")>=0:
        # result.append(["标题补充1", "标题补充2", "标题补充3",
        #                '标题补充4', '标题补充5', '标题补充6', '标题补充7',
        #                '标题补充8', '标题补充9'
        #                ])
        length = 9
        separator = ','
    ############修改txt中的数据结构组成
    ziduanlist = [f"字段{i+1}" for i in range(length + 1)]
    result.append(ziduanlist)
    length = len(result[0])
    with open(file_path, 'r', encoding=encodeing) as file:
        for line in file.readlines():
            parts = line.strip().split(separator)
            # parts = ['null' for part in parts if part == '']
            for partindex in range(len(parts)):
                if parts[partindex] == '':
                    parts[partindex] = 'null'
            ### 补齐剩余字段长度
            totallist = parts + ['null'] * (length-len(parts))
            result.append(totallist)
        file.close()
    with open(file_path, 'w', encoding=encodeing) as file:
        for sub_list in result:
            line = ','.join(sub_list) + '\n'
            file.write(line)
        file.close()
    return separator


import uuid
# 获取对应的uuid的值
def fileinfo2uuid(cstring=None,reprotzone=None):
    # tname:类型名称，fname:文件名称，ctime:文件创建时间
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f'{cstring}_{reprotzone}'))


def getFiles(path, suffix):
    return [os.path.join(root, file) for root, dirs, files in os.walk(path) for file in files if file.endswith(suffix)]
############# 数据主题 ##############
@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['GET'])
@permission_classes([IsAuthenticated])
# @any_permission_required(
#     permission_required('is_superuser'),
#
### 获取对应的主题和行业列表
def data_top(request):
    files_dict = {"数据主题": [["外场观测数据", "field_observation_data"],
                                ["卫星数据", "satellite_data"],
                                ["遥感数据", "remote_sensing_data"],
                  ["温室气体清单数据", "greenhouse_gas_inventory_data"],
                  ["同化再分析数据", "assimilation_and_reanalysis_data"],
                  ["实验室数据", "laboratory_data"]],
                  "数据行业分类":[["工业", "industry"], ["农业", "agriculture"], ["运输业", "transportation"], ["能源行业", "energy_industry"],
                  ["环境", "environment"], ["数字与新能源", "digital_and_new_energy"]], "无法解析数据":[["无法解析数据", "nonetype"]]}
    return JsonResponse({'data_center': files_dict})


@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
@permission_classes([IsAuthenticated])
# @any_permission_required(
#     permission_required('is_superuser'),
# )

########## 数据总览 ######
def requiredlist(request):
    # 数据主题
    data_subject = request.POST.get('data_subject')
    # 行业分类
    industry_classification = request.POST.get('industry_classification')
    resultdict = dict()
    data_subject_list = ["外场观测数据", "卫星数据", "遥感数据", "温室气体清单数据",
                         "同化再分析数据", "实验室数据"]
    industry_classification_list = ["工业", "农业", "运输业", "能源行业", "环境", "数字与新能源"]
    ### 对应的数据集合
    zhengce = ["GPS", "Picaro", "PRI", "WindSpeed"]
    ### 针对传参为空值处理
    if data_subject == None:
        for data_subject in data_subject_list:
            resultdict[data_subject] = zhengce
    else:
        if data_subject in data_subject_list:
            resultdict[data_subject] = zhengce
    if industry_classification  == None:
        for industry_classification in industry_classification_list:
            resultdict[industry_classification] = zhengce
    else:
        if industry_classification in industry_classification_list:
            resultdict[industry_classification] = zhengce
    resultdict['政策数据'] = zhengce
    return JsonResponse({f'datatype': resultdict})


@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
## 专家信息团队信息下载
def download_expert_team(request):
    """
    下载FILES_APPROVED路径下的文件
    """
    if request.method == 'POST':
        # uniqueid = request.POST.get('uniqueid')
        download_type = request.POST.get('download_type')
        down_type_dict = {'team': "团队信息收集表.docx", 'expert': "专家信息收集表.docx"} ## team -团队团队信息收集表.doc -expert-专家信息收集表.doc
        if download_type in down_type_dict.keys():
            file_path = fr'{expert_team_dir}/{download_type}_collect_table.docx'
            # loadfilename = down_type_dict[download_type]
            # print(fr"此时的下载文件名称为:{loadfilename}")
        # ##  审核日期
        # file_path = fr"D:\2024_QH_ZHC\Code\QHZHC_fileter\sample_data\PRI.csv"
        if os.path.exists(file_path):
            with open(file_path, 'rb') as fh:
                response = HttpResponse(FileWrapper(fh), content_type='application/octet-stream')
                response['Content-Disposition'] = 'attachment; filename="{}"'.format(os.path.basename(file_path))
                fh.close()
                return response
        else:
            return HttpResponse("文件不存在", status=404)


#### 单个文件下载
@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@any_permission_required(
    permission_required('can_download_files')
)

def download_file(request):
    """
    下载FILES_APPROVED路径下的文件
    """
    if request.method == 'POST':
        uniqueid = request.POST.get('uniqueid')
        filename = request.POST.get('filename')
        qj = File_information.objects.filter(uniqueid= uniqueid,
                                             filename= filename,
                                             ).values('filedir')
        # ##  审核日期
        # file_path = fr"D:\2024_QH_ZHC\Code\QHZHC_fileter\sample_data\PRI.csv"
        file_path = os.path.join(qj[0]['filedir'], filename)
        if os.path.exists(file_path):
            with open(file_path, 'rb') as fh:
                response = HttpResponse(FileWrapper(fh), content_type='application/octet-stream')
                response['Content-Disposition'] = 'attachment; filename="{}"'.format(os.path.basename(file_path))
                fh.close()
                return response
        else:
            return HttpResponse("文件不存在", status=404)

# 定义一个函数将数值转换为科学计数法
def to_scientific(value):
    return f"{value:.2e}"

'''展示已审核文件'''
@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@any_permission_required(
    permission_required('can_download_files')
)

def ApproveFile(request):
    # 获取已审核文件夹路径
    approved_dir = settings.FILES_APPROVED
    if request.method == 'POST':
        file_name = "GPS.csv"
        uploadtime = fr"-"
        tempdatatype = "remote_sensing_data"
        scientific = False  ### 默认不用科学计数法
        decimal = 2 #### 四舍五入（数值四舍五入)
        if request.POST.get('file_name') != None:
            file_name = request.POST.get('file_name') # 获取要审核的文件名
        if request.POST.get('uploadtime') != None:
            uploadtime = request.POST.get('uploadtime') #
        if request.POST.get('datatype') != None:
            tempdatatype = request.POST.get('datatype')  # 上传类型
        ### 科学计数法
        if request.POST.get('scientific') != None:
            scientific = request.POST.get('scientific')  # 上传类型
        ### 小数点精度
        if request.POST.get('decimal') != None:
            decimal = request.POST.get('decimal')  # 上传类型
        typedict = {"field_observation_data": '外场观测数据', 'satellite_data': '卫星数据', 'policy_data': '政策数据',
                    "remote_sensing_data": "遥感数据", "greenhouse_gas_inventory_data": "温室气体清单数据",
                    "assimilation_and_reanalysis_data": "同化再分析数据", "laboratory_data": "实验室数据",
                    "industry": "工业", "agriculture": "农业", "transportation": "运输业",
                    "energy_industry": "能源行业", "environment": "环境", "digital_and_new_energy": "数字与新能源"}
        datatype = typedict[tempdatatype]
        if request.user.is_superuser:
            # files_dict = {}
            qj = File_information.objects.order_by('-uploadtime').filter(filetype__contains=datatype,
                                                                         is_examine=True,
                                                                         filename__contains=file_name,
                                                                         uploadtime__contains=uploadtime).values(
                                                                            'filename',
                                                                            'filedir',
                                                                            'uploadtime',
                                                                            'filetype',
                                                                            'approvedstrtime', 'fileid',
                                                                            'is_examine',
                                                                            'username', 'datasource', 'filedescrib')
        else:
            #### 只展示用户上传的数据集合
            qj = File_information.objects.order_by('-uploadtime').filter(filetype__contains=datatype,
                                                                         is_examine=True,
                                                                         filename__contains=file_name,
                                                                         uploadtime__contains=uploadtime,
                                                                         username__contains=str(request.user),
                                                                         ).values(
                                                                                'filename',
                                                                                'filedir',
                                                                                'uploadtime',
                                                                                'filetype',
                                                                                'approvedstrtime', 'fileid',
                                                                                'is_examine',
                                                                                'username', 'datasource', 'filedescrib')
        # print(qj)

        ### 排序
        qjvlause = qj[0]
        # print(qjvlause)
        idx = 0
        # for record in qjvlause:
        tempdict = {}
        idx += 1
        tempdict['上传作者'] = qjvlause['username']
        tempdict['数据来源'] = qjvlause['datasource']
        tempdict['数据ID'] = qjvlause['fileid']
        tempdict['文件名称'] = qjvlause['filename']
        tempdict['文件类型'] = qjvlause['filetype']
        tempdict['文件目录'] = qjvlause['filedir']
        tempdict['文件描述'] = qjvlause['filedescrib']
        # tempdict['filepath'] = record['filedir'] + '/' + record['filename']
        tempdict['文件路径'] = os.path.join(qjvlause['filedir'], qjvlause['filename'])
        ### 测试数据
        # test_data = pd.read_csv(fr"E:\2024_QH_ZHC\Code\QHZHC_Server\files\approved\raw_data\20240828\134313\GPS.csv", encoding='gbk', header=0)
        ### 生产环境数据
        test_data = pd.read_csv(fr"{tempdict['文件路径']}",
                                encoding='gbk', header=0)
        ### 科学计数法
        if scientific != False:
            # test_data = test_data.applymap(to_scientific)
            pd.options.display.float_format = '{:.2e}'.format
        ### 剔除无效值
        df_replaced = test_data.replace([np.nan, ''], -99999)
        ###小数点精度默认保留2位
        df_replaced = df_replaced.round(int(decimal))
        try:
            data = df_replaced.to_dict()
        except:
            data = df_replaced.to_dict()
        ### 将对应的进行整合
        tempdict['文件内容'] = data
        tempdict['上传时间'] = qjvlause['uploadtime']
        tempdict['审核时间'] = qjvlause['approvedstrtime']
        return JsonResponse({'approve_file': tempdict})


# def

'''
已审核列表接口
'''
@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@any_permission_required(
    permission_required('can_upload_files'),
    # permission_required('is_superuser'),
    permission_required('can_download_files')
)
def ListApprovedFilesView(request):
    # 获取已审核文件夹路径
    approved_dir = settings.FILES_APPROVED
    data_size = 300  ## 限制条数
    page_number = 1  ### 默认一页
    uploadtime = "-"
    username = str(request.user)
    if request.method == 'POST':
        # file_name = "."
        uploadtime = fr"-"
        tempdatatype = "assimilation_and_reanalysis_data"
        # if request.POST.get('uniqueid') != None:
        #     uniqueid = request.POST.get('uniqueid')  # 获取要审核的文件名
        if request.POST.get('uploadtime') != None:
            uploadtime = request.POST.get('uploadtime')  #
        if request.POST.get('datatype') != None:
            tempdatatype = request.POST.get('datatype')  # 上传类型
        if request.POST.get("username") != None:
            username = request.POST.get('username')
        typedict = {"field_observation_data": '外场观测数据', 'satellite_data': '卫星数据', 'policy_data': '政策数据',
                    "remote_sensing_data": "遥感数据", "greenhouse_gas_inventory_data": "温室气体清单数据",
                    "assimilation_and_reanalysis_data": "同化再分析数据", "laboratory_data": "实验室数据",
                    "industry": "工业", "agriculture": "农业", "transportation": "运输业",
                    "energy_industry": "能源行业", "environment": "环境", "digital_and_new_energy":"数字与新能源","nonetype":"无法解析数据"}
        try:
            datatype = typedict[tempdatatype]
        except:
            datatype = None
        # if request.POST.get('page_number') != None:
        #     page_number = int(request.POST.get('page_number'))
        # if request.POST.get('data_size') != None:
        #     data_size = int(request.POST.get('data_size'))
        '''
           数据库查找
           作者：小胡
           时间：2024-08-28
       '''
        files_dict = {}
        #### 只展示用户上传的数据集合
        ####获取最新上传时间的100条数据集合
        if datatype != None:
            qj = File_information.objects.order_by('-uploadtime').filter(filetype__contains=datatype,
                                                                         is_examine=True,
                                                                         uploadtime__contains=uploadtime,
                                                                         ).values(
                                                                           "uniqueid", "filedir", "uploadtime","filetype")
        elif datatype == None:
            qj = File_information.objects.order_by('-uploadtime').filter(is_examine=True,
                                                                         uploadtime__contains=uploadtime,
                                                                         ).values("uniqueid", "filedir", "uploadtime", "filetype")
        qjset = list()
        uniqueidlist = []
        ### 去除重复
        for file_info in qj:
            if file_info['uniqueid'] not in uniqueidlist:
                uniqueidlist.append(file_info['uniqueid'])
                qjset.append(file_info)
        paginator = Paginator(qjset, data_size)  # 每页显示10个帖子
        flag = False
        try:
            page_obj = paginator.page(page_number)
        except:
            # 如果请求的页码不是整数，返回第一页。
            # 如果请求的页码超出可用的页数，返回最后一页。
            page_obj = paginator.page(paginator.num_pages)
            page_number = paginator.num_pages
            flag = True
            ### 排序
        idx = 0
        templist = []
        for record in page_obj:
            # if record['uniqueid'] not in uniqueidlist:
            #     uniqueidlist.append(record['uniqueid'])
            tempdict = {}
            idx += 1
            tempdict['uniqueid'] = record['uniqueid']
            uniqueid = record['uniqueid']
            ### 增加对应的json数据展示
            jsonpath = os.path.join(record['filedir'], f'{uniqueid}.json')
            with open(jsonpath, 'r', encoding='utf-8') as file:
                data = json.load(file)
            file.close()
            tempdict['datatype'] = record['filetype']
            try:
                tempdict['datasetname'] = data['datasetname']
            except:
                tempdict['datasetname'] = (datetime.strptime(record['uploadtime'], "%Y-%m-%d %H:%M:%S")).strftime("%Y-%m-%d_%H_%M_%S") +"_数据集"
            templist.append(tempdict)
        files_dict['record'] = templist
        files_dict['data_total'] = len(qjset)
        if flag:
            files_dict['message'] = fr"末尾页为第{page_number}页"
        # 返回包含文件路径结构的未审核的list结果
        return JsonResponse({'fileslist': files_dict}, status=status.HTTP_200_OK)

'''
已审核列表接口
'''
@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@any_permission_required(
    permission_required('can_upload_files'),
    # permission_required('is_superuser'),
    permission_required('can_download_files')
)
def ApprovedFilesView(request):
    # 获取已审核文件夹路径
    approved_dir = settings.FILES_APPROVED
    data_size = 10  ## 分页条数
    page_number = 1  ### 默认一页
    uploadtime = "-"
    username = str(request.user)
    if request.method == 'POST':
        # file_name = "."
        # uploadtime = fr"-"
        # tempdatatype = "assimilation_and_reanalysis_data"
        # if request.POST.get('uniqueid') != None:
        #     uniqueid = request.POST.get('uniqueid')  # 获取要审核的文件名
        if request.POST.get('uniqueid') != None:
            uniqueid = request.POST.get('uniqueid')  #
        if request.POST.get('page_number') != None:
            page_number = int(request.POST.get('page_number'))
        if request.POST.get('data_size') != None:
            data_size = int(request.POST.get('data_size'))
        '''
           数据库查找
           作者：小胡
           时间：2024-08-28
       '''
        files_dict = {}
        #### 只展示用户上传的数据集合
        # if request.POST.get('datatype') != None:
        qj = File_information.objects.order_by('-uploadtime').filter(uniqueid=uniqueid,
                                                                     is_examine=True,
                                                                     ).values(
                                                                            'filename',
                                                                            'filedir',
                                                                            'uploadtime',
                                                                            'filetype',
                                                                            'approvedstrtime',
                                                                            'is_examine',
                                                                            'username', "uniqueid", "datasource")

        qjset = list()
        uniqueidlist = []
        ### 去除重复
        for file_info in qj:
            if file_info['uniqueid'] not in uniqueidlist:
                uniqueidlist.append(file_info['uniqueid'])
                qjset.append(file_info)
        paginator = Paginator(qjset, data_size)  # 每页显示10个帖子
        flag = False
        try:
            page_obj = paginator.page(page_number)
        except:
            # 如果请求的页码不是整数，返回第一页。
            # 如果请求的页码超出可用的页数，返回最后一页。
            page_obj = paginator.page(paginator.num_pages)
            page_number = paginator.num_pages
            flag = True
            ### 排序
        idx = 0
        templist = []
        for record in page_obj:
            # if record['uniqueid'] not in uniqueidlist:
            #     uniqueidlist.append(record['uniqueid'])
            tempdict = {}
            idx += 1
            tempdict['uniqueid'] = record['uniqueid']
            uniqueid = record['uniqueid']
            filename = record['filename']
            tempdict['username'] = record['username']
            tempdict['datasource'] = record['datasource']
            tempdict['datatype'] = record['filetype']
            tempdict['is_examine'] = record['is_examine']
            tempdict['uploadtime'] = record['uploadtime']
            tempdict['approvedstrtime'] = record['approvedstrtime']
            ### 增加对应的json数据展示
            jsonpath = os.path.join(record['filedir'], f'{uniqueid}.json')
            with open(jsonpath, 'r', encoding='utf-8') as file:
                data = json.load(file)
            file.close()
            tempdict['json'] = data
                ###新增字段用于展示修改的配置信息
            try:
                decimal = data['decimal']
                scientific_bool = data['scientific']
            except:
                decimal = 2
                scientific_bool = False
            tempdict['configres'] = {"decimal": f"{decimal}", "scientific": f"{scientific_bool}"}
            try:
                tempdict['datasetname'] = data['datasetname']
            except:
                tempdict['datasetname'] = (datetime.strptime(record['uploadtime'], "%Y-%m-%d %H:%M:%S")).strftime(
                    "%Y-%m-%d_%H_%M_%S") + "_数据集"
            ### 获取json数据中的单个数据集数据
            tempdict['data_vals'] = list(data['data_vals'].items())
            templist.append(tempdict)
        files_dict['record'] = templist
        files_dict['current_total'] = len(page_obj)
        files_dict['data_total'] = len(qjset)
        files_dict['page_number'] = page_number
        if flag:
            files_dict['message'] = fr"末尾页为第{page_number}页"
        # 返回包含文件路径结构的未审核的list结果
        return JsonResponse({'fileslist': files_dict}, status=status.HTTP_200_OK)


@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@any_permission_required(
    permission_required('can_upload_files'),
    permission_required('is_superuser'),
    permission_required('can_download_files')
)
def ListReviewFilesView(request):
    '''
    本机目录查找
    作者：君哥
    时间:2024-08-10
    '''
    # 获取未审核文件夹路径
    # review_dir = settings.FILES_REVIEW
    # # 遍历未审核文件夹，获取所有文件的路径结构
    # files_list = []
    # for root, dirs, files in os.walk(review_dir):
    #     for file in files:
    #         file_path = os.path.join(root, file)
    #         files_list.append({
    #             'file_name': file,
    #             'path': file_path,  # 获取相对路径
    #             'time': os.path.getmtime(file_path),  # 获取文件的修改时间
    #         })
    '''
    数据库查找
    作者：小胡
    时间：2024-08-28
    '''
    data_size = 5  ## 分页条数
    page_number = 1  ### 默认一页
    uploadtime = "-"
    is_examine = "f"
    username = ""
    # tempdatatype = "satellite_data"
    typedict = {"field_observation_data": '外场观测数据', 'satellite_data': '卫星数据', 'policy_data': '政策数据',
                "remote_sensing_data": "遥感数据", "greenhouse_gas_inventory_data": "温室气体清单数据",
                "assimilation_and_reanalysis_data": "同化再分析数据", "laboratory_data": "实验室数据",
                "industry": "工业", "agriculture": "农业", "transportation": "运输业",
                "energy_industry": "能源行业", "environment": "环境", "digital_and_new_energy": "数字与新能源",
                "nonetype":"无法解析数据"}
    if request.POST.get("datatype") != None:
        tempdatatype = request.POST.get("datatype")
        filetype = typedict[tempdatatype]
    if request.POST.get("username") != None:
        username = request.POST.get('username')
    if request.POST.get("uploadtime") != None:
        uploadtime = request.POST.get("uploadtime")
    if request.POST.get("is_examine")!= None:
        if request.POST.get("is_examine").find("False")>=0:
            # print("1")
            is_examine = "f"
        else:
            # print("2")
            is_examine = "t"
    if request.POST.get('page_number') != None:
        page_number = int(request.POST.get('page_number'))
    if request.POST.get('data_size') != None:
        data_size = int(request.POST.get('data_size'))
    files_dict = {}
    if request.POST.get("datatype") != None:
        qj = File_information.objects.order_by('-uploadtime').filter(filetype__contains=filetype,
                                                                     is_examine__contains=is_examine,
                                                                     uploadtime__contains=uploadtime,
                                                                     username__contains=username,
                                                                    ).values('uniqueid',
                                                                    'uploadtime', 'filetype', 'is_examine',
                                                                    'username', 'datasource')
    elif request.POST.get("datatype") == None:
        qj = File_information.objects.order_by('-uploadtime').filter(is_examine__contains=is_examine,
                                                                     uploadtime__contains=uploadtime,
                                                                     username__contains=username,
                                                                     ).values('uniqueid',
                                                                              'uploadtime', 'filetype', 'is_examine',
                                                                              'username', 'datasource')

    qjset = list()
    uniqueidlist = []
    ### 去除重复
    for file_info in qj:
        if file_info['uniqueid'] not in uniqueidlist:
            uniqueidlist.append(file_info['uniqueid'])
            qjset.append(file_info)
    paginator = Paginator(qjset, data_size)  # 每页显示10个帖子
    flag = False
    try:
        page_obj = paginator.page(page_number)
    except:
        # 如果请求的页码不是整数，返回第一页。
        # 如果请求的页码超出可用的页数，返回最后一页。
        page_obj = paginator.page(paginator.num_pages)
        page_number = paginator.num_pages
        flag = True
    ### 排序

    idx = 0
    templist = []
    for record in page_obj:
        # if record['uniqueid'] not in uniqueidlist:
        #     uniqueidlist.append(record['uniqueid'])
        tempdict = {}
        idx += 1
        tempdict['uniqueid'] = record['uniqueid']
        tempdict['username'] = record['username']
        tempdict['datasource'] = record['datasource']
        tempdict['datatype'] = record['filetype']
        tempdict['is_examine'] = record['is_examine']
        tempdict['uploadtime'] = record['uploadtime']
        templist.append(tempdict)
    files_dict['record'] = templist
    files_dict['current_total'] = len(page_obj)
    files_dict['data_total'] = len(qjset)
    files_dict['page_number'] = page_number
    if flag:
        files_dict['message'] = fr"末尾页为第{page_number}页"
    # 返回包含文件路径结构的未审核的list结果
    return JsonResponse(files_dict, status=status.HTTP_200_OK)


@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@any_permission_required(
    permission_required('is_superuser'),
)

### 文件审核文档进行计算
def ApproveFileView(request):
    '''
    外场观测数据-field_observation_data
    卫星数据-satellite_data
    政策数据-policy_data
    遥感数据-remote_sensing_data
    温室气体清单数据-greenhouse_gas_inventory_data
    同化再分析数据-assimilation_and_reanalysis_data
    实验室数据-laboratory_data
    工业-industry
    农业-agriculture
    运输业-transportation
    能源行业-energy_industry
    环境-environment
    数字与新能源-digital_and_new_energy
    '''
    if request.method == 'POST':
        # file_name = f"."
        # uploadtime = fr"-"
        # tempdatatype = fr"field_observation_data"
        # if request.POST.get('uniqueid') !=None:
        uniqueidlist = request.POST.get('uniqueid').split(",")
        # print(uniqueidlist)
        # for uniqueid in uniqueidlist:
        # uniqueid = request.POST.get('uniqueid')  # 获取要审核的uniqueid
        ### 数据库查找对应的未审核数据
        qj = File_information.objects.order_by('-uploadtime').filter(uniqueid__in=uniqueidlist,
                                                                 ).values('uniqueid', 'filename','filedir',
                                                                          'uploadtime', 'filetype')
        # print(qj)
        qjset =list()
        for i in qj:
            if i['filedir'] not in qjset:
                qjset.append(i['filedir'])
                # 待审核文件夹路径
                review_dir = settings.FILES_REVIEW
                # 已审核文件夹路径
                approved_dir = settings.FILES_APPROVED
                ### 审核时间
                approvedstrtime = datetime.today().strftime('%Y-%m-%d %H:%M:%S')  # 更新 last_login 字段 --上传日期
                approvedtime = datetime.today().strftime("%Y%m%d")
                approvedHMS = datetime.today().strftime("%H%M%S")
                # for index in qj:
                ###将整个文件夹的待审核数据转移至审核文件夹
                uploadtime = i['uploadtime']
                datatype = i['filetype']
                file_name = i['filename']
                # tempdatatype = request.POST.get('datatype')  # 上传类型
                strdate = datetime.strptime(uploadtime, "%Y-%m-%d %H:%M:%S").strftime('%Y%m%d')
                strdatetime = datetime.strptime(uploadtime, "%Y-%m-%d %H:%M:%S").strftime('%H%M%S')
                typedict = {"外场观测数据": 'field_observation_data',
                            '卫星数据': 'satellite_data',
                            '政策数据': 'policy_data',
                            "遥感数据": "remote_sensing_data",
                            "温室气体清单数据": "greenhouse_gas_inventory_data",
                            "同化再分析数据": "assimilation_and_reanalysis_data",
                            "实验室数据": "laboratory_data",
                            "工业": "industry",
                            "农业": "agriculture",
                            "运输业": "transportation",
                            "能源行业": "energy_industry",
                            "环境": "environment",
                            "数字与新能源": "digital_and_new_energy"}
                tempdatatype = typedict[datatype]
                # 检查文件是否存在于待审核文件夹中
                file_path =i['filedir']
                # print(file_path)
                if not os.path.exists(file_path):
                    return JsonResponse({'error': '文件未找到，请检查文件名'}, status=404)
                uniqueid = i['uniqueid']
                # 将文件从待审核文件夹移动到已审核文件夹
                approved_file_path = os.path.join(approved_dir, tempdatatype, approvedtime, approvedHMS)
                # approved_file_path = fr"{approved_dir}/{tempdatatype}/{approvedtime}/{approvedHMS}"
                os.makedirs(os.path.dirname(approved_file_path), exist_ok=True)
                ### 剪切至对应的文件夹
                shutil.move(file_path, approved_file_path)
                ### 进行数据库更新
                File_information.objects.filter(uniqueid=uniqueid).update(filedir=approved_file_path,
                                                approvedstrtime=approvedstrtime, is_examine=True)
        return JsonResponse({'message': '文件已审核并移动到已审核文件夹'})

    return JsonResponse({'error': '无效的请求方法'}, status=405)


####超级管理员机制进行集中查看数据集合内容
@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@any_permission_required(
    permission_required('is_superuser')
)
def datasetview(request):
    if request.method == 'POST':
        uniqueid = request.POST.get('uniqueid')
        qj = File_information.objects.filter(uniqueid=uniqueid,
                                             ).values('filedir', 'filename', 'filetype')
        if len(qj) == 0:
            return JsonResponse({'error': '查询的数据集合无数据文件'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            resultout = []
            tmepdict = dict()
            resultout.append(tmepdict)
            tmepdict['datatype'] = ""
            tmepdict['uniqueid'] = uniqueid
            tmepdict['data_include'] = list()
            for data in qj:
                tmepdict['datatype'] = data['filetype']
                if data['filename'] not in tmepdict['data_include']:
                    tmepdict['data_include'].append(data['filename'])
            return JsonResponse({"result": resultout}, status=status.HTTP_200_OK)


@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@any_permission_required(
    permission_required('can_upload_files')
)

#### 文件上传
def UploadFilesView(request):
    '''
    外场观测数据-field_observation_data
    卫星数据-satellite_data
    政策数据-policy_data
    遥感数据-remote_sensing_data
    温室气体清单数据-greenhouse_gas_inventory_data
    同化再分析数据-assimilation_and_reanalysis_data
    实验室数据-laboratory_data
    工业-industry
    农业-agriculture
    运输业-transportation
    能源行业-energy_industry
    环境-environment
    数字与新能源-digital_and_new_energy
    '''
    if request.method == 'POST' and request.FILES.getlist('file'):
        # uploaded_file = request.FILES['file']
        ### 批量文件上传
        uploaded_files = request.FILES.getlist('file')
        # print(uploaded_files)
        # 指定保存路径，可以是 MEDIA_ROOT 或其他路径
        resdict = dict()
        datatypelist = list()
        # resdict['uploadtime'] = uploadtime
        uploadtime = datetime.now().astimezone().strftime('%Y-%m-%d %H:%M:%S')  # 更新 last_login 字段 --上传日期
        strdate = datetime.now().astimezone().strftime('%Y%m%d')
        strdatetime = datetime.now().astimezone().strftime('%H%M%S')
        # tempdatatype = request.POST.get('datatype')  # 上传类型
        typedict = {"field_observation_data": '外场观测数据', 'satellite_data': '卫星数据', 'policy_data': '政策数据',
                    "remote_sensing_data": "遥感数据", "greenhouse_gas_inventory_data": "温室气体清单数据",
                    "assimilation_and_reanalysis_data": "同化再分析数据", "laboratory_data": "实验室数据",
                    "industry": "工业", "agriculture": "农业", "transportation": "运输业",
                    "energy_industry": "能源行业", "environment": "环境", "digital_and_new_energy": "数字与新能源"}
        try:
            tempdatatypelist = request.POST.get('datatype').split(",")
            # print(tempdatatypelist)
            for tempdatatype in tempdatatypelist:
                dictdatatype = typedict[tempdatatype]
                datatypelist.append(dictdatatype)
            # print(datatypelist)
        except:
            tempdatatype = "nonetype"
            datatype = fr"无法解析数据"
            tempdatatypelist = [tempdatatype]
            datatypelist.append(datatype)
        resultout = []
        for i in range(len(datatypelist)):
            tempresult = dict()
            # datatype = datatypelist[i]
            tempdatatype = tempdatatypelist[i]
            unique_id = fileinfo2uuid(fr'{uploadtime}{datatypelist[i]}{str(f"{request.user}")}')
            datasetname = datetime.today().strftime("%Y-%m-%d_%H_%M_%S") + "_数据集"
            if request.POST.get('datasetname') != None:
                datasetname = request.POST.get('datasetname')
            # print(str(f"{request.user}"))
            resdict['datasetname'] = datasetname
            resdict['uploadtime'] = uploadtime  #### 上传时间
            resdict['class'] = datatypelist[i]  #### 数据类型
            tempresult['datatype'] = datatypelist[i]
            resdict['uniqueid'] = unique_id  #### 时间戳识别唯一uuid
            tempresult['uniqueid'] = unique_id
            # try:
            resdict['institution'] = "清华走航车平台" ###将对应的数据集合进行汇总
            # except:
            #     resdict['institution'] = request.POST.get('institution')
            resdict['time_set'] = []  ####数据组包含的最大的时间跨度
            resdict['locations'] = []  ####数据组包含的最大的时间跨度
            #### 此时的更新时间与传时间一致
            resdict['updatetime'] = resdict['uploadtime']
            resdict['city'] = request.POST.get('city')
            resdict['user'] = str(request.user)
            resdict['last_edit'] = str(request.user)
            resdict['data_include'] = []
            resdict['data_vals'] = dict()
            resdictjson = os.path.join(settings.FILES_REVIEW, tempdatatype, strdate, strdatetime, fr'{unique_id}.json')
            tempresult['data_include'] = []
            for uploaded_file in uploaded_files:
                tempresult['data_include'].append(uploaded_file.name)
                tempdict = {}
                if tempdatatype == None:
                    ### 数据类型集合
                    datatype = fr'无法解析数据'
                # 创建保存文件的目录（如果不存在）
                save_path = os.path.join(settings.FILES_REVIEW, tempdatatype, strdate, strdatetime, uploaded_file.name)
                os.makedirs(os.path.dirname(save_path), exist_ok=True)
                # 保存文件到指定路径
                # 保存文件到指定路径
                with open(save_path, 'wb+') as destination:
                    for chunk in uploaded_file.chunks():
                        destination.write(chunk)
                ## 进行数据库存储;
                # strtime = datetime.now().astimezone().strftime('%Y-%m-%d %H:%M:%S')  # 数据时间更新至数据库
                dirname = os.path.dirname(save_path)
                username = str(request.user)
                # print(username)
                if request.POST.get('datasource') !=None:
                    datasource = request.POST.get('datasource')
                else:
                    datasource = '网页上传'
                filedescrib = fr'{uploaded_file.name}格式文件'
                fileid = fileinfo2uuid(f"{dirname}{uploaded_file.name}{datatypelist[i]}{username}{datasource}{filedescrib}",
                                       uploadtime)
                tempdict['datasource'] = datasource
                tempdict['updatetime'] = resdict['uploadtime']
                tempdict['last_edit'] = str(request.user)
                tempdict['dataid'] = fileid
                tempdict['encoding'] = "gbk"
                tempdict['extension'] = os.path.splitext(uploaded_file.name)[1]
                # random_four_uppercase_letters = ''.join(random.choice(string.ascii_uppercase) for _ in range(4))
                tempdict["delimiter"] = "," ###文件读取分隔
                tempdict['header'] = "top"
                tempdict['Null_remark'] = 99999
                tempdict['Datetime_format'] = "yyyy-MM-dd HH:mm:ss"
                tempdict['Timezone_ID'] = "Asia/Shanghai"
                ####### 针对TXT文件的修改过程
                if os.path.basename(save_path).endswith((".txt", ".TXT")):
                    tempdict["delimiter"] = fill_null(save_path, encodeing=tempdict['encoding'])
                # separator = fill_null(save_path)
                ###  读取数据集合
                #### 读取文件
                m = pd.read_csv(save_path, header=0, sep=tempdict["delimiter"], encoding=tempdict['encoding'])
                if os.path.basename(save_path).endswith((".txt", ".TXT")):
                    ### 将其转换为csv格式
                    save_path = save_path.replace(".txt","txt.csv")
                    m.to_csv(save_path)
                if os.path.basename(uploaded_file.name).endswith((".csv", ".CSV")):
                    try:
                        locations = [m['Longitude'].min().split("°")[0], m['Latitude'].min().split("°")[0],
                                     m['Longitude'].max().split("°")[0], m['Latitude'].max().split("°")[0]]
                        resdict['locations'] = locations
                    except:
                        if resdict['locations'] == []:
                            resdict['locations'] = fr'{uploaded_file.name}没有对应的经纬度集合'
                            print(fr'{uploaded_file.name}没有对应的经纬度集合')
                        ### 针对新数据源进行修改
                    try:
                        temptime_set = [m['Time'].min(), m['Time'].max()]
                        ### 将时间进行整合
                        Date_set = [m['Date'].min(), m['Date'].max()]
                        try:
                            begintime = datetime(year=int(f'20{(Date_set[0].split("-")[0])}'),
                                                 month=int(Date_set[0].split("-")[1]),
                                                 day=int(Date_set[0].split("-")[2]),
                                                 hour=int(temptime_set[0].split(":")[0])).strftime("%Y-%m-%d %H:%M:%S")
                            endtime = datetime(year=int(f'20{(Date_set[1].split("-")[0])}'),
                                               month=int(Date_set[1].split("-")[1]),
                                               day=int(Date_set[1].split("-")[2]),
                                               hour=int(temptime_set[1].split(":")[0])).strftime("%Y-%m-%d %H:%M:%S")
                        except:
                            begintime = datetime(year=int(f'{(Date_set[0].split("-")[0])}'),
                                                 month=int(Date_set[0].split("-")[1]),
                                                 day=int(Date_set[0].split("-")[2]),
                                                 hour=int(temptime_set[0].split(":")[0])).strftime("%Y-%m-%d %H:%M:%S")
                            endtime = datetime(year=int(f'{(Date_set[1].split("-")[0])}'),
                                               month=int(Date_set[1].split("-")[1]),
                                               day=int(Date_set[1].split("-")[2]),
                                               hour=int(temptime_set[1].split(":")[0])).strftime("%Y-%m-%d %H:%M:%S")
                    except:
                        ### 针对新csv数据进行处理
                        try:
                            temptime_set = [m['time'].min(), m['time'].max()]
                            try:
                                begintime = (datetime.strptime(m['time'].min(), "%Y/%m/%d %H:%M:%S")).strftime(
                                    "%Y-%m-%d %H:%M:%S")
                                endtime = (datetime.strptime(m['time'].max(), "%Y/%m/%d %H:%M:%S")).strftime(
                                    "%Y-%m-%d %H:%M:%S")
                            except:
                                begintime = (datetime.strptime(m['time'].min(), "%Y/%m/%d %H:%M")).strftime(
                                    "%Y-%m-%d %H:%M:%S")
                                endtime = (datetime.strptime(m['time'].max(), "%Y/%m/%d %H:%M")).strftime(
                                    "%Y-%m-%d %H:%M:%S")
                        except:
                            begintime = tempdict['Null_remark']  ####无效时间针对TXT的判断
                            endtime = tempdict['Null_remark']  ####无效时间针对TXT的判断
                else:
                    try:
                        begintime = m['Time'].min()
                        endtime = m['Time'].max()
                    except:
                        begintime = tempdict['Null_remark']  ####无效时间针对TXT的判断
                        endtime = tempdict['Null_remark']
                try:
                    time_set = [begintime, endtime]
                except:
                    time_set = []
                if resdict['time_set'] !=[]:
                    ##比较时间大小
                    pass
                resdict['time_set'] = time_set
                tempdict['time_start'] = begintime
                tempdict['time_end'] = endtime
                if resdict['locations'] !=[]:
                    pass
                resdict['data_include'].append(uploaded_file.name)
                resdict['data_vals'][uploaded_file.name] = tempdict
                try:
                    ## 进行数据库存储;
                    file = File_information(filename=uploaded_file.name, filedir=dirname, filetype=datatypelist[i],
                                            uploadtime=uploadtime, is_examine=False, fileid=fileid, username=username,
                                            datasource=datasource, filedescrib=filedescrib, uniqueid=unique_id)
                    file.save()
                    ## 进行数据库存储;
                except:
                    ## 将数据库的字段进行更新
                    file = File_information.objects.filter(fileid=fileid).update(filename=uploaded_file.name,
                                                                                 filedir=dirname,
                                                                                 filetype=datatype,
                                                                                 uploadtime=uploadtime,
                                                                                 is_examine=False,
                                                                                 username=username,
                                                                                 datasource=datasource,
                                                                                 filedescrib=filedescrib,
                                                                                 uniqueid=unique_id)
            resultout.append(tempresult)
            # print(resultout)
        ### 将上传config信息整合成
            # print(resdict)
            with open(resdictjson, 'w', encoding='utf-8') as json_file:
                json.dump(resdict, json_file, ensure_ascii=False, indent=4)
        return JsonResponse({"result": resultout}, status=status.HTTP_200_OK)
        # return render(request, 'uploadfile.html', {'data': resdict, 'title': fr'文件上传情况','headers':headers})
    return JsonResponse({'error': '请求出错，没有检测到上传文件'}, status=status.HTTP_400_BAD_REQUEST)


@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@any_permission_required(
    permission_required('can_upload_files'),
    permission_required('can_download_files')
)

####修改json信息
def configres(request):
    # pass
    uniqueid = request.POST.get('uniqueid')
    json_data = request.POST.get('json')
    decimal = 2
    scientific_bool = False
    ### 获取传入的json字符串数据
    requestjson = json.loads(json_data)
    try:
        # if  a if a > b else b
        try:
            decimal = int(requestjson['decimal'])
        except:
            pass
        scientific_bool = scientific_bool if requestjson['scientific'].find('False') >= 0 else True
    except:
        pass
    qj = File_information.objects.filter(uniqueid=uniqueid).values('filedir')
    #### 获取csv数据进行展示
    jsonpath = os.path.join(qj[0]['filedir'], fr'{uniqueid}.json')
    with open(jsonpath, 'r', encoding='utf-8') as file:
        data = json.load(file)
    #### 查找对应的文件列表
    csvlist = data['data_include']
    ####判断是否传入文件名称
    if request.POST.get('filename') != None:
        csvlist = [request.POST.get('filename')]
    filelist = [os.path.join(qj[0]['filedir'], i) for i in csvlist]
    for filepath in filelist:
        filename = os.path.basename(filepath)
        # 读取JSON文件
        kuozhan = os.path.splitext(filepath)[1]
        # if scientific_bool == True:
        adjust_csv_precision(filepath, filepath.replace(kuozhan, f"bak{kuozhan}"), precision=decimal,
                             scientific=scientific_bool)
        # if request.POST.get('decimal') != None:
        data['data_vals'][filename]['decimal'] = decimal
        data['data_vals'][filename]['scientific'] = scientific_bool
        data['data_vals'][filename]['last_edit'] = str(request.user)
        data['data_vals'][filename]['updatetime'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        # if request.POST.get('scientific') != None:
    data['last_edit'] = str(request.user)
    data['updatetime'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    ###### 新增decimal和scientific的字段更新
    if request.POST.get('filename') == None:
        data['decimal'] = decimal
        data['scientific'] = scientific_bool
    file.close()
    ## 更新json文件
    with open(jsonpath, 'w', encoding='utf-8') as json_file:
        json.dump(data, json_file, ensure_ascii=False, indent=4)
    json_file.close()

    if request.POST.get('filename') != None:
        try:
            datacsv = request.POST.get('filename')
            result_json = data['data_vals'][datacsv]
            return JsonResponse({"message": fr"数据文件{datacsv}修改成功"}, status=status.HTTP_200_OK)
        except:
            return JsonResponse({"error": "未找到对应的数据文件信息，无法修改"},
                                status=status.HTTP_400_BAD_REQUEST)
    else:
        result_json = data
        return JsonResponse({"message": fr"数据集更新成功"}, status=status.HTTP_200_OK)


@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@any_permission_required(
    permission_required('can_upload_files'),
    permission_required('can_download_files')
)

## 文件效果预览
def fileview(request):
    uniqueid = request.POST.get('uniqueid')
    filename = request.POST.get('filename')
    # filename = request.POST.get('datatype')
    last_edit = request.POST.get('last_edit')
    city = request.POST.get('city')
    if filename!=None:
        ### 文件预览
        try:
            ###configure信息
            qj = File_information.objects.filter(uniqueid=uniqueid,
                                                 filename=filename).values('filedir')
            #### 获取csv数据进行展示
            filepath = os.path.join(qj[0]['filedir'], filename)
            jsonpath = os.path.join(qj[0]['filedir'], fr'{uniqueid}.json')
            # 读取JSON文件
            with open(jsonpath, 'r', encoding='utf-8') as file:
                data = json.load(file)
            data['last_edit'] = last_edit
            data['city'] = city
            kuozhan = os.path.splitext(filepath)[1]
            try:
                decimal = data['data_vals'][filename]['decimal']
                scientific_bool = data['data_vals'][filename]['scientific']
            except:
                decimal = 2
                scientific_bool = False
                ### 获取失败
                adjust_csv_precision(filepath, filepath.replace(kuozhan, f"bak{kuozhan}"), precision=decimal,
                                     scientific=False)
            # ### 修改对应格式
            # if request.POST.get('decimal') != None:
            #     decimal = int(request.POST.get('decimal'))
            # if request.POST.get("scientific") != None:
            #     if request.POST.get("scientific").find("False") >= 0:
            #         scientific_bool = False
            #     else:
            #         scientific_bool = True
            configure = {"user":data['user'],
                         "uploadtime": data['uploadtime'], "dataid":data['data_vals'][filename]['dataid'],
                         "dataname": filename, "datatype": data['class'],
                         "datasource": data['data_vals'][filename]['datasource']}
            file.close()
            csvdata = read_csv(fr'{filepath}')
            return JsonResponse({'configure': configure, 'configres': {"decimal": f"{decimal}", "scientific": f"{scientific_bool}"}, 'json': data['data_vals'][filename], 'csv': csvdata}, status=status.HTTP_200_OK)
        except:
            return JsonResponse({'message': '数据不存在'}, status=status.HTTP_200_OK)
    else:
        qj = File_information.objects.filter(uniqueid=uniqueid).values('filedir')
        jsonpath = os.path.join(qj[0]['filedir'], fr'{uniqueid}.json')
        # 读取JSON文件
        with open(jsonpath, 'r', encoding='utf-8') as file:
            data = json.load(file)
        data['last_edit'] = last_edit
        data['city'] = city
        file.close()
        # 写回JSON文件
        with open(jsonpath, 'w', encoding='utf-8') as file:
            json.dump(data, file, ensure_ascii=False, indent=4)
        file.close()
        return JsonResponse(
            data, status=status.HTTP_200_OK)

@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@any_permission_required(
    permission_required('can_upload_files'),
    permission_required('can_download_files')
)
####数据集预览
def dataview(request):
    uniqueid = request.POST.get('uniqueid')
    qj = File_information.objects.filter(uniqueid=uniqueid,
                                         ).values('filedir',"filename","filetype")
    # result_out = []
    # for qjindex in qj:
    tempdict = dict()
    jsonpath = os.path.join(qj[0]['filedir'], fr'{uniqueid}.json')
    with open(jsonpath, 'r', encoding='utf-8') as file:
        data = json.load(file)
    tempdict['datatype'] = data['class']
    tempdict['uniqueid'] = data['uniqueid']
    tempdict['data_include'] = data['data_include']
    return JsonResponse(
        {"result":tempdict}, status=status.HTTP_200_OK)


@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@any_permission_required(
    permission_required('can_download_files')
)

## 批量数据集下载
def batch_download(request):
    uniqueidlist = request.POST.get('uniqueid').split(",")
    zip_filename = f'{datetime.today().strftime("%Y-%m-%d")}_batch_download.zip'
    s = io.BytesIO()
    zf = zipfile.ZipFile(s, "w")
    # for uniqueid in uniqueidlist:
    qj = File_information.objects.filter(uniqueid__in=uniqueidlist,
                                         ).values('filedir', 'uniqueid')
    qjset = list()
    for i in qj:
        if i['filedir'] not in qjset:
            qjset.append(i['filedir'])
            file_paths = [os.path.join(i['filedir'], filename)for filename in os.listdir(i['filedir'])]
            uniqueid = i['uniqueid']
            for file_path in file_paths:
                if os.path.exists(file_path):
                    if file_path.endswith(".csv"):
                    ###
                        zf.write(file_path, fr"{uniqueid}_{os.path.basename(file_path)}")
                    else:
                        zf.write(file_path, os.path.basename(file_path))
    # file_paths = [
    #     os.path.join(settings.MEDIA_ROOT, 'file1.pdf'),
    #     os.path.join(settings.MEDIA_ROOT, 'file2.txt'),
    #     os.path.join(settings.MEDIA_ROOT, 'file3.jpg')
    # ]
    zf.close()
    response = HttpResponse(s.getvalue(), content_type='application/zip')
    response['Content-Disposition'] = f'attachment; filename="{zip_filename}"'
    return response

@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@any_permission_required(
    permission_required('can_download_files')
)

## 批量数据文件下载
def batchfile_download(request):
    fileidlist = request.POST.get('fileid').split(",")
    zip_filename = f'{datetime.today().strftime("%Y-%m-%d")}_batchfile_download.zip'
    s = io.BytesIO()
    zf = zipfile.ZipFile(s, "w")
    # for uniqueid in uniqueidlist:
    qj = File_information.objects.filter(fileid__in=fileidlist,
                                         ).values('filedir', 'uniqueid', 'filename')
    uniquelsit = list()
    for i in qj:
        # if i['filedir'] not in qjset:
        file_path = os.path.join(i['filedir'], i['filename'])
        uniqueid = i['uniqueid']
        # for file_path in file_paths:
        if os.path.exists(file_path):
            if file_path.endswith(".csv"):
            ####将数据写成zip包格式
                zf.write(file_path, fr"{uniqueid}_{os.path.basename(file_path)}")
            else:
                zf.write(file_path, os.path.basename(file_path))
        ## json数据集合下载
        if uniqueid not in uniquelsit:
            uniquelsit.append(uniqueid)
            ### 写入json文件
            jsonname = i['uniqueid'] + ".json"
            jsonpath = os.path.join(i['filedir'], jsonname)
            zf.write(jsonpath, jsonname)
    # file_paths = [
    #     os.path.join(settings.MEDIA_ROOT, 'file1.pdf'),
    #     os.path.join(settings.MEDIA_ROOT, 'file2.txt'),
    #     os.path.join(settings.MEDIA_ROOT, 'file3.jpg')
    # ]
    zf.close()
    response = HttpResponse(s.getvalue(), content_type='application/zip')
    response['Content-Disposition'] = f'attachment; filename="{zip_filename}"'
    return response

### 读取第一行为标头
import csv
def read_csv(file_path):
    data = []
    with open(file_path, newline='', encoding='gbk') as csvfile:
        csvreader = csv.reader(csvfile)
        # 假设第一行是标题行，我们可以选择是否将其包含在数据中
        headers = next(csvreader)  # 读取标题行
        data.append(headers)  # 如果你想在表格中显示标题，可以将其添加到数据中
        for row in csvreader:
            data.append(row)
            if len(data) >=10:
                break
    return data


def format_as_scientific(number, precision=2):
    """
    将数字格式化为科学计算法字符串。

    参数：
    number -- 要格式化的数字（浮点数）
    precision -- 科学计算法中小数点后的位数（默认2位）

    返回：
    格式化后的字符串
    """
    # 使用Python内置的format函数进行格式化
    # '{:.{}e}'.format(number, precision) 中的 {} 会被 precision 的值替换
    # 'e' 表示科学计算法格式
    return '{:.{}e}'.format(number, precision)


def adjust_csv_precision(input_file, output_file, precision=5,scientific=False):
    """
    此函数用于读取CSV文件，调整其中数值数据的小数点精度，并将结果保存到新的CSV文件中。
    参数说明：
    input_file -- 输入CSV文件的路径
    output_file -- 输出CSV文件的路径
    precision -- 需要保留的小数点位数
    """
    ### 删除原有的修改文件
    try:
        os.remove(output_file)
    except:
        pass
    # 打开输入和输出文件
    with open(fr'{input_file}', mode='r', newline='', encoding='gbk') as infile, \
            open(fr'{output_file}', mode='w', newline='', encoding='gbk') as outfile:

        # 创建CSV读取器和写入器
        reader = csv.reader(infile)
        writer = csv.writer(outfile)

        # 逐行读取CSV数据
        for row in reader:
            # 创建一个新列表，用于存储修改后的数据
            new_row = []
            for cell in row:
                houzui= ""
                # 尝试将单元格内容转换为浮点数
                try:
                    # 如果转换成功，则四舍五入到指定的小数点位数
                    #### 将对应的经纬度进行转换
                    if cell.find("°N")>=0:
                        cell = cell[:-2]
                        houzui = "°N"
                    if cell.find("°E") >= 0:
                        cell = cell[:-2]
                        houzui = "°E"
                        #### 数据为科学计数法
                    if cell.find("e+") >= 0:
                        #### 将科学计数法数据反格式化
                        # scientific_str = "1.23e+05"
                        cell = Decimal(cell).normalize()
                    num = float(cell)
                    if scientific != False:
                        formatted_cell = format_as_scientific(num, precision)
                    else:
                        # formatted_cell = new_cell
                        ## 将数据小数点取整
                        formatted_cell = round(num, precision)
                        ### 小数点不够位数默认补0
                        formatted_cell = fr"%.{precision}f" % formatted_cell
                    # 将四舍五入后的数据转换回字符串（如果需要的话）
                    # 注意：如果CSV中的数字原本没有小数部分，round()函数仍然会返回一个浮点数，
                    # 但在这个例子中，我们将其转换回字符串以保持格式一致。
                    # 在实际应用中，您可能需要根据具体需求调整此行为。
                    new_row.append(str(formatted_cell) + houzui)
                except ValueError:
                    # 如果转换失败（即单元格内容不是数字），则原样保留该内容
                    new_row.append(cell)
                    # 将修改后的数据行写入输出文件
            writer.writerow(new_row)
        infile.close()
        outfile.close()
        # infilename = os.path.basename(input_file)
        # outfilename = os.path.basename(output_file)
        ### 删除原有数据集并且进行替换
        os.remove(input_file)
        os.rename(output_file, input_file)


@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@any_permission_required(
    permission_required('can_upload_files')
)

### 数据预览
def data_render(request):
    file_path = request.POST.get('filepath')
    # file_path = fr"D:\2024_QH_ZHC\Code\QHZHC_fileter\sample_data\PRI.csv"
    #### 小数点精度
    if request.POST.get('decimal') != None:
        decimal = int(request.POST.get('decimal'))
    else:
        decimal = 3
    ### 科学计数法
    # if request.POST.get('scientific') != None:
    try:
        scientific = False
        kuozhan = os.path.splitext(file_path)[1]
        adjust_csv_precision(file_path, file_path.replace(kuozhan, f"bak{kuozhan}"), precision=decimal,
                             scientific=scientific)
        data = read_csv(fr'{file_path}')
        return render(request, 'data_render.html', {'data': data, 'title': fr'{os.path.basename(file_path)}'})
    except:
        return JsonResponse({'error': '原文件损坏，无法预览'}, status=status.HTTP_400_BAD_REQUEST)

### 专家库数据查询接口
@csrf_exempt  # 如果你使用的是 CSRF 防护机制，你可以使用这个装饰器禁用该视图的 CSRF 防护
@api_view(['POST'])
def Expertquiry(request):
    ###数据库查询
    data_size = 5  ## 分页条数
    page_number = 1 ### 默认一页
    if request.POST.get('page_number') != None:
        page_number = int(request.POST.get('page_number'))
    if request.POST.get('data_size') != None:
        data_size = int(request.POST.get('data_size'))
    datatype = request.POST.get('datatype')
    ###成员
    if datatype.find("成员")>=0:
        data_size = 20
    if datatype != None:
        obj = Appexpert.objects.filter(datatype__contains=datatype).values('maininfo', 'homepage', 'address', 'imageurl',
                                                'datatype', 'insertime','expertname','direction').order_by('-insertime')
    else:
        obj = Appexpert.objects.filter().values('maininfo', 'homepage', 'address', 'imageurl',
                                                'datatype', 'insertime','expertname','direction').order_by('-insertime')
    try:
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
            if data['datatype'].find("专家")>=0:
                tempdict['expertname'] = data['expertname']
            ########针对研究成员的特殊判断
            elif data['datatype'].find("成员")>=0:
                tempdict['name'] = data['expertname']
                tempdict['info'] = data['maininfo']
                tempdict['direction'] = data['direction']
                tempdict['email']= data['address'].split(",")
                tempdict['img'] =data['homepage']
                if data['datatype'].find("研究")>=0:
                    tempdict['type'] = "research"
                else:
                    tempdict['type'] = "work"
                templist.append(tempdict)
                del tempdict
                continue
            tempdict['maininfo'] = data['maininfo']
            tempdict['homepage'] = data['homepage']
            tempdict['eamil'] = data['address']
            tempdict['imageurl'] = data['imageurl']
            tempdict['datatype'] = data['datatype']
            tempdict['uptime'] = data['insertime']
            templist.append(tempdict)
            del tempdict
        if datatype.find("成员") >= 0:
            resultdict['memberList'] = templist
        else:
            resultdict['record'] = templist
        resultdict['current_total'] = len(page_obj)
        resultdict['data_total'] = len(obj)
        resultdict['page_number'] = page_number
        if flag:
            resultdict['message'] = fr"末尾页为第{page_number}页"
        return JsonResponse(resultdict, status=status.HTTP_200_OK)
    except:
        return JsonResponse({f'erroe': fr"信息内容获取报错"}, status=status.HTTP_201_CREATED)

#     # 获取数据处理配置
#     decimal_precision = request.GET.get('decimal_precision')
#     scientific_notation = request.GET.get('scientific_notation', False)
#
#     # 清理和验证表名和字段名，避免 SQL 注入
#     safe_table_name = slugify(table_name)  # 仅保留安全字符，避免 SQL 注入
#     safe_columns = [slugify(col) for col in columns]  # 对字段名进行清理
#
#     # 将字符串转换为 datetime 对象
#     start_time_dt = datetime.strptime(start_time, '%Y-%m-%d %H:%M:%S')
#     end_time_dt = datetime.strptime(end_time, '%Y-%m-%d %H:%M:%S')
#
#
#     # 构建 SQL 查询
#     query = f"""
#             SELECT {', '.join(safe_columns)}
#             FROM {safe_table_name}
#             WHERE time >= $1 AND time <= $2
#             """
#
#     # 以同步方式执行查询
#     rows = fetch_data_sync(query, start_time_dt, end_time_dt)
#
#     # 将结果转换为 DataFrame
#     df = pd.DataFrame(rows, columns=safe_columns)
#
#     # 移除带时区的 datetime 的时区信息
#     df = df.apply(lambda x: x.dt.tz_convert(None) if x.dtype.kind == 'M' and x.dt.tz is not None else x)
#
#     # 将所有字段（除了 'time'）转换为浮点数
#     for col in df.columns:
#         if col != 'time':
#             df[col] = df[col].astype(float)
#
#     # 确保 decimal_precision 被正确转换为整数
#     if decimal_precision is not None:
#         try:
#             decimal_precision = int(decimal_precision)
#             df = df.round(decimal_precision)
#         except ValueError:
#             pass  # 忽略转换错误或设定默认精度
#
#     if scientific_notation:
#         # 将所有数字列转换为科学计数法格式
#         for col in df.select_dtypes(include=['float64', 'float32']).columns:
#             df[col] = df[col].apply(lambda x: '{:.2e}'.format(x))
#
#         # 格式化时间列
#     for col in df.select_dtypes(include=['datetime64']).columns:
#         df[col] = df[col].dt.strftime('%Y-%m-%d %H:%M:%S')
#
#     # 将 DataFrame 转换为 JSON 格式
#     result = df.to_dict(orient='records')
#
#     # 返回 JSON 格式的数据
#     return JsonResponse(result, safe=False)
#
#
#     pass
#
#
# def DownloadExcelView(request):
#     # 获取查询参数
#     table_name = request.GET.get('object')
#     columns = request.GET.getlist('variable')  # 获取多个字段名
#     start_time = request.GET.get('start_time')
#     end_time = request.GET.get('end_time')
#
#     # 清理和验证表名和字段名，避免 SQL 注入
#     safe_table_name = slugify(table_name)  # 仅保留安全字符，避免 SQL 注入
#     safe_columns = [slugify(col) for col in columns]  # 对字段名进行清理
#
#     # 将字符串转换为 datetime 对象
#     start_time_dt = datetime.strptime(start_time, '%Y-%m-%d %H:%M:%S')
#     end_time_dt = datetime.strptime(end_time, '%Y-%m-%d %H:%M:%S')
#
#     # 构建 SQL 查询
#     query = f"""
#             SELECT {', '.join(safe_columns)}
#             FROM {safe_table_name}
#             WHERE time >= $1 AND time <= $2
#             """
#
#     # 以同步方式执行查询
#     rows = fetch_data_sync(query, start_time_dt, end_time_dt)
#
#     # 将结果转换为 DataFrame
#     df = pd.DataFrame(rows, columns=safe_columns)
#
#     # 移除带时区的 datetime 的时区信息
#     df = df.apply(lambda x: x.dt.tz_convert(None) if x.dtype.kind == 'M' and x.dt.tz is not None else x)
#
#     # 将 DataFrame 写入到 Excel 文件
#     output = io.BytesIO()
#     with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
#         df.to_excel(writer, index=False)
#
#     output.seek(0)
#
#     # 创建 HttpResponse 对象并发送 Excel 文件
#     response = HttpResponse(output,
#                             content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
#     response['Content-Disposition'] = 'attachment; filename=data.xlsx'
#     return response
# osition'] = 'attachment; filename=data.xlsx'
#     return response
