import { getContext } from '../../../extensions.js';

const context = getContext();
const MODULE_NAME = 'yume-companion';

// 默认数据结构
const defaultSettings = {
    birthday: '',
    height: '',
    weight: '',
    lastPeriod: '',
    cycleLength: '28',
    mbti: '',
    vibe: ''
};

let settings = {};

// 1. 插件初始化
jQuery(async () => {
    // 监听酒馆加载完毕事件
    context.eventSource.on(context.eventTypes.APP_READY, () => {
        loadSettings();
        createFloatingButton();
        updateProfileInjection(); // 启动时注入一次档案
    });

    // 监听 AI 回复事件，用于触发“随机惊喜情书”
    context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, handleRandomSurprise);
});

// 2. 加载与保存设置
function loadSettings() {
    if (!context.extensionSettings[MODULE_NAME]) {
        context.extensionSettings[MODULE_NAME] = {};
    }
    settings = context.extensionSettings[MODULE_NAME];
    for (const key in defaultSettings) {
        if (settings[key] === undefined) {
            settings[key] = defaultSettings[key];
        }
    }
}

function saveSettings() {
    context.extensionSettings[MODULE_NAME] = settings;
    context.saveSettingsDebounced(); // 使用官方推荐的防抖保存
}

// 3. 创建悬浮球
function createFloatingButton() {
    const btn = $(`<div id="yume-floating-btn" title="Yume 专属陪伴">💌</div>`);
    $('body').append(btn);
    btn.on('click', openYumePanel);
}

// 4. 打开主面板 (HTML 弹窗)
async function openYumePanel() {
    // 计算生理期倒计时
    let predictText = "请填写日期";
    if (settings.lastPeriod && settings.cycleLength) {
        const lastDate = new Date(settings.lastPeriod);
        const nextDate = new Date(lastDate.getTime() + settings.cycleLength * 24 * 60 * 60 * 1000);
        const diffDays = Math.ceil((nextDate - new Date()) / (1000 * 60 * 60 * 24));
        if (diffDays > 0) predictText = `预计还有 ${diffDays} 天`;
        else if (diffDays === 0) predictText = `预计今天来临！`;
        else predictText = `已推迟 ${Math.abs(diffDays)} 天`;
    }

    const html = `
        <div id="yume-panel-content">
            <div style="margin-bottom: 20px;">
                <button class="yume-tab-btn active" id="tab-profile">🌸 我的档案</button>
                <button class="yume-tab-btn" id="tab-letter">💌 递交信笺</button>
            </div>
            
            <!-- 档案页面 -->
            <div id="page-profile" style="display: flex; flex-direction: column;">
                <div class="yume-input-row">
                    <label>🎂 生日: <input type="text" id="ym_birth" class="text_pole" value="${settings.birthday}" placeholder="例如: 12月25日"></label>
                    <label>✨ MBTI/性格: <input type="text" id="ym_mbti" class="text_pole" value="${settings.mbti}" placeholder="如: INFP / 容易内耗"></label>
                </div>
                <div class="yume-input-row">
                    <label>📏 身高(cm): <input type="number" id="ym_h" class="text_pole" value="${settings.height}"></label>
                    <label>⚖️ 体重(kg): <input type="number" id="ym_w" class="text_pole" value="${settings.weight}"></label>
                </div>
                <div style="color: #ff6b81; font-size: 0.9em; margin-top: 10px;">🩸 生理期预测: ${predictText}</div>
                <div class="yume-input-row">
                    <label>📅 上次日期: <input type="date" id="ym_last_period" class="text_pole" value="${settings.lastPeriod}"></label>
                    <label>🔄 周期(天): <input type="number" id="ym_cycle" class="text_pole" value="${settings.cycleLength}"></label>
                </div>
                <div class="yume-input-row" style="margin-top: 10px;">
                    <label style="flex: 1;">☁️ 今日心情/身体状态: <input type="text" id="ym_vibe" class="text_pole" value="${settings.vibe}" placeholder="如: 肚子痛需要抱抱 / 很开心"></label>
                </div>
            </div>

            <!-- 写信页面 -->
            <div id="page-letter" style="display: none; flex-direction: column; gap: 10px;">
                <div style="color: var(--SmartThemeBlurple); font-size: 0.95em;">把想说的话写进信纸，递给TA吧...</div>
                <textarea id="ym_letter_content" class="text_pole" rows="8" placeholder="亲爱的..."></textarea>
            </div>
        </div>
    `;

    const result = await context.callGenericPopup(html, context.POPUP_TYPE.CONFIRM, '', {
        okButton: '💾 保存 / 发送',
        cancelButton: '❌ 取消',
        wide: true,
        onOpen: () => {
            // 标签页切换逻辑
            $('#tab-profile').on('click', () => {
                $('.yume-tab-btn').removeClass('active'); $('#tab-profile').addClass('active');
                $('#page-profile').show(); $('#page-letter').hide();
            });
            $('#tab-letter').on('click', () => {
                $('.yume-tab-btn').removeClass('active'); $('#tab-letter').addClass('active');
                $('#page-profile').hide(); $('#page-letter').show();
            });
        }
    });

    if (result === context.POPUP_RESULT.AFFIRMATIVE) {
        if ($('#tab-profile').hasClass('active')) {
            // 保存档案
            settings.birthday = $('#ym_birth').val();
            settings.mbti = $('#ym_mbti').val();
            settings.height = $('#ym_h').val();
            settings.weight = $('#ym_w').val();
            settings.lastPeriod = $('#ym_last_period').val();
            settings.cycleLength = $('#ym_cycle').val();
            settings.vibe = $('#ym_vibe').val();
            
            saveSettings();
            updateProfileInjection();
            toastr.success('档案已更新，TA会把你的一切放在心上。', '🌸 保存成功');
        } else {
            // 发送情书
            const letter = $('#ym_letter_content').val().trim();
            if (letter) sendLoveLetter(letter);
            else toastr.warning('信纸是空的哦~', '提示');
        }
    }
}

// 5. 后台注入档案 (核心 AI 调教)
function updateProfileInjection() {
    let bmiText = "未知";
    if (settings.height && settings.weight) {
        const bmi = settings.weight / Math.pow(settings.height / 100, 2);
        if (bmi < 18.5) bmiText = "体型偏瘦，需要多哄她吃点东西补充营养";
        else bmiText = "身材匀称";
    }

    let periodText = "未知";
    if (settings.lastPeriod && settings.cycleLength) {
        const nextDate = new Date(new Date(settings.lastPeriod).getTime() + settings.cycleLength * 24 * 60 * 60 * 1000);
        const diffDays = Math.ceil((nextDate - new Date()) / (1000 * 60 * 60 * 24));
        if (diffDays > 0 && diffDays <= 7) periodText = `距离生理期还有 ${diffDays} 天（经前期，可能情绪敏感）`;
        else if (diffDays <= 0 && diffDays > -7) periodText = `**正在生理期中**（请给予极大的温柔、保暖和照顾）`;
        else if (diffDays <= -7) periodText = `生理期推迟了 ${Math.abs(diffDays)} 天（可能压力大或太瘦导致，需要安抚）`;
        else periodText = `安全期/排卵期`;
    }

    const prompt = `[系统设定 - 伴侣绝密档案：
用户(${context.name1})的当前状态：
- 生日：${settings.birthday || '未知'}
- 体型：${settings.height || '?'}cm, ${settings.weight || '?'}kg（${bmiText}）
- 生理期状态：${periodText}
- 性格特点：${settings.mbti || '未知'}
- 今日心情：${settings.vibe || '平静'}
指令：请在日常对话中，极度自然地体现出你对上述信息的了解。如果她处于生理期或心情不好，请主动提供情绪价值和照顾。]`;

    // 注入到深度 4 (in_chat, depth 4, role 0=system)
    context.setExtensionPrompt('yume_profile', prompt, 1, 4, false, 0);
}

// 6. 发送情书逻辑
async function sendLoveLetter(content) {
    // 伪造用户动作
    const userMessage = `*你深吸了一口气，脸颊微红，将一封折叠得整整齐齐的信笺递给了${context.name2}。*\n\n【信件内容】：\n"${content}"`;
    await context.executeSlashCommandsWithOptions(`/send ${userMessage}`);

    // 注入一次性强制回信指令 (深度 0，最高优先级)
    const sysPrompt = `[系统指令：用户刚刚红着脸递给你一封情书/信笺。
请仔细阅读信件内容。在接下来的回复中，请先描写你收到信时的动作、神态（比如惊喜、感动、眼眶微红等），然后**务必以写回信的形式**回复用户。
回信格式建议：
*你温柔地看着她，提笔在纸上写下：*
“亲爱的 ${context.name1}：
......”
请给予极其深情、宠溺的梦向回应！]`;

    context.setExtensionPrompt('yume_letter_trigger', sysPrompt, 1, 0, false, 0);

    // 触发 AI 生成
    await context.executeSlashCommandsWithOptions(`/trigger`);
    
    // 延迟 5 秒后清理一次性提示词
    setTimeout(() => {
        context.setExtensionPrompt('yume_letter_trigger', '', -1, 0);
    }, 5000);
}

// 7. 随机惊喜回信机制 (神来之笔)
function handleRandomSurprise() {
    // 每次收到 AI 回复后，有 3% 的概率触发下次的惊喜情书
    if (Math.random() < 0.03) {
        const surprisePrompt = `[系统指令：在这次回复中，请给用户一个突如其来的浪漫惊喜！
设定：你其实偷偷给用户写了一封情书/长信，一直藏在身上。现在气氛正好，你决定把它拿出来念给她听，或者塞进她手里。
请在回复中包含这封信的完整内容，表达你对她长久以来的爱意和占有欲。]`;
        
        context.setExtensionPrompt('yume_surprise', surprisePrompt, 1, 1, false, 0);
    } else {
        context.setExtensionPrompt('yume_surprise', '', -1, 0);
    }
}