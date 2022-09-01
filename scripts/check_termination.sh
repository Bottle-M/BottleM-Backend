#!/bin/bash
# 检查竞价实例是否待回收的脚本
# 如果脚本没有输出任何内容，则说明实例即将被回收！
# 参考文献：https://cloud.tencent.com/document/product/213/37970

# 通过curl请求竞价实例是否即将被回收
# 如果返回的状态码是404，说明一切正常
QUERY_TERMINATION_TIME=$(curl -sIL -w "%{http_code}" -o /dev/null metadata.tencentyun.com/latest/meta-data/spot/termination-time)

if [ $QUERY_TERMINATION_TIME == 404 ]; then
    # 一切正常
    echo "alive"
fi