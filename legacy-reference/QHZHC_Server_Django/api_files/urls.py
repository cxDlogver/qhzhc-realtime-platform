from django.urls import path
from .views import *
from .datares import *

urlpatterns = [
    # path('download/', DownloadExcelView, name='download_excel'),
    # path('preview/', DownloadPreviewView, name='preview_data'),
    ### config文件修改
    path('configres/', configres, name='configres'),
    # 上传文件
    path('upload/', UploadFilesView, name='upload_file'),
    ## 文件预览
    path('fileview/', fileview, name='uploadview'),
    # 审核通过文件
    path('approved/', ApproveFileView, name='approved_file'),
    ## 返回所有文件情况
    path('reviewlist/', ListReviewFilesView, name='approved_file'),
    ## 返回单个文件结果
    # path('approvefile/', ApproveFile, name='approvefile'),
    # 返回所有已审核文件
    path('approvelist/', ListApprovedFilesView, name='file_list'),
    ### 查看单个审核文件
    path('approvefile/', ApprovedFilesView, name='approvefile'),
    ### 广泛查询
    path('widely_search/', widely_search, name='widely_search'),
    ### 后台管理###数据集合查看
    path('datasetview/', datasetview, name='datasetview'),
    ##查看数据集
    path('dataview/', dataview, name='dataview'),
    ## 单文件下载
    path('download/', download_file, name='download'),
    ## 数据中心列表
    path('datatop/', data_top, name='datatop'),
    ## 数据导览
    path('requiredlist/', requiredlist, name='requiredlist'),
    ## 数据资源
    path('dataresource/', DataResource, name='dataresource'),
    ## 资讯中心列表
    path('Centerrecour/', CentreResource, name='centerrecour'),
    ## 成果展示
    path('ressourceshow/', RessourceShow, name='RessourceShow'),
    ## 资讯中心上传接口
    path('uploadress/', UploadRess, name='RessourceShow'),
    ## 最新资讯筛选接口
    path('latestnews/', LatestNewsFilter, name='LatestNewsFilter'),
    # ## 资讯中心
    # path('information_list/', InformationList, name='information_list'),
    # path('information_detail/', InformationDetail, name='information_detail'),
    ### 文件预览
    path('data_render/', data_render, name='data_render'),
    ### 批量数据集下载
    path('batchdownload/', batch_download, name='batch_download'),
    ### 批量文件数据集下载
    path('batchfile_download/', batchfile_download, name='batchfile_download'),
    ###研究团队信息查找
    path('expert_team/', Expertquiry, name='expert_team'),
    ### 团队，专家信息表格下载
    path('download_expert_team/', download_expert_team, name='expert_team'),
    ## 主页图片获取
    path('gethomepage/', gethomepage, name='gethomepage'),
    ## 主页图片上传
    path('uphomepage/', Uphomepage, name='uphomepage'),
    ## 主页图片替换
    path('replace_homepng/', replace_homepng, name='replace_homepng'),
    ### 首页图片
    # path('latest/', get_latest_homepage_images, name='latest-homepage-images'),
    ### 上传首页图片
    # path('upload_homepage_images/', upload_homepage_images, name='upload_homepage_images'),
    ### 替换首页图片
    # path('add_or_replace_homepage_image/', add_or_replace_homepage_image, name='add_or_replace_homepage_image'),
    # ###获取首页图片
    # path('latest/', get_latest_homepage_images, name='latest-homepage-images'),
    # ### 上传表文件
    # path('upload_form/', upload_file, name='upload_file'),
    # ### 下载文件
    # path('download/<int:file_id>/', download_file, name='download_file'),
    # ### 获取文件
    # path('get_form/<int:file_id>/', get_file_info, name='get_file_info'),
]
