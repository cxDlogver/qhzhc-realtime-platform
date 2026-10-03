import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.header import Header
import random
import string


def generate_verification_code(length=6):
    """生成随机验证码"""
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))


def send_email(to_email, smtp_server, smtp_port, user, password, subject, html_content,username):
    try:
        message = MIMEMultipart('alternative')
        part = MIMEText(html_content, 'html')
        message.attach(part)
        message['From'] = f'"{Header("清华走航车官方", "utf-8").encode()}" <{user}>'  # 发件人地址和显示名称
        message['To'] = f'"{Header(f"{username}", "utf-8").encode()}" <{to_email}>'
        message['Subject'] = Header(subject, 'utf-8')
        server = smtplib.SMTP_SSL(smtp_server, smtp_port)
        server.login(user, password)
        server.sendmail(user, [to_email], message.as_string())
        server.quit()
        return True
    except smtplib.SMTPException as e:
        print(f"邮件发送失败: {e}")
        return False
