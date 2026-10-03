import os
from docx import Document
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.shared import Pt
import random
import psycopg2
import subprocess
import uuid
from psycopg2 import extras
from psycopg2 import sql
import psycopg2
from datetime import datetime,timedelta
import re

from db_config import get_database_connection_kwargs



def parse_docx_to_html_files(docx_path, output_dir):
    resdict = dict()
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    doc = Document(docx_path)
    current_section = None
    current_section_content = []
    section_title_stack = []
    html_files = {}

    def get_hyperlink_target(paragraph):
        for run in paragraph.runs:
            for element in run._element.iter():
                if element.tag.endswith('}hyperlink'):
                    rel_id = element.get(qn('r:id'))
                    part = doc.part.related_parts[rel_id]
                    target_ref = part.target_ref
                    return target_ref
        return None
    flag = 0
    for paragraph in doc.paragraphs:
        # Check if the paragraph is a heading
        if paragraph.style.name.startswith('Heading'):
            level = int(paragraph.style.name.split()[-1])

            # Process the current section's content (if any)
            if current_section and current_section_content:
                write_section_to_html(current_section, current_section_content, html_files, output_dir)
                current_section_content = []

                # Update the current section and title stack
            if level > len(section_title_stack):
                section_title_stack.append(paragraph.text)
            elif level < len(section_title_stack):
                section_title_stack = section_title_stack[:level]
            else:
                section_title_stack[-1] = paragraph.text

            current_section = '/'.join(section_title_stack)

            # Create a file for the new section (if not already created)
            if current_section not in html_files:
                flag +=1
                resdict[flag] = [paragraph.text, os.path.join(output_dir, f"{flag}.html")]
                html_files[current_section] = open(
                    os.path.join(output_dir, f"{flag}.html"), 'w', encoding='utf-8')
                # html_files[current_section].write(
                #     "<html>\n<head><title>{}</title></head>\n<body>\n".format(current_section))

                # Write the new section title to the file
            title_html = f"<h{level}>{paragraph.text}</h{level}>\n"
            if (hyperlink := get_hyperlink_target(paragraph)):
                title_html = f"<h{level}><a href='{hyperlink}'>{paragraph.text}</a></h{level}>\n"
            # html_files[current_section].write(title_html)

        else:
            # Regular paragraph, add to the current section's content
            content_html = "<p>"
            if (hyperlink := get_hyperlink_target(paragraph)):
                # Assuming the entire paragraph is a link for simplicity
                content_html += f"<a href='{hyperlink}'>"
            content_html += paragraph.text.replace('<', '&lt;').replace('>', '&gt;')  # Basic HTML escaping
            if hyperlink:
                content_html += "</a>"
            content_html += "</p>\n"
            current_section_content.append(content_html)

            # Process the last section's content (if any)
    if current_section and current_section_content:
        write_section_to_html(current_section, current_section_content, html_files, output_dir)

        # Close all HTML files
    for file in html_files.values():
        file.write("</body>\n</html>\n")
        file.close()
    return resdict


def write_section_to_html(section_title, section_content, html_files, output_dir):
    html_content = ''.join(section_content)
    html_files[section_title].write(html_content)


# if __name__ == "__main__":
#     docx_path = "your_document.docx"  # Replace with your DOCX file path
#     output_dir = "output_html"  # Replace with your desired output directory
#     parse_docx_to_html_files(docx_path, output_dir)
meta_tag = '<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />\n'

def witremeta(htmlpath):
    with open(htmlpath, 'r', encoding='utf-8') as file:
        html_content = file.read()
        file.close()
        # 要插入的meta标签
    # 判断是否需要保留DOCTYPE声明
    if html_content.startswith('<!DOCTYPE html>'):
        # 如果HTML内容以<!DOCTYPE html>开头，则在它之后插入meta标签
        html_content = '<!DOCTYPE html>\n' + meta_tag + html_content[len('<!DOCTYPE html>\n'):]
    else:
        # 否则，直接将meta标签放在最前面
        html_content = meta_tag + html_content
        # 输出或保存修改后的HTML内容
    # 如果要保存到文件
    with open(htmlpath, 'w', encoding='utf-8') as file:
        file.write(html_content)
        file.close()


### 调整html样式
def orderhtml(htmlpath):
    with open(htmlpath, 'r', encoding='utf-8') as file:
        html_content = file.read()
        file.close()
    # 定义 CSS 样式
    css_style = """  
      <style>  
          body {  
              text-indent: 2em; 
              line-height: 32px;
          }  
          img {  
              display: block; /* 移除图片下方的空白间隙 */  
              margin: 0 auto; /* 水平居中 */  
              max-width: 125%; /* 限制图片最大宽度为容器宽度 */  
              height: auto; /* 保持图片比例 */  
              max-height: 500px; /* 可选：限制图片最大高度 */ 
              height: auto; /* 保持图片比例 */  
          }  
          /* 你可以根据需要添加更多的 CSS 样式 */  
          .custom-class {  
              font-size: 20px; /* 示例：为特定类设置字体大小 */  
          }  
        html {
            background: #242F3E;
            color: #fff;
            }
        a {
            color: #0095FF
            }
      </style>  
      """
    # 将 CSS 样式添加到 HTML 文档的 <head> 部分
    # 注意：这里假设原始的 HTML 没有 <head> 部分，所以我们手动添加
    modified_html = f"""  
      <!DOCTYPE html>  
      <html lang="en">  
      <head>  
          {css_style}
      </head>  
      <body>
          {html_content}  
      </body>  
      </html>  
      """
    with open(htmlpath, "w", encoding='utf-8') as html_file:
        html_file.write(modified_html)
        html_file.close()
    ###写入中文开头
    witremeta(htmlpath)
    print(f"HTML 文件已生成：{htmlpath}")


def getFiles(path, suffix):
    return [os.path.join(root, file) for root, dirs, files in os.walk(path) for file in files if
            file.endswith(suffix)]

RESOURCE_TABLE = "api_datares"


#  进行数据入库操作
def datatodb(titlename,htmlpath):
    # 获取数据库连接
    # 测试环境数据库
    dbConn = psycopg2.connect(**get_database_connection_kwargs())
    cursor = dbConn.cursor()
    # 找出对应的uuid
    # rollid = fileinfo2uuid(f'{titlename}{filetype}{describtion}{author}{filetime}{fileurl}')
    # 对应的数据表名 data_pred_partial_least_squares_product
    # 找出表中最大数据ID
    # Prediction_time = datetime.datetime(forcast_year, forcast_mon, 1)
    cursor.execute(
        sql.SQL("UPDATE {} SET htmlpath = %s WHERE titlename LIKE %s").format(
            sql.Identifier(RESOURCE_TABLE),
        ),
        (htmlpath, f"%{titlename}"),
    )
    dbConn.commit()
    # 释放资源
    cursor.close()
    dbConn.close()


if __name__ == "__main__":
    docx_dir = fr"C:\Users\Administrator\Desktop\20241022"  # 替换为你的 DOCX 文件路径
    docxnamelist = ['甲烷排放监测与扩散模式研究论文.docx', '论文.docx', '文献梳理-相关文献论文里的资料.docx','项目.docx','专软著利.docx']
    docxdir = os.path.splitext(os.path.basename(docx_path))[0]
    output_dir = fr"{os.path.dirname(__file__)}/html/{docxdir}"  # 替换为你希望输出 HTML 文件的目录
    resdict = parse_docx_to_html_files(docx_path, output_dir)
    print(resdict)
    htmlist = getFiles(output_dir, ".html")
    for htmlpath in htmlist:
        orderhtml(htmlpath)
    #### 将生成的html进行入库处理
    for key, value in resdict.items():
        datatodb(value[0], value[1])

