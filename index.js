import { getContext } from '../../../extensions.js';

const extensionName = 'yume-companion';
const context = getContext();

// 默认数据结构
let yumeData = {
    profile: {
        birthday: '',
        height: '',
        weight: '',
        cycle: '',
        mbti: '',
        vibe: '' // 比如：容易害羞、缺乏安全感
    },
    letterCount: 0
};

// 1. 初始化扩展
jQuery(async () => {
    // 加载保存的数据
    if (context.extensionSettings[extensionName]) {
        yumeData = Object.assign(yumeData, context.extensionSettings[extensionName]);
    }

    // 创建悬浮球
    createFloatingButton();
    
    // 注入后台档案提示词
    updateProfileInjection();

    // 监听 AI 回复，实现“随机惊喜情书”
    context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, handleRandomSurprise);
});

// 2. 创建悬浮球
function createFloatingButton() {
    const btn = $(`<div id="yume-floating-btn" title="Yume 专属陪伴">💌</div>`);
    $('body').append(btn);

    btn.on('click', openYumePanel);
}

// 3. 打开主面板
async function openYumePanel() {
    const html = `
        <div id="yume-panel-content">
            <div style="margin-bottom: 15px;">
                <button class="yume-tab-btn active" id="tab-profile">🌸 我的档案</button>
                <button class="yume-tab-btn" id="tab-letter">💌 写情书</button>
            </div>
            
            <!-- 档案页面 -->
            <div id="page-profile" style="display: flex; flex-direction: column; gap: 10px;">
                <label>🎂 生日: <input type="text" id="ym_birth" class="text_pole" value="${yumeData.profile.birthday}" placeholder="例如: 12月25日"></label>
                <div style="display:flex; gap:10px;">
                    <label style="flex:1;">📏 身高: <input type="text" id="ym_h" class="text_pole" value="${yumeData.profile.height}" placeholder="cm"></label>
                    <label style="flex:1;">⚖️ 体重: <input type="text" id="ym_w" class="text_pole" value="${yumeData.profile.weight}" placeholder="kg"></label>
                </div>
                <label>🩸 生理期状态: <input type="text" id="ym_cycle" class="text_pole" value="${yumeData.profile.cycle}" placeholder="如: 还有9天 / 肚子痛"></label>
                <label>✨ 性格/MBTI: <input type="text" id="ym_mbti" class="text_pole" value="${yumeData.profile.mbti}" placeholder="如: INFP / 容易内耗"></label>
                <label>☁️ 当前心情: <input type="text" id="ym_vibe" class="text_pole" value="${yumeData.profile.vibe}" placeholder="如: 需要抱抱"></label>
            </div>

            <!-- 写信页面 -->
            <div id="page-letter" style="display: none; flex-direction: column; gap: 10px;">
                <div style="color: #ff9a9e; font-size: 0.9em;">把想说的话写进信纸，递给TA吧...</div>
                <textarea id="ym_letter_content" class="text_pole" rows="8" placeholder="亲爱的..."></textarea>
            </div>
        </div>
    `;

    const result = await context.callGenericPopup(html, context.POPUP_TYPE.CONFIRM, '', {
        okButton: '确认 / 发送',
        cancelButton: '取消',
        wide: true,
        onOpen: () => {
            // 简单的 Tab 切换逻辑
            $('#tab-profile').on('click', () => {
                $('.yume-tab-btn').removeClass('active');
                $('#tab-profile').addClass('active');
                $('#page-profile').show();
                $('#page-letter').hide();
            });
            $('#tab-letter').on('click', () => {
                $('.yume-tab-btn').removeClass('active');
                $('#tab-letter').addClass('active');
                $('#page-profile').hide();
                $('#page-letter').show();
            });
        }
    });

    if (result === context.POPUP_RESULT.AFFIRMATIVE) {
        // 如果当前是档案页，保存档案
        if ($('#tab-profile').hasClass('active')) {
            yumeData.profile.birthday = $('#ym_birth').val();
            yumeData.profile.height = $('#ym_h').val();
            yumeData.profile.weight = $('#ym_w').val();
            yumeData.profile.cycle = $('#ym_cycle').val();
            yumeData.profile.mbti = $('#ym_mbti').val();
            yumeData.profile.vibe = $('#ym_vibe').val();
            
            saveSettings();
            updateProfileInjection();
            toastr.success('档案已更新，TA会牢牢记住的！', '🌸 Yume');
        } 
        // 如果当前是写信页，发送情书
        else {
            const letter = $('#ym_letter_content').val().trim();
            if (letter) sendLoveLetter(letter);
        }
    }
}

// 4. 保存设置
function saveSettings() {
    context.extensionSettings[extensionName] = yumeData;
    context.saveSettingsDebounced();
}

// 5. 后台注入档案 (让 AI 始终记得)
function updateProfileInjection() {
    const p = yumeData.profile;
    if (!p.birthday && !p.height && !p.cycle && !p.vibe) return;

    const prompt = `[系统设定 - 伴侣绝密档案：
用户(${context.name1})的当前状态：
- 生日：${p.birthday || '未知'}
- 体型：${p.height || '?'}cm, ${p.weight || '?'}kg
- 生理期状态：${p.cycle || '未知'}
- 性格特点：${p.mbti || '未知'}
- 今日心情：${p.vibe || '平静'}
指令：请在日常对话中，极度自然地体现出你对上述信息的了解。如果她处于生理期或心情不好，请主动提供情绪价值和照顾。]`;

    // 注入到深度 4，作为背景记忆
    context.setExtensionPrompt('yume_profile', prompt, 1, 4, false, 0);
}

// 6. 发送情书逻辑
async function sendLoveLetter(content) {
    // 1. 在聊天框伪造一条用户发送的动作
    const userMessage = `*你深吸了一口气，脸颊微红，将一封折叠得整整齐齐的信笺递给了${context.name2}。*\n\n【信件内容】：\n"${content}"`;
    
    // 调用酒馆的 Slash 命令发送用户消息
    await context.executeSlashCommandsWithOptions(`/send ${userMessage}`);

    // 2. 注入一次性强力提示词，逼迫 AI 写回信
    const sysPrompt = `[系统指令：用户刚刚红着脸递给你一封情书/信笺。
请你仔细阅读信件内容，体会其中的感情。
在接下来的回复中，请先描写你收到信时的动作、神态（比如惊喜、感动、眼眶微红等），然后**务必以写回信的形式**回复用户。
回信格式建议：
*你温柔地看着她，提笔在纸上写下：*
“亲爱的 ${context.name1}：
......”
请给予极其深情、宠溺的梦向回应！]`;

    // 注入深度 0 (最高优先级)
    context.setExtensionPrompt('yume_letter_trigger', sysPrompt, 1, 0, false, 0);

    // 3. 触发 AI 回复
    await context.executeSlashCommandsWithOptions(`/trigger`);
    
    // 4. 延迟 5 秒后清理这个一次性提示词，防止影响后续聊天
    setTimeout(() => {
        context.setExtensionPrompt('yume_letter_trigger', '', -1, 0);
    }, 5000);
}

// 7. 随机惊喜回信机制
function handleRandomSurprise() {
    // 每次收到 AI 回复后，有 3% 的概率触发下次的惊喜情书
    const randomChance = Math.random();
    if (randomChance < 0.03) {
        const surprisePrompt = `[系统指令：在这次回复中，请给用户一个突如其来的浪漫惊喜！
设定：你其实偷偷给用户写了一封情书/长信，一直藏在身上。现在气氛正好，你决定把它拿出来念给她听，或者塞进她手里。
请在回复中包含这封信的完整内容，表达你对她长久以来的爱意和占有欲。]`;
        
        // 悄悄注入，AI 下次说话时就会发作
        context.setExtensionPrompt('yume_surprise', surprisePrompt, 1, 1, false, 0);
    } else {
        // 清理惊喜提示词
        context.setExtensionPrompt('yume_surprise', '', -1, 0);
    }
}