import mammoth
from bs4 import BeautifulSoup

meta_tag = '<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />\n'


def convert_docx_to_html(docx_path):
    with open(docx_path, "rb",) as docx_file:
        result = mammoth.convert_to_html(docx_file)
        return result.value  # 返回 HTML 字符串


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


if __name__ == "__main__":
    docx_path = fr"C:\Users\Administrator\Desktop\20241022\新闻动态.docx"  # 替换为你的 DOCX 文件路径
    html_path = "新闻动态.html"
    html_content = convert_docx_to_html(docx_path)
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
             text-align: center;
             color: white;
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
    with open(html_path, "w", encoding='utf-8') as html_file:
        html_file.write(modified_html)
        html_file.close()
    ###写入中文开头
    witremeta(html_path)
    ###
    print(f"HTML 文件已生成：{html_path}")