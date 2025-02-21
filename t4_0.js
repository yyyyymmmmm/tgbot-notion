// ================== 配置部分 ==================
const NOTION_TOKEN = 'ntn_b32235170706VL1CKuyYng7TG47wZPdkMHtfbEn3IBgegv';
const DATABASE_ID = '1a10c022f78e80cd9019d7c146ddf306';
const TG_TOKEN = '8029665644:AAEwB9oi-NCAObluhEdXSJP1ToptV50_r_k';
const VERSION = '1.2';

// ================== 工具函数 ==================
function escapeMD(text) {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

function generateTags(content) {
  const customTags = [...new Set(content.match(/#(\p{L}+)/gu) || [])]
    .map(t => t.slice(1));
  
  const AUTO_TAGS = {
    '工作': ['会议', '项目', '汇报', '客户'],
    '学习': ['笔记', '课程', '论文', '阅读'],
    '生活': ['购物', '食谱', '健康', '旅行']
  };
  
  const autoTags = Object.entries(AUTO_TAGS)
    .filter(([_, keywords]) => keywords.some(kw => content.includes(kw)))
    .map(([tag]) => tag);

  return [...new Set([...customTags, ...autoTags])];
}

// ================== Notion 交互 ==================
function getNotionHeaders() {
  return {
    'Authorization': `Bearer ${NOTION_TOKEN}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28'
  };
}

async function saveToNotion({ title, content, tags, children, userId }) {
  const body = {
    parent: { database_id: DATABASE_ID },
    icon: {
      type: 'emoji',
      emoji: '📘'
    },
    properties: {
      '标题': { 
        title: [{ text: { content: title.substring(0, 200) } }] 
      },
      '内容': {
        rich_text: [{ text: { content: content.substring(0, 2000) } }]
      },
      '标签': {
        multi_select: tags.slice(0, 5).map(tag => ({ name: tag }))
      },
      '日期': {
        date: { start: new Date().toISOString() }
      },
      '用户ID': {
        rich_text: [{ text: { content: userId.toString() } }]
      }
    },
    children: [
      ...(children || []),
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ text: { content: content + '\n\n' } }]
        }
      }
    ]
  };

  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: getNotionHeaders(),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Notion API错误: ${error.message}`);
  }
  return await response.json();
}

// ================== 统计功能 ==================
async function fetchNotionCount(filter) {
  let hasMore = true;
  let startCursor;
  let totalCount = 0;

  while (hasMore) {
    const body = {
      filter: filter,
      page_size: 100
    };
    if (startCursor) body.start_cursor = startCursor;

    const response = await fetch(
      `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
      {
        method: 'POST',
        headers: getNotionHeaders(),
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) throw new Error('统计请求失败');
    const data = await response.json();
    totalCount += data.results.length;
    hasMore = data.has_more;
    startCursor = data.next_cursor;
  }
  return totalCount;
}

async function fetchTodayCount(userId) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const filter = {
    and: [
      { property: '用户ID', rich_text: { equals: userId.toString() } },
      { property: '日期', date: { on_or_after: todayStart.toISOString() } },
      { property: '日期', date: { on_or_before: todayEnd.toISOString() } }
    ]
  };

  return await fetchNotionCount(filter);
}

async function fetchWeekCount(userId) {
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const filter = {
    and: [
      { property: '用户ID', rich_text: { equals: userId.toString() } },
      { property: '日期', date: { on_or_after: weekStart.toISOString() } },
      { property: '日期', date: { on_or_before: weekEnd.toISOString() } }
    ]
  };

  return await fetchNotionCount(filter);
}

async function fetchUserCreationDate(userId) {
  const filter = {
    property: '用户ID',
    rich_text: { equals: userId.toString() }
  };

  const response = await fetch(
    `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
    {
      method: 'POST',
      headers: getNotionHeaders(),
      body: JSON.stringify({
        filter: filter,
        sorts: [{ property: '日期', direction: 'ascending' }],
        page_size: 1
      })
    }
  );

  if (!response.ok) throw new Error('获取创建时间失败');
  const data = await response.json();
  return data.results[0]?.properties.日期.date.start || '未知';
}

// ================== Notion 搜索函数 ==================
async function searchNotion(query = '', tag = '') {
  const filters = [];
  
  if (tag) {
    filters.push({ 
      property: '标签', 
      multi_select: { contains: tag } 
    });
  }
  
  if (query) {
    filters.push(
      { property: '标题', title: { contains: query } },
      { property: '内容', rich_text: { contains: query } }
    );
  }

  const response = await fetch(
    `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
    {
      method: 'POST',
      headers: getNotionHeaders(),
      body: JSON.stringify({
        filter: filters.length ? { or: filters } : undefined,
        page_size: 5
      })
    }
  );

  if (!response.ok) throw new Error('搜索请求失败');
  
  const data = await response.json();
  return data.results.map(page => ({
    title: page.properties.标题.title[0]?.text.content || '无标题',
    url: page.url,
    tags: page.properties.标签.multi_select.map(t => t.name)
  }));
}

// ================== Telegram 交互 ==================
async function sendMessage(chatId, text, replyTo = null, markdown = true) {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: markdown ? text : escapeMD(text),
          reply_to_message_id: replyTo,
          parse_mode: markdown ? 'MarkdownV2' : undefined,
          disable_web_page_preview: true
        })
      }
    );
    
    if (!response.ok) {
      console.error('Telegram API错误:', await response.text());
    }
  } catch (error) {
    console.error('发送消息失败:', error);
  }
}

async function sendFormattedMessage(chatId, header, sections, replyTo) {
  const message = [
    `*${escapeMD(header)}*`,
    ...sections.map(s => `
${s.icon} *${escapeMD(s.title)}*
${escapeMD(s.content)}`)
  ].join('\n');

  await sendMessage(chatId, message, replyTo);
}

// ================== 命令处理器 ==================
async function handleCommand(message) {
  const [command, ...args] = message.text.split(' ');
  const query = args.join(' ');

  try {
    switch (command.toLowerCase()) {
      
      case '/start':
        await sendFormattedMessage(
          message.chat.id,
          '📚 智能知识库助手',
          [
            {
              icon: '🚀',
              title: '欢迎使用',
              content: '您的智能信息管理中心\n版本：' + VERSION
            },
            {
              icon: '📌',
              title: '快速开始',
              content: '直接发送内容即可保存\n使用 /help 查看详细指南'
            }
          ],
          message.message_id
        );
        break;

      case '/help':
        await sendFormattedMessage(
          message.chat.id,
          '帮助中心',
          [
            {
              icon: '📊',
              title: '状态查询',
              content: '/status - 查看账户信息和使用统计'
            },
            {
              icon: '📥',
              title: '保存内容',
              content: '• 文本（自动提取标签）\n• 支持图片/文档/音视频\n• 使用 #标签 进行分类'
            },
            {
              icon: '🔍',
              title: '搜索语法',
              content: '/search [关键词] [#标签]\n示例：\n/search 项目进度\n/search #工作'
            }
          ],
          message.message_id
        );
        break;

      case '/search':
        const tagMatch = query.match(/#(\p{L}+)/u);
        const searchQuery = query.replace(/#\p{L}+/u, '').trim();
        const tagFilter = tagMatch?.[1] || '';
    
        const results = await searchNotion(searchQuery, tagFilter);
        
        if (results.length === 0) {
          await sendMessage(
            message.chat.id,
            `🔍 未找到${searchQuery ? `与「${searchQuery}」相关` : ''}${
              tagFilter ? ` #${tagFilter} 分类` : ''
            }的内容`,
            message.message_id,
            false
          );
          return;
        }

        const resultText = results
          .map((r, i) => `${i + 1}. [${r.title}](${r.url})\n标签：${r.tags.join(', ')}`)
          .join('\n\n');

        await sendFormattedMessage(
          message.chat.id,
          '📂 搜索结果',
          [
            {
              icon: '🔍',
              title: '搜索条件',
              content: [
                searchQuery && `关键词：${searchQuery}`,
                tagFilter && `标签：#${tagFilter}`
              ].filter(Boolean).join('\n')
            },
            {
              icon: '📌',
              title: `找到 ${results.length} 条结果`,
              content: resultText || '无内容'
            }
          ],
          message.message_id
        );
        break;

      case '/status':
        const user = message.from;
        try {
          const [todayCount, weekCount, creationDate] = await Promise.all([
            fetchTodayCount(user.id),
            fetchWeekCount(user.id),
            fetchUserCreationDate(user.id)
          ]);

          const statusInfo = [
            `👤 *用户ID*: \`${user.id}\``,
            `📛 *姓名*: ${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`,
            `🔗 *用户名*: ${user.username ? '@' + user.username : '未设置'}`,
            `📅 首次使用: ${new Date(creationDate).toLocaleDateString('zh-CN')}`,
            `🌐 语言: ${user.language_code || '未知'}`
          ];
      
          await sendFormattedMessage(
            message.chat.id,
            '📊 用户状态',
            [
              {
                icon: '🆔',
                title: '账户信息',
                content: statusInfo.join('\n')
              },
              {
                icon: '📈',
                title: '使用统计',
                content: `今日保存: ${todayCount} 条\n本周总计: ${weekCount} 条`
              }
            ],
            message.message_id
          );
        } catch (error) {
          console.error('状态查询失败:', error);
          await sendMessage(
            message.chat.id,
            '❌ 获取统计信息失败，请稍后再试',
            message.message_id,
            false
          );
        }
        break;
      
      default:
        await sendMessage(
          message.chat.id,
          '❌ 未知命令，可用命令：\n/start\n/help\n/search\n/status',
          message.message_id,
          false
        );
    }
  } catch (error) {
    console.error('命令处理错误:', error);
    await sendMessage(
      message.chat.id,
      `❌ 操作失败：${escapeMD(error.message)}`,
      message.message_id,
      false
    );
  }
}


async function processMessage(message) {
  if (!message.text && !message.caption && !message.photo && !message.video && !message.document) {
    console.log('忽略无效消息类型');
    return;
  }

  try {
    if (message.text && message.text.startsWith('/')) {
      await handleCommand(message);
      return;
    }

    // 增强的文件类型处理
    if (message.document || message.photo || message.video) {
      let fileUrl, blockType, fileName;
      const fileInfo = message.document || message.photo?.[message.photo.length - 1] || message.video;

      // 获取文件信息
      if (message.document) {
        fileUrl = await getTelegramFileUrl(fileInfo.file_id);
        blockType = 'file';
        fileName = escapeMD(fileInfo.file_name);
      } else if (message.photo) {
        fileUrl = await getTelegramFileUrl(fileInfo.file_id);
        blockType = 'image';
        fileName = '图片';
      } else if (message.video) {
        fileUrl = await getTelegramFileUrl(fileInfo.file_id);
        blockType = 'video';
        fileName = '视频';
      }

      // 处理文字说明
      const caption = message.caption || '';
      const cleanContent = caption.replace(/#\p{L}+/gu, '').trim();
      const tags = generateTags(caption);

      // 增强的Notion子块构造
      const childrenBlock = {
        object: 'block',
        type: blockType,
        [blockType]: blockType === 'file' ? {
          external: { url: fileUrl },
          name: fileName // 添加文件名显示
        } : {
          external: { url: fileUrl }
        }
      };

      await saveToNotion({
        title: `${getIcon(blockType)} ${message.from.first_name}的${fileName}`,
        content: cleanContent || '无文字说明', // 确保内容不为空
        tags: tags,
        userId: message.from.id,
        children: [childrenBlock]
      });

      // 增强的消息反馈（包含文件类型图标）
      await sendMessage(
        message.chat.id,
        `${getIcon(blockType)} ${fileName} 已成功保存！${tags.length ? '\n标签：' + tags.join(' ') : ''}`,
        message.message_id,
        false // 关闭Markdown避免特殊字符问题
      );
      return;
    }

    // 处理纯文本消息（保持不变）
    if (message.text) {
      const content = message.text;
      const tags = generateTags(content);
      
      await saveToNotion({
        title: `📝 ${message.from.first_name}的笔记`,
        content: content.replace(/#\p{L}+/gu, '').trim(),
        tags: tags,
        userId: message.from.id
      });

      await sendMessage(
        message.chat.id,
        `✅ 文本已保存${tags.length ? '\n标签：' + tags.join(' ') : ''}`,
        message.message_id
      );
      return;
    }

  } catch (error) {
    console.error('处理消息失败:', error);
    await sendMessage(
      message.chat.id,
      `❌ 保存失败：${error.message}`,
      message.message_id,
      false
    );
  }
}

// ================== 增强的文件块处理 ==================
function getIcon(type) {
  const fileIcons = {
    pdf: '📄',
    ppt: '📊',
    pptx: '📊',
    doc: '📑',
    docx: '📑',
    xls: '📈',
    xlsx: '📈',
    zip: '📦',
    rar: '📦',
    md: '📝',
    // 添加更多文件类型图标映射
    default: '📎'
  };

  return fileIcons[type] || fileIcons.default;
}



// ================== 文件URL获取 ==================
async function getTelegramFileUrl(fileId) {
try {
  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/getFile?file_id=${fileId}`);
  const data = await res.json();
  
  if (!data.ok) throw new Error('获取文件信息失败');
  
  return `https://api.telegram.org/file/bot${TG_TOKEN}/${data.result.file_path}`;
} catch (err) {
  console.error('获取文件URL失败:', err);
  throw new Error('无法获取文件链接');
}
}

// ================== Worker入口 ==================
async function handleRequest(request) {
try {
  const url = new URL(request.url);
  
  if (request.method === 'POST' && url.pathname === `/${TG_TOKEN}`) {
    const update = await request.json();
    if (update.message) {
      await processMessage(update.message);
    }
    return new Response('OK');
  }

  return new Response('Not Found', { status: 404 });
} catch (error) {
  console.error('全局错误:', error);
  return new Response(error.stack, { status: 500 });
}
}

addEventListener('fetch', event => {
event.respondWith(handleRequest(event.request));
});
