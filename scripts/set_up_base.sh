#!/bin/bash
# 克隆实例端源码
git clone https://gitee.com/somebottle/BottleM-InsSide.git


if [[ $? -ne 0 ]]; then
    # 克隆代码失败
    echo "Failed to Clone Code"
    exit 1
fi

cd BottleM-InsSide

npm install

# 使用--data或-d选项指定数据目录，Backend会往这个目录中传输文件

screen -dmS bottlem node index.js --data /root/baseData

#forever start index.js --data /root/baseData 2>&1