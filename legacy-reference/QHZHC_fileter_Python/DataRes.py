import psycopg2

import subprocess
import os
import uuid
from psycopg2 import extras
import psycopg2
from datetime import datetime,timedelta
import re

from db_config import get_database_connection_kwargs


#获取对应的uuid的值
def fileinfo2uuid(cstring=None,reprotzone=None):
    # tname:类型名称，fname:文件名称，ctime:文件创建时间
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f'{cstring}_{reprotzone}'))


def doc2pdf_linux(docPath, pdfPath):
    """
    允许的文档格式：doc，docx
    仅在linux平台下可以
    需要在linux中下载好libreoffice
    """
    #  注意cmd中的libreoffice要和linux中安装的一致
    cmd = 'libreoffice --headless --convert-to pdf'.split() + [docPath] + ['--outdir'] + [pdfPath]
    # cmd = 'libreoffice6.2 --headless --convert-to pdf'.split() + [docPath]
    p = subprocess.Popen(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE)
    p.wait(timeout=30)  # 停顿30秒等待转化
    stdout, stderr = p.communicate()
    if stderr:
        raise subprocess.SubprocessError(stderr)

def getFiles(path, suffix):
    return [os.path.join(root, file) for root, dirs, files in os.walk(path) for file in files if file.endswith(suffix)]


RESOURCE_TABLE = "api_datares"


#  进行数据入库操作
def datatodb(titlename,filetype, describtion, author,filetime,fileurl):
    # 获取数据库连接
    # 测试环境数据库
    dbConn = psycopg2.connect(**get_database_connection_kwargs())
    cursor = dbConn.cursor()
    # 找出对应的uuid
    rollid = fileinfo2uuid(f'{titlename}{filetype}{describtion}{author}{filetime}{fileurl}')
    # 对应的数据表名 data_pred_partial_least_squares_product
    # 找出表中最大数据ID
    # Prediction_time = datetime.datetime(forcast_year, forcast_mon, 1)
    INSERT_sql = f"INSERT INTO {RESOURCE_TABLE} (id,titlename,filetype, describtion, author,filetime,fileurl" \
                 f") VALUES %s"
    insert_list = [(rollid, titlename,filetype, describtion, author,filetime,fileurl)]

    # try:
    extras.execute_values(cursor, INSERT_sql, insert_list, page_size=1)
    # print(fr"reporttime:{reporttime}")
    print("插入成功")
    dbConn.commit()
    # 释放资源
    cursor.close()
    dbConn.close()
   # # print(res)  # 3
   #  except:
   #      # 回滚
   #      dbConn.rollback()
   #      print("插入失败")
   #  finally:
   #      dbConn.commit()
   #      # 释放资源
   #      cursor.close()
   #      dbConn.close()
   #

if __name__ == '__main__':
    path = fr""
    # docxlist = getFiles(fr"C:\Users\Administrator\Desktop\20241022", ".docx")
    # for docx in docxlist:
    #     pdfpath = docx.replace("docx","pdf")
    #     doc2pdf_linux(docx, pdfpath)
    #     print(f"{pdfpath}已经完成转换！")
    #     ## 将转换的数据进行入库处理
    #     filename = os.path.basename(pdfpath)
    #     if pdfpath.find("论文")>=0:
    #         filetype = fr"论文"
    #     elif pdfpath.find("项目")>=0:
    #         filetype = fr"项目"
    #     elif pdfpath.find("模型算法") >= 0:
    #         filetype = fr"模型算法"
    #     elif pdfpath.find("相关文献") >= 0:
    #         filetype = fr"相关文献"
    #     elif pdfpath.find("政策法规") >= 0:
    #         filetype = fr"政策法规"
    #     elif pdfpath.find("专软著利") >= 0:
    #         filetype = fr"专软著利"
    #     elif pdfpath.find("新闻") >= 0:
    #         filetype = fr"新闻"
    #     elif pdfpath.find("协议") >= 0:
    #         filetype = fr"协议"
    #     elif pdfpath.find("账号注册") >= 0:
    #         filetype = fr"账号注册"
    # titlename, filetype, describtion, author, filetime, fileurl
    titlename = fr"38 位院士、500余名专家齐聚！聚焦这些领域！"
    filetype = fr"新闻动态"
    describtion =fr" 8 月8日上午，中国工程院工程科技学术研讨会——“甲烷管控减排”暨煤炭安全智能精准开采协同创新组织”成立七周年国际学术研讨会暨2024安全科学与工程国际产学研用合作会议在合肥隆重举行。"
    author = fr"ICON 清华大学碳中和研究院"
    filetime = '2024-08-08'
    fileurl = fr"http://175.27.170.78/pdf/%E6%96%B0%E9%97%BB%E5%8A%A8%E6%80%81.pdf"
    datatodb(titlename, filetype, describtion, author, filetime, fileurl)
    ###使用untutu上的
