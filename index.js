const MODULE_NAME = 'yume-companion';

const defaultSettings = {
    showFloat: true, floatIcon: '', fabX: '', fabY: '',
    anniversary: '', surpriseEnabled: true,
    birthday: '', mbti: '', height: '', weight: '', vibe: '',
    periodLast: '', periodCycle: 28, periodDuration: 5,
    letters:[]
};

let settings = {};
let currentPeriodStatusText = '未知'; 

jQuery(async () => {
    const context = SillyTavern.getContext();
    context.eventSource.on(context.eventTypes.APP_READY, async () => {
        loadSettings();
        await initSidebarUI();
        await initModalUI();
        calculateAnniversary();
        calculatePeriod(); 
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

// 1. 初始化侧边栏
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

    $('#ym_float_icon').val(settings.floatIcon).on('input', (e) => {
        settings.floatIcon = $(e.target).val();
        updateFloatingIcon();
        context.saveSettingsDebounced();
    });

    $('#ym_anniversary').val(settings.anniversary).on('change', (e) => {
        settings.anniversary = $(e.target).val();
        context.saveSettingsDebounced();
        calculateAnniversary();
        updateProfileInjection();
    });
}

function updateFloatingIcon() {
    const fab = $('#yume-floating-btn');
    const text = $('#yume-float-text');
    if (settings.floatIcon && settings.floatIcon.trim() !== '') {
        fab.css('background-image', `url(${settings.floatIcon})`);
        text.hide();
    } else {
        fab.css('background-image', 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)');
        text.show();
    }
}

function calculateAnniversary() {
    if (!settings.anniversary) {
        $('#yume-anniversary-text').text('未设置纪念日');
        return;
    }
    const start = new Date(settings.anniversary);
    const today = new Date();
    start.setHours(0,0,0,0); today.setHours(0,0,0,0);
    const diffDays = Math.floor((today - start) / (1000 * 60 * 60 * 24));
    
    if (diffDays >= 0) {
        $('#yume-anniversary-text').text(`💕 已相伴 ${diffDays} 天`);
    } else {
        $('#yume-anniversary-text').text(`💕 距离相伴还有 ${Math.abs(diffDays)} 天`);
    }
}

// 2. 初始化核心悬浮面板 & 拖拽逻辑
async function initModalUI() {
    const context = SillyTavern.getContext();
    const currentPath = import.meta.url.substring(0, import.meta.url.lastIndexOf('/'));
    const modalHtml = await $.get(`${currentPath}/modal.html`);
    
    $('body').append(modalHtml);
    
    const fab = $('#yume-floating-btn');
    if(!settings.showFloat) fab.hide();
    updateFloatingIcon();

    if (settings.fabX && settings.fabY) {
        fab.css({ left: settings.fabX, top: settings.fabY, right: 'auto', bottom: 'auto' });
    }

    // --- ✨核心修复：悬浮球拖拽逻辑 (防止误触) ---
    let isDragging = false;
    let startX, startY, initialX, initialY;

    fab.on('mousedown touchstart', function(e) {
        isDragging = false;
        const evt = e.type.includes('touch') ? e.originalEvent.touches[0] : e;
        startX = evt.clientX;
        startY = evt.clientY;
        initialX = fab.offset().left - $(window).scrollLeft();
        initialY = fab.offset().top - $(window).scrollTop();
        
        $(document).on('mousemove touchmove', onDrag);
        $(document).on('mouseup touchend', onStop);
    });

    function onDrag(e) {
        const evt = e.type.includes('touch') ? e.originalEvent.touches[0] : e;
        const dx = evt.clientX - startX;
        const dy = evt.clientY - startY;
        
        // 只有手指移动超过 10 像素才算拖拽，防止普通点击被吞！
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
            isDragging = true;
        }
        
        if (isDragging) {
            e.preventDefault(); // 防止拖拽时屏幕跟着滚动
            let newX = initialX + dx;
            let newY = initialY + dy;
            newX = Math.max(0, Math.min(newX, $(window).width() - fab.outerWidth()));
            newY = Math.max(0, Math.min(newY, $(window).height() - fab.outerHeight()));
            
            fab.css({ left: newX, top: newY, right: 'auto', bottom: 'auto' });
        }
    }

    function onStop() {
        $(document).off('mousemove touchmove', onDrag);
        $(document).off('mouseup touchend', onStop);
        if (isDragging) {
            settings.fabX = fab.css('left');
            settings.fabY = fab.css('top');
            context.saveSettingsDebounced();
        }
    }

    // ✨核心修复：点击事件切换显示/隐藏
    fab.on('click', function(e) {
        if (isDragging) {
            e.preventDefault(); // 如果是拖拽结束，不要触发点击
            return;
        }
        $('#yume-main-modal').fadeToggle(200); // fadeToggle：开着就关，关着就开
    });

    $('#yume-close-btn').on('click', () => $('#yume-main-modal').fadeOut(200));

    // Tabs 切换
    $('.yume-tab').on('click', function() {
        $('.yume-tab').removeClass('active');
        $(this).addClass('active');
        $('.yume-tab-pane').removeClass('active');
        $(`#${$(this).data('target')}`).addClass('active');
    });

    // 绑定数据
    const inputs =['birth', 'mbti', 'h', 'w', 'vibe'];
    inputs.forEach(id => {
        $(`#ym_${id}`).val(settings[id == 'birth' ? 'birthday' : id == 'h' ? 'height' : id == 'w' ? 'weight' : id]);
        $(`#ym_${id}`).on('input', (e) => {
            const key = id == 'birth' ? 'birthday' : id == 'h' ? 'height' : id == 'w' ? 'weight' : id;
            settings[key] = $(e.target).val();
            context.saveSettingsDebounced();
            updateProfileInjection();
        });
    });

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

    renderLetters();
    $('#ym_send_letter_btn').on('click', handleSendLetter);
    window.yumeInteract = handleInteraction;
}

function calculatePeriod() {
    if (!settings.periodLast) {
        currentPeriodStatusText = '未知';
        $('#yume-period-status').text('尚未设置生理期').css('color', 'gray');
        return;
    }
    const lastDate = new Date(settings.periodLast);
    const today = new Date();
    lastDate.setHours(0,0,0,0); today.setHours(0,0,0,0);
    const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        currentPeriodStatusText = '未知';
        $('#yume-period-status').text('日期设置错误'); return;
    }

    const currentDayOfCycle = diffDays % settings.periodCycle;
    if (currentDayOfCycle < settings.periodDuration) {
        currentPeriodStatusText = `正处于生理期第 ${currentDayOfCycle + 1} 天`;
        $('#yume-period-status').text('🩸 ' + currentPeriodStatusText).css('color', '#ff5a5f');
    } else {
        const daysUntilNext = settings.periodCycle - currentDayOfCycle;
        currentPeriodStatusText = `距离下次生理期约还有 ${daysUntilNext} 天`;
        $('#yume-period-status').text('☁️ ' + currentPeriodStatusText).css('color', '#ff9a9e');
    }
}

function updateProfileInjection() {
    const context = SillyTavern.getContext();
    if (!settings.birthday && !settings.periodLast && !settings.vibe) return;

    const userName = context.name1 || '用户';
    const annivText = settings.anniversary ? `今天是你们在一起的第 ${Math.floor((new Date() - new Date(settings.anniversary))/(1000*60*60*24))} 天。` : '';

    const prompt = `[系统设定 - 伴侣绝密档案：
用户(${userName})的当前状态：
- 生日：${settings.birthday || '未知'}
- 生理期状况：${currentPeriodStatusText}
- 性格特点：${settings.mbti || '未知'}
- 今日心情：${settings.vibe || '平静'}
${annivText}
指令：请在对话中自然体现对上述信息的了解。如果处于生理期或心情差，主动提供情绪价值、宠溺和照顾。]`;

    context.setExtensionPrompt('yume_profile', prompt, 4, 4, false, 0);
}

async function handleInteraction(type) {
    const context = SillyTavern.getContext();
    const userName = context.name1 || '用户';
    const charName = context.name2 || '伴侣';
    
    let actionDesc = "";
    if (type === 'poke') actionDesc = `用手指轻轻戳了戳 ${charName} 的脸颊，看着TA。`;
    if (type === 'hug') actionDesc = `突然张开双臂，软软地扑进 ${charName} 的怀里求抱抱，像是在撒娇。`;
    if (type === 'sleep') actionDesc = `拉了拉 ${charName} 的衣角，揉着眼睛小声说自己睡不着，想要TA哄睡。`;
    if (type === 'vent') actionDesc = `眼眶微红，靠在 ${charName} 肩膀上，说自己今天遇到了烦心事，心情很差。`;

    toastr.info('正在等待TA的回应...', '🌸 互动中', {timeOut: 0, extendedTimeOut: 0, tapToDismiss: false});

    try {
        const quietPrompt = `[系统后台任务：
用户 ${userName} 刚刚对你（${charName}）做了一个动作：
*${actionDesc}*

请根据上下文和你的人设，给出一个简短但极其宠溺、温柔的【反应描写+一两句情话/安慰】。
只需输出你的回应，不需要输出选项，控制在100字左右。]`;

        const aiReply = await context.generateQuietPrompt({ quietPrompt: quietPrompt });
        toastr.clear();
        context.Popup.show.text(`🌸 TA的反应：`, aiReply);
        
    } catch (e) {
        toastr.clear();
        toastr.error('互动失败，请检查网络或API。');
    }
}

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
        container.append(`
            <div class="yume-letter-box ${boxClass}">
                <div class="yume-letter-time">${name} - ${letter.date}</div>
                <div>${letter.text}</div>
            </div>
        `);
    });
    container.scrollTop(container[0].scrollHeight);
}

async function handleSendLetter() {
    const content = $('#ym_letter_input').val().trim();
    if (!content) return toastr.warning('信纸不能是空的哦！');

    const context = SillyTavern.getContext();
    const btn = $('#ym_send_letter_btn');
    
    settings.letters.push({ type: 'user', date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), text: content });
    $('#ym_letter_input').val('');
    renderLetters();
    context.saveSettingsDebounced();

    btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> TA正在写回信...');

    try {
        const userName = context.name1 || '用户';
        const charName = context.name2 || '伴侣';
        
        const quietPrompt = `[系统后台任务：
用户 ${userName} 刚刚在手账本里给你（${charName}）写了一封绝密情书/留言。
信件内容如下：
"${content}"

请仔细阅读，然后**写一封回信**。
要求：必须是完整的信笺格式（抬头、正文、落款），感情要极度深情宠溺。只输出正文。]`;

        const aiReply = await context.generateQuietPrompt({ quietPrompt: quietPrompt });

        settings.letters.push({ type: 'ai', date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), text: aiReply });
        context.saveSettingsDebounced();
        renderLetters();
        toastr.success('收到TA的回信啦！', '🌸 新信件');

    } catch (e) {
        toastr.error('送信失败');
    } finally {
        btn.prop('disabled', false).html('<i class="fa-solid fa-paper-plane"></i> 悄悄寄出');
    }
}

function handleRandomSurprise() {
    if (!settings.surpriseEnabled) return;
    const context = SillyTavern.getContext();
    if (Math.random() < 0.03) {
        const surprisePrompt = `[系统指令：在这次回复中，请给用户一个突如其来的浪漫惊喜！
设定：你其实偷偷写了一封情书。请在回复中包含这封信的完整内容。]`;
        context.setExtensionPrompt('yume_surprise', surprisePrompt, 4, 1, false, 0);
    } else {
        context.setExtensionPrompt('yume_surprise', '', 4, 1);
    }
}