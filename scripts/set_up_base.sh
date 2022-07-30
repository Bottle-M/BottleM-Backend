#!/bin/bash
# 克隆实例端源码
git clone https://gitee.com/somebottle/BottleM-InsSide.git


if [[ $? -ne 0 ]]; then
    # 克隆代码失败
    echo "Failed to Clone Code"
    exit 1
fi

# （暂时）为临时配置文件创建软链接
ln -s 'ins_side_configs.tmp.json' './BottleM-InsSide/ins_side_configs.tmp.json'

cd BottleM-InsSide

npm install

forever start index.js 2>&1