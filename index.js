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
    const context = SillyTavern.getContext();
    
    // APP_READY 会在酒馆加载完毕时自动触发
    context.eventSource.on(context.eventTypes.APP_READY, async () => {
        loadSettings();
        await initUI();
        updateProfileInjection(); 
    });

    // 监听 AI 回复，触发惊喜
    context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, handleRandomSurprise);
    
    // 切换聊天卡片时，重新注入一次提示词，以更新 name1(用户名) 和 name2(角色名)
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, updateProfileInjection);
});

// 2. 加载设置
function loadSettings() {
    const context = SillyTavern.getContext();
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

// 3. 挂载 UI 面板（到你的截图所在的积木拓展列表里）
async function initUI() {
    const context = SillyTavern.getContext();
    try {
        // 【关键黑科技】动态获取当前脚本所在的绝对路径，无论 GitHub 仓库叫什么名字都不会报错！
        const currentPath = import.meta.url.substring(0, import.meta.url.lastIndexOf('/'));
        const htmlPath = `${currentPath}/settings.html`;
        
        const settingsHtml = await $.get(htmlPath);
        
        // $('#extensions_settings') 就是你截图里的那个“积木”拓展菜单的容器
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
        const inputs =['#ym_birth', '#ym_mbti', '#ym_h', '#ym_w', '#ym_period', '#ym_vibe'];
        inputs.forEach(id => {
            $(id).on('input', (e) => {
                const key = id.replace('#ym_', '');
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
    const context = SillyTavern.getContext();
    if (!settings.birthday && !settings.height && !settings.period && !settings.vibe) return;

    const userName = context.name1 || '用户';

    const prompt = `[系统设定 - 伴侣绝密档案：
用户(${userName})的当前状态：
- 生日：${settings.birthday || '未知'}
- 体型：${settings.height ? settings.height + 'cm' : '?'} ${settings.weight ? settings.weight + 'kg' : '?'}
- 生理期状态：${settings.period || '未知'}
- 性格特点：${settings.mbti || '未知'}
- 今日心情：${settings.vibe || '平静'}
指令：请在日常对话中，极度自然地体现出你对上述信息的了解。如果她处于生理期或心情不好，请主动提供情绪价值、安抚和照顾。]`;

    // 注入聊天流
    context.setExtensionPrompt('yume_profile', prompt, 4, 4, false, 0);
}

// 5. 发送情书逻辑
async function sendLoveLetter(content) {
    const context = SillyTavern.getContext();
    const userName = context.name1 || '用户';
    const charName = context.name2 || '你的伴侣';

    const userMessage = `*你深吸了一口气，脸颊微红，将一封折叠得整整齐齐的信笺递给了${charName}。*\n\n【信件内容】：\n"${content}"`;
    await context.executeSlashCommandsWithOptions(`/send ${userMessage}`);

    const sysPrompt = `[系统指令：用户刚刚红着脸递给你一封情书/信笺。
请你仔细阅读信件内容，体会其中的感情。
在接下来的回复中，请先描写你收到信时的动作、神态（比如惊喜、感动、眼眶微红等），然后**务必以写回信的形式**回复用户。
回信格式建议：
*你温柔地看着她，提笔在纸上写下：*
“亲爱的 ${userName}：
......”
请给予极其深情、宠溺的梦向回应！]`;

    context.setExtensionPrompt('yume_letter_trigger', sysPrompt, 4, 1, false, 0);
    await context.executeSlashCommandsWithOptions(`/trigger`);
    
    setTimeout(() => {
        context.setExtensionPrompt('yume_letter_trigger', '', 4, 1);
    }, 5000);
}

// 6. 随机惊喜回信机制
function handleRandomSurprise() {
    if (!settings.surpriseEnabled) return;
    const context = SillyTavern.getContext();

    if (Math.random() < 0.03) {
        const surprisePrompt = `[系统指令：在这次回复中，请给用户一个突如其来的浪漫惊喜！
设定：你其实偷偷给用户写了一封情书/长信，一直藏在身上。现在气氛正好，你决定把它拿出来念给她听，或者塞进她手里。
请在回复中包含这封信的完整内容，表达你对她长久以来的爱意和占有欲。]`;
        context.setExtensionPrompt('yume_surprise', surprisePrompt, 4, 1, false, 0);
    } else {
        context.setExtensionPrompt('yume_surprise', '', 4, 1);
    }
}