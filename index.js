import { getContext } from '../../../extensions.js';

const context = getContext();
const MODULE_NAME = 'yume-companion';

// 默认设置
const defaultSettings = {
    birthday: '',
    mbti: '',
    height: '',
    weight: '',
    period: '',
    vibe: '',
    surpriseEnabled: true
};

let settings = {};

// 1. 初始化插件
jQuery(async () => {
    // 必须等酒馆加载完毕再挂载 UI
    context.eventSource.on(context.eventTypes.APP_READY, async () => {
        loadSettings();
        await initUI();
        updateProfileInjection(); // 启动时注入一次档案
    });

    // 监听 AI 回复，触发惊喜
    context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, handleRandomSurprise);
});

// 2. 加载设置
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

// 3. 挂载 UI 面板
async function initUI() {
    try {
        // 读取 settings.html 文件
        const htmlPath = `/scripts/extensions/third-party/${MODULE_NAME}/settings.html`;
        const settingsHtml = await $.get(htmlPath);
        
        // 挂载到酒馆的扩展设置面板中
        $('#extensions_settings').append(settingsHtml);

        // 绑定数据到输入框
        $('#ym_birth').val(settings.birthday);
        $('#ym_mbti').val(settings.mbti);
        $('#ym_h').val(settings.height);
        $('#ym_w').val(settings.weight);
        $('#ym_period').val(settings.period);
        $('#ym_vibe').val(settings.vibe);
        $('#ym_surprise_enable').prop('checked', settings.surpriseEnabled);

        // 监听输入，实时保存并更新 AI 记忆
        const inputs = ['#ym_birth', '#ym_mbti', '#ym_h', '#ym_w', '#ym_period', '#ym_vibe'];
        inputs.forEach(id => {
            $(id).on('input', (e) => {
                const key = id.replace('#ym_', '');
                // 映射一下键名
                const keyMap = { 'birth': 'birthday', 'mbti': 'mbti', 'h': 'height', 'w': 'weight', 'period': 'period', 'vibe': 'vibe' };
                settings[keyMap[key]] = $(e.target).val();
                context.saveSettingsDebounced();
                updateProfileInjection(); // 实时更新提示词
            });
        });

        $('#ym_surprise_enable').on('change', (e) => {
            settings.surpriseEnabled = $(e.target).prop('checked');
            context.saveSettingsDebounced();
        });

        // 绑定发送情书按钮
        $('#ym_send_letter_btn').on('click', () => {
            const letter = $('#ym_letter_content').val().trim();
            if (letter) {
                sendLoveLetter(letter);
                $('#ym_letter_content').val(''); // 发送后清空输入框
            } else {
                toastr.warning('信纸是空的哦~', '🌸 提示');
            }
        });

        console.log('[Yume Companion] 扩展面板挂载成功！');
    } catch (error) {
        console.error('[Yume Companion] 挂载失败:', error);
    }
}

// 4. 后台注入档案 (让 AI 始终记得)
function updateProfileInjection() {
    // 如果什么都没填，就不注入
    if (!settings.birthday && !settings.height && !settings.period && !settings.vibe) return;

    const prompt = `[系统设定 - 伴侣绝密档案：
用户(${context.name1})的当前状态：
- 生日：${settings.birthday || '未知'}
- 体型：${settings.height ? settings.height + 'cm' : '?'} ${settings.weight ? settings.weight + 'kg' : '?'}
- 生理期状态：${settings.period || '未知'}
- 性格特点：${settings.mbti || '未知'}
- 今日心情：${settings.vibe || '平静'}
指令：请在日常对话中，极度自然地体现出你对上述信息的了解。如果她处于生理期或心情不好，请主动提供情绪价值、安抚和照顾。]`;

    // 注入到深度 4，作为背景记忆
    context.setExtensionPrompt('yume_profile', prompt, 1, 4, false, 0);
}

// 5. 发送情书逻辑
async function sendLoveLetter(content) {
    // 伪造一条用户发送的动作
    const userMessage = `*你深吸了一口气，脸颊微红，将一封折叠得整整齐齐的信笺递给了${context.name2}。*\n\n【信件内容】：\n"${content}"`;
    
    // 调用酒馆命令发送消息
    await context.executeSlashCommandsWithOptions(`/send ${userMessage}`);

    // 注入一次性强力提示词，逼迫 AI 写回信
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

    // 触发 AI 回复
    await context.executeSlashCommandsWithOptions(`/trigger`);
    
    // 延迟 5 秒后清理这个一次性提示词，防止影响后续聊天
    setTimeout(() => {
        context.setExtensionPrompt('yume_letter_trigger', '', -1, 0);
    }, 5000);
}

// 6. 随机惊喜回信机制
function handleRandomSurprise() {
    if (!settings.surpriseEnabled) return;

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