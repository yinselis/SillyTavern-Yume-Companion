const MODULE_NAME = 'yume-companion';

const defaultSettings = {
    showFloat: true,
    surpriseEnabled: true,
    birthday: '', mbti: '', height: '', weight: '', vibe: '',
    periodLast: '', periodCycle: 28, periodDuration: 5,
    letters:[] // 保存所有信件记录 [{type: 'user'|'ai', date: '...', text: '...'}]
};

let settings = {};
let currentPeriodStatusText = '未知'; // 缓存生理期状态

jQuery(async () => {
    const context = SillyTavern.getContext();
    context.eventSource.on(context.eventTypes.APP_READY, async () => {
        loadSettings();
        await initSidebarUI();
        await initModalUI();
        calculatePeriod(); // 计算生理期
        updateProfileInjection(); 
    });
    context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, handleRandomSurprise);
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, updateProfileInjection);
});

function loadSettings() {
    const context = SillyTavern.getContext();
    if (!context.extensionSettings[MODULE_NAME]) context.extensionSettings[MODULE_NAME] = {};
    settings = context.extensionSettings[MODULE_NAME];
    for (const key in defaultSettings) {
        if (settings[key] === undefined) settings[key] = defaultSettings[key];
    }
}

// 1. 初始化左侧积木菜单的基础设置
async function initSidebarUI() {
    const context = SillyTavern.getContext();
    const currentPath = import.meta.url.substring(0, import.meta.url.lastIndexOf('/'));
    const htmlPath = `${currentPath}/settings.html`;
    
    const settingsHtml = await $.get(htmlPath);
    $('#extensions_settings').append(settingsHtml);

    $('#ym_setting_float').prop('checked', settings.showFloat).on('change', (e) => {
        settings.showFloat = $(e.target).prop('checked');
        $('#yume-floating-btn').css('display', settings.showFloat ? 'flex' : 'none');
        context.saveSettingsDebounced();
    });

    $('#ym_setting_surprise').prop('checked', settings.surpriseEnabled).on('change', (e) => {
        settings.surpriseEnabled = $(e.target).prop('checked');
        context.saveSettingsDebounced();
    });
}

// 2. 初始化核心悬浮面板
async function initModalUI() {
    const context = SillyTavern.getContext();
    const currentPath = import.meta.url.substring(0, import.meta.url.lastIndexOf('/'));
    const modalHtml = await $.get(`${currentPath}/modal.html`);
    
    // 把弹窗和悬浮球挂载到酒馆的最外层 body
    $('body').append(modalHtml);
    
    if(!settings.showFloat) $('#yume-floating-btn').hide();

    // 绑定悬浮球开关事件
    $('#yume-floating-btn').on('click', () => $('#yume-main-modal').fadeIn(200));
    $('#yume-close-btn').on('click', () => $('#yume-main-modal').fadeOut(200));

    // 绑定 Tabs 切换
    $('.yume-tab').on('click', function() {
        $('.yume-tab').removeClass('active');
        $(this).addClass('active');
        $('.yume-tab-pane').removeClass('active');
        $(`#${$(this).data('target')}`).addClass('active');
    });

    // 绑定数据：档案
    const inputs = ['birth', 'mbti', 'h', 'w', 'vibe'];
    inputs.forEach(id => {
        $(`#ym_${id}`).val(settings[id == 'birth' ? 'birthday' : id == 'h' ? 'height' : id == 'w' ? 'weight' : id]);
        $(`#ym_${id}`).on('input', (e) => {
            const key = id == 'birth' ? 'birthday' : id == 'h' ? 'height' : id == 'w' ? 'weight' : id;
            settings[key] = $(e.target).val();
            context.saveSettingsDebounced();
            updateProfileInjection();
        });
    });

    // 绑定数据：生理期
    $('#ym_p_last').val(settings.periodLast).on('change', periodChange);
    $('#ym_p_cycle').val(settings.periodCycle).on('input', periodChange);
    $('#ym_p_duration').val(settings.periodDuration).on('input', periodChange);

    function periodChange() {
        settings.periodLast = $('#ym_p_last').val();
        settings.periodCycle = parseInt($('#ym_p_cycle').val()) || 28;
        settings.periodDuration = parseInt($('#ym_p_duration').val()) || 5;
        context.saveSettingsDebounced();
        calculatePeriod();
        updateProfileInjection();
    }

    // 绑定数据：信笺
    renderLetters();
    $('#ym_send_letter_btn').on('click', handleSendLetter);
}

// 3. 计算生理期逻辑
function calculatePeriod() {
    if (!settings.periodLast) {
        currentPeriodStatusText = '尚未设置生理期';
        $('#yume-period-status').text(currentPeriodStatusText).css('color', 'gray');
        return;
    }

    const lastDate = new Date(settings.periodLast);
    const today = new Date();
    // 清除时分秒影响
    lastDate.setHours(0,0,0,0);
    today.setHours(0,0,0,0);

    const diffTime = today - lastDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        currentPeriodStatusText = '日期设置错误(未来时间)';
        $('#yume-period-status').text(currentPeriodStatusText);
        return;
    }

    const currentDayOfCycle = diffDays % settings.periodCycle;
    
    if (currentDayOfCycle < settings.periodDuration) {
        currentPeriodStatusText = `处于生理期第 ${currentDayOfCycle + 1} 天 (需要呵护)`;
        $('#yume-period-status').text('🩸 ' + currentPeriodStatusText).css('color', '#ff5a5f');
    } else {
        const daysUntilNext = settings.periodCycle - currentDayOfCycle;
        currentPeriodStatusText = `距离下次生理期约还有 ${daysUntilNext} 天`;
        $('#yume-period-status').text('☁️ ' + currentPeriodStatusText).css('color', '#ff9a9e');
    }
}

// 4. 更新注入档案
function updateProfileInjection() {
    const context = SillyTavern.getContext();
    if (!settings.birthday && !settings.height && !settings.periodLast && !settings.vibe) return;

    const userName = context.name1 || '用户';
    const prompt = `[系统设定 - 伴侣绝密档案：
用户(${userName})的当前状态：
- 生日：${settings.birthday || '未知'}
- 体型：${settings.height ? settings.height + 'cm' : '?'} ${settings.weight ? settings.weight + 'kg' : '?'}
- 生理期状况：${currentPeriodStatusText}
- 性格特点：${settings.mbti || '未知'}
- 今日心情：${settings.vibe || '平静'}
指令：请在对话中自然体现对上述信息的了解。如果处于生理期或心情差，主动提供情绪价值。]`;

    context.setExtensionPrompt('yume_profile', prompt, 4, 4, false, 0);
}

// 5. 渲染信件历史
function renderLetters() {
    const container = $('#yume-letters-history');
    container.empty();
    
    if (settings.letters.length === 0) {
        container.append('<div style="text-align:center; opacity:0.5; margin-top:50px;">还没有信件往来哦...</div>');
        return;
    }

    settings.letters.forEach(letter => {
        const isUser = letter.type === 'user';
        const boxClass = isUser ? 'yume-letter-user' : 'yume-letter-ai';
        const name = isUser ? '你' : (SillyTavern.getContext().name2 || 'TA');
        
        const html = `
            <div class="yume-letter-box ${boxClass}">
                <div class="yume-letter-time">${name} - ${letter.date}</div>
                <div>${letter.text}</div>
            </div>
        `;
        container.append(html);
    });
    
    // 自动滚动到底部
    container.scrollTop(container[0].scrollHeight);
}

// 6. 独立后台寄信系统 (核心黑科技)
async function handleSendLetter() {
    const content = $('#ym_letter_input').val().trim();
    if (!content) return toastr.warning('信纸不能是空的哦！');

    const context = SillyTavern.getContext();
    const btn = $('#ym_send_letter_btn');
    
    // 记录用户的信
    settings.letters.push({
        type: 'user',
        date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString(),
        text: content
    });
    $('#ym_letter_input').val('');
    renderLetters();
    context.saveSettingsDebounced();

    // 禁用按钮，提示等待
    btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> TA正在写回信...');

    try {
        const userName = context.name1 || '用户';
        const charName = context.name2 || '伴侣';
        
        // 构造后台生成的提示词，它会携带当前聊天的上下文
        const quietPrompt = `[系统后台任务：
用户 ${userName} 刚刚在手账本里给你（${charName}）写了一封绝密情书/留言。
信件内容如下：
"${content}"

请仔细阅读，然后**写一封回信**。
要求：
1. 必须是完整的信笺格式（抬头、正文、落款）。
2. 感情要极度深情、宠溺、符合你平时的人设。
3. 请只输出信件正文，不要输出任何括号、动作描写。]`;

        // 调用酒馆的后台生成 API，不会显示在当前聊天框
        const aiReply = await context.generateQuietPrompt({
            quietPrompt: quietPrompt
        });

        // 记录 AI 的回信
        settings.letters.push({
            type: 'ai',
            date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString(),
            text: aiReply
        });
        
        context.saveSettingsDebounced();
        renderLetters();
        toastr.success('收到TA的回信啦！', '🌸 新信件');

    } catch (e) {
        toastr.error('送信失败，检查网络或API。', '错误');
        console.error(e);
    } finally {
        btn.prop('disabled', false).html('<i class="fa-solid fa-paper-plane"></i> 悄悄寄出');
    }
}

// 7. 随机掉落系统 (主聊天框内)
function handleRandomSurprise() {
    if (!settings.surpriseEnabled) return;
    const context = SillyTavern.getContext();

    if (Math.random() < 0.03) {
        const surprisePrompt = `[系统指令：在这次回复中，请给用户一个突如其来的浪漫惊喜！
设定：你其实偷偷写了一封情书，一直藏在身上。现在气氛正好，你把它拿出来念给她听，或者塞进她手里。
请在回复中包含这封信的完整内容，表达你对她长久以来的爱意和占有欲。]`;
        context.setExtensionPrompt('yume_surprise', surprisePrompt, 4, 1, false, 0);
    } else {
        context.setExtensionPrompt('yume_surprise', '', 4, 1);
    }
}