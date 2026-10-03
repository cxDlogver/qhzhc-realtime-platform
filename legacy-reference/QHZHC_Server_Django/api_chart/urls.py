from django.urls import path
from django.urls import re_path
from . import chartdatatrans, views, weather
urlpatterns = [
    # PRI数据展示
    path('dataTrans/5min', chartdatatrans.dataTrans_5min, name='dataTrans_5min'),
    path('dataTrans/between', chartdatatrans.dataTrans_between, name='dataTrans_between'),
    path('weather', weather.weather_forecast, name='weather'),
    ###测试主页
    path('main_page', views.main_page,name= 'main_page'),
    ### post请求接口
    path('test_get_post', views.test_get_post, name='test_get_post'),
    re_path('main_get', views.main_get, name='main_get'),
]
