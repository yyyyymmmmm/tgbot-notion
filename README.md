# tgbot-notion
tg机器人通过cloudfare对接notion
## 一、获得相关token
- notion—token
- notion-id
- tg-token
- worker地址
## 二、具体步骤
- 在cloudfare新建worker
- 粘贴代码修改个人信息
> https://api.telegram.org/botxxx/setWebhook?url=https://yyy.yy.workers.dev/xxx
> xxx:tg-token
> yyy:worker地址
成功截图：
> ![image](https://github.com/user-attachments/assets/7a47311a-edfa-458c-b1b4-66f4a76288d6)
- 查看配置成功与否：
- https://api.telegram.org/bot8029665644:AAEwB9oi-NCAObluhEdXSJP1ToptV50_r_k/getWebhookInfo
- 成功截图：
- ![image](https://github.com/user-attachments/assets/1bc7e448-4a25-4530-91dc-f319b0a4d800)
