#!/bin/bash
# 克隆实例端源码
git clone https://gitee.com/somebottle/BottleM-InsSide.git

if [[ $? -ne 0 ]]; then
    # 克隆代码失败
    echo "Failed to Clone Code"
    exit 1
fi