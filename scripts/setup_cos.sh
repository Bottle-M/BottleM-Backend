#!/bin/bash

# 设置COSCLI工具
./coscli config set --secret_id $QCLOUD_SECRET_ID --secret_key $QCLOUD_SECRET_KEY  

# 设置新的储存桶
./coscli config add -b <YOUR_BUCKET> -r ap-chengdu -a minecraft