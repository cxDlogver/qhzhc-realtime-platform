from django.shortcuts import render
from django.http import request,HttpResponse

from django.http import HttpResponse, HttpResponseRedirect
from django.core.cache import cache
import uuid
import json


POST_FORM = '''
<form method='post' action='/api/chart/test_get_post'>
    用户名：<input type='text' name='uname'>
    <input type='submit' value='提交'>
</form>
'''


def search_get(request):
    request.encoding = 'utf-8'
    if 'q' in request.GET and request.GET['q']:
        message = '你搜索的内容为: ' + request.GET['q']
    else:
        message = '你提交了空表单'
    return HttpResponse(message)

## post请求
def postrequest(request):
    request.encoding = 'utf-8'


# 获取对应的uuid的值
def fileinfo2uuid(cstring=None,reprotzone=None):
    # tname:类型名称，fname:文件名称，ctime:文件创建时间
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f'{cstring}_{reprotzone}'))


def response_as_json(data):
    json_str = json.dumps(data)
    response = HttpResponse(
        json_str,
        content_type="application/json;chartset=utf-8",
    )
    response["Access-Control-Allow-Origin"] = "*"
    return response


def json_response(data, code=200):
    data = {
        "code": code,
        "msg": "success",
        "data": data,
    }
    return response_as_json(data)


def json_error(error_string="error", code=500, **kwargs):
    data = {
        "code": code,
        "msg": error_string,
        "data": {}
    }
    data.update(kwargs)
    return response_as_json(data)


JsonResponse = json_response
JsonError = json_error

from django.core.cache import cache
### 测试


def main_get(request):
    request.encoding = 'utf-8'
    ###### 传入遍历次数
    print(request.GET)
    cishu= request.GET.get('q')
    print(cishu)
    redis_key = fileinfo2uuid(
        f'main_get-{cishu}')
    if cache.has_key(redis_key):
        redis_data = cache.get(redis_key)
        return json_response(redis_data, 202)
    dict = {}
    for i in range(int(cishu)):
        dict[i] = i
    res_data = dict
    ### 设置过期时间
    cache.set(redis_key, res_data, 60 * 60)
    return JsonResponse(res_data)



def main_page(request):
    html = """
    <h4>这是我的网站首页</h4>
    <a href="http://www.baidu.com/" target="_blank">百度网址</a>
    """
    return HttpResponse(html)


def test_get_post(request):
    if request.method == 'GET':
        print(request.GET)
        print(request.GET['m'])
        print(request.GET.getlist('m'))
        print(request.GET.get('t', 'no t'))
        return HttpResponse(POST_FORM)
    elif request.method == 'POST':
        request.encoding = 'utf-8'
        # 处理用户提交数据
        print('uname is : ', request.POST['uname'])
        return HttpResponseRedirect('/api/chart/main_page')
    else:
        pass

    return HttpResponse('test get post ok')


