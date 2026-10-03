"""
注意事项：
    1.先配置好文件路径，数据库，表名
    2.关于时间time，拼装时是否需要 +‘20’ 前缀
    3.一些特殊列名是否需要处理，如列名中带有特殊符号的。
    4.df字段类型，带有时区的话要选择对的时区 dt.tz_localize('Asia/Shanghai')
"""
import os.path

import pandas as pd
from sqlalchemy import create_engine, Table, MetaData
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from datetime import datetime
import time

from db_config import get_sqlalchemy_database_url

#from sqlalchemy.orm import sessionmaker

path = fr"E:\2024_QH_ZHC\Code\QHZHC_fileter\sample_data\PRI.csv"    # 文件路径
#### 测试数据表
table_name = 'pri_parse_test'  # 替换表名，数据库中表的名字
database = get_sqlalchemy_database_url()

# 读取 CSV 文件
df = pd.read_csv(path, header=0, encoding='latin1')

df['time'] = df['Date'].add(' ').add(df['Time'])
df = df.drop(['Time'], axis=1)
df = df.drop(['Date'], axis=1)

# 将时间放在第一列
new_order = ['time'] + [col for col in df.columns if col != 'time']
df = df.reindex(columns=new_order)

# 列名称全换成小写，空格换成下划线
df.rename(columns=lambda x: str.lower(x).replace(' ', '_'), inplace=True)

# 设置df的类型，time为带时区，其余字段全为字符
df = df.astype(str)
df['time'] = pd.to_datetime(df['time']).dt.tz_localize('Asia/Shanghai')


print(df)
# # 创建数据库连接
engine = create_engine(database)

# 创建元数据对象
metadata = MetaData()

# 反射表，将已有的表的结构提取出来
table = Table(table_name, metadata, autoload_with=engine)

# 将 DataFrame 转换为字典列表
data_dict = df.to_dict(orient='records')

# 每执行一行，要手动commit，保证数据库里实时更新
with engine.connect() as conn:
    # conn.execute(table.delete())  # 清空表
    # conn.commit()  # 提交事务
    i = 0
    for record in data_dict:
        record['time'] = datetime.now().astimezone().strftime('%Y-%m-%d %H:%M:%S')    # 设置time为当前时间，模拟实时入库，小数点要不要处理？
        stmt = insert(table).values(record)
        try:
            conn.execute(stmt)
            conn.commit()
            print(f"已插入记录:{i} {record}")
            i = i+1
        except IntegrityError as e:
            print(f"IntegrityError: {e.orig}")
        except Exception as e:
            print(f"Error: {e}")
        # 设置延迟
        time.sleep(1)


#
# # 插入数据并处理主键冲突（可能可以用于处理主键冲突问题，待验证）
##
# with engine.connect() as conn:
#     for record in data_dict:
#         stmt = insert(your_table).values(record)
#         update_dict = {col: stmt.excluded[col] for col in record.keys() if col != 'time'}
#         stmt = stmt.on_conflict_do_update(
#             index_elements=['time'],  # 主键列
#             set_=update_dict
#         )
#         print(record)
#         conn.execute(stmt)
#         print("插入成功")
#         time.sleep(1)  # 模拟实时插入，每次插入后等待1秒


# # 逐行插入数据并立即提交（基于session的方法，效率可能不高，但有一些高级用法）
##
# Session = sessionmaker(bind=engine)
# session = Session()
# for record in data_dict:
#     print(f"Inserting record: {record}")  # 调试输出
#     stmt = insert(table).values(record)
#     try:
#         session.execute(stmt)
#         session.commit()  # 提交事务
#         print(f"Record inserted: {record}")
#     except IntegrityError as e:
#         print(f"IntegrityError: {e.orig}")
#         session.rollback()  # 回滚事务
#     except Exception as e:
#         print(f"Error: {e}")
#         session.rollback()  # 回滚事务
#     time.sleep(1)
# session.close()  # 关闭会话
