const MODULE_NAME = 'yume-companion';

const defaultSettings = {
    showFloat: true, floatIcon: '', fabX: '', fabY: '', anniversary: '',
    apiUrl: '', apiKey: '', apiModel: '',
    birthday: '', mbti: '', vibe: '', periodLast: '', periodCycle: 28, periodDuration: 5,
    letters: [], diary:[]
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

async function initSidebarUI() {
    const context = SillyTavern.getContext();
    const currentPath = import.meta.url.substring(0, import.meta.url.lastIndexOf('/'));
    $('#extensions_settings').append(await $.get(`${currentPath}/settings.html`));

    const bindSetting = (id, key, isCheck = false, callback = null) => {
        if(isCheck) $(`#${id}`).prop('checked', settings[key]);
        else $(`#${id}`).val(settings[key]);
        $(`#${id}`).on(isCheck ? 'change' : 'input', (e) => {
            settings[key] = isCheck ? $(e.target).prop('checked') : $(e.target).val();
            context.saveSettingsDebounced();
            if(callback) callback();
        });
    };

    bindSetting('ym_setting_float', 'showFloat', true, () => $('#yume-floating-btn').css('display', settings.showFloat ? 'flex' : 'none'));
    bindSetting('ym_float_icon', 'floatIcon', false, updateFloatingIcon);
    bindSetting('ym_anniversary', 'anniversary', false, () => { calculateAnniversary(); updateProfileInjection(); });
    
    bindSetting('ym_api_url', 'apiUrl');
    bindSetting('ym_api_key', 'apiKey');
    bindSetting('ym_api_model', 'apiModel');

    // API 测试保存按钮
    $('#ym_btn_save_api').on('click', async function() {
        const btn = $(this);
        btn.html('<i class="fa-solid fa-spinner fa-spin"></i> 测试中...');
        if (!settings.apiUrl || !settings.apiKey) {
            toastr.info('已保存！当前未配置独立API，将默认使用酒馆的纯净直连通道。');
            btn.html('<i class="fa-solid fa-floppy-disk"></i> 保存并测试连接');
            return;
        }
        try {
            let url = settings.apiUrl.endsWith('/') ? settings.apiUrl : settings.apiUrl + '/';
            const res = await fetch(url + 'chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
                body: JSON.stringify({ model: settings.apiModel || 'gpt-3.5-turbo', messages:[{role: "user", content: "hi"}], max_tokens: 5 })
            });
            if (res.ok) toastr.success('连接成功！独立后台 API 已激活。');
            else toastr.error('连接失败，请检查 URL 和 Key 是否正确。');
        } catch (e) {
            toastr.error('请求出错，请检查网络或跨域设置。');
        }
        btn.html('<i class="fa-solid fa-floppy-disk"></i> 保存并测试连接');
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
    if (!settings.anniversary) { $('#yume-anniversary-text').text(''); return; }
    const diff = Math.floor((new Date().setHours(0,0,0,0) - new Date(settings.anniversary).setHours(0,0,0,0)) / 86400000);
    $('#yume-anniversary-text').text(diff >= 0 ? `💕 已相伴 ${diff} 天` : `💕 距离相伴还有 ${Math.abs(diff)} 天`);
}

async function initModalUI() {
    const context = SillyTavern.getContext();
    const currentPath = import.meta.url.substring(0, import.meta.url.lastIndexOf('/'));
    $('body').append(await $.get(`${currentPath}/modal.html`));
    
    const fab = $('#yume-floating-btn');
    if(!settings.showFloat) fab.hide();
    updateFloatingIcon();

    if (settings.fabX && settings.fabY) fab.css({ left: settings.fabX, top: settings.fabY, right: 'auto', bottom: 'auto' });

    let isDragging = false, startX, startY, initialX, initialY;
    fab.on('mousedown touchstart', function(e) {
        isDragging = false;
        const evt = e.type.includes('touch') ? e.originalEvent.touches[0] : e;
        startX = evt.clientX; startY = evt.clientY;
        initialX = fab.offset().left - $(window).scrollLeft(); initialY = fab.offset().top - $(window).scrollTop();
        $(document).on('mousemove touchmove', onDrag).on('mouseup touchend', onStop);
    });
    function onDrag(e) {
        const evt = e.type.includes('touch') ? e.originalEvent.touches[0] : e;
        if (Math.abs(evt.clientX - startX) > 10 || Math.abs(evt.clientY - startY) > 10) isDragging = true;
        if (isDragging) {
            e.preventDefault();
            let newX = Math.max(0, Math.min(initialX + evt.clientX - startX, $(window).width() - fab.outerWidth()));
            let newY = Math.max(0, Math.min(initialY + evt.clientY - startY, $(window).height() - fab.outerHeight()));
            fab.css({ left: newX, top: newY, right: 'auto', bottom: 'auto' });
        }
    }
    function onStop() {
        $(document).off('mousemove touchmove', onDrag).off('mouseup touchend', onStop);
        if (isDragging) { settings.fabX = fab.css('left'); settings.fabY = fab.css('top'); context.saveSettingsDebounced(); }
    }

    fab.on('click', (e) => { if(!isDragging) $('#yume-main-modal').fadeToggle(200); });
    $('#yume-close-btn').on('click', () => $('#yume-main-modal').fadeOut(200));

    $('.yume-tab').on('click', function() {
        $('.yume-tab').removeClass('active'); $(this).addClass('active');
        $('.yume-tab-pane').removeClass('active'); $(`#${$(this).data('target')}`).addClass('active');
    });

    const profileInputs = ['birth', 'mbti', 'vibe'];
    profileInputs.forEach(id => {
        $(`#ym_${id}`).val(settings[id == 'birth' ? 'birthday' : id]).on('input', (e) => {
            settings[id == 'birth' ? 'birthday' : id] = $(e.target).val();
            context.saveSettingsDebounced(); updateProfileInjection();
        });
    });

    const pChange = () => {
        settings.periodLast = $('#ym_p_last').val();
        settings.periodCycle = parseInt($('#ym_p_cycle').val()) || 28;
        settings.periodDuration = parseInt($('#ym_p_duration').val()) || 5;
        context.saveSettingsDebounced(); calculatePeriod(); updateProfileInjection();
    };
    $('#ym_p_last').val(settings.periodLast).on('change', pChange);
    $('#ym_p_cycle').val(settings.periodCycle).on('input', pChange);
    $('#ym_p_duration').val(settings.periodDuration).on('input', pChange);

    renderLetters();
    renderDiary();
    $('#ym_send_letter_btn').on('click', handleSendLetter);
    
    $('#ym_btn_write_diary').on('click', () => $('#yume-diary-writer').slideToggle());
    $('#ym_save_diary_btn').on('click', handleSaveDiary);
    $('#ym_btn_ai_diary').on('click', handleAIDiary);

    window.yumeInteract = handleInteraction;
}

function calculatePeriod() {
    if (!settings.periodLast) { $('#yume-period-status').text('尚未设置生理期').css('color', 'gray'); return; }
    const diff = Math.floor((new Date().setHours(0,0,0,0) - new Date(settings.periodLast).setHours(0,0,0,0)) / 86400000);
    if (diff < 0) { $('#yume-period-status').text('日期错误'); return; }
    const cur = diff % settings.periodCycle;
    if (cur < settings.periodDuration) {
        currentPeriodStatusText = `生理期第 ${cur + 1} 天`;
        $('#yume-period-status').text('🩸 ' + currentPeriodStatusText).css('color', '#ff5a5f');
    } else {
        currentPeriodStatusText = `距下次还有 ${settings.periodCycle - cur} 天`;
        $('#yume-period-status').text('☁️ ' + currentPeriodStatusText).css('color', '#ff9a9e');
    }
}

// 🛡️ 终极魔法：完全绕开所有污染的底层 AI 生成！
async function callYumeAI(taskPrompt) {
    const context = SillyTavern.getContext();
    const charName = context.name2 || '伴侣';
    const userName = context.name1 || '用户';
    
    const char = context.characters[context.characterId] || {};
    const sysPrompt = `你现在扮演 ${charName}。这是你的核心设定：\n${char.personality || ''}\n${char.description || ''}\n\n当前状态：你正在一个私下的陪伴空间中给用户(${userName})反馈。请完全遵循人设，语气极度自然、宠溺。绝不能暴露AI身份，绝不能包含系统通知！`;

    // 1. 如果有独立 API
    if (settings.apiUrl && settings.apiKey) {
        try {
            let url = settings.apiUrl.endsWith('/') ? settings.apiUrl : settings.apiUrl + '/';
            const res = await fetch(url + 'chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
                body: JSON.stringify({
                    model: settings.apiModel || 'gpt-3.5-turbo',
                    messages:[ {role: "system", content: sysPrompt}, {role: "user", content: taskPrompt} ],
                    temperature: 0.8
                })
            });
            const data = await res.json();
            return data.choices[0].message.content.trim();
        } catch(e) {
            console.error(e);
            return "（独立API请求失败，请检查设置或网络连接）";
        }
    } else {
        // 2. 否则使用酒馆底层 generateRaw，彻底绕开当前对话预设/世界书
        try {
            const rawReply = await context.generateRaw({
                systemPrompt: sysPrompt,
                prompt: taskPrompt,
                bypassChat: true // 不带任何历史记录和污染格式
            });
            return rawReply.trim();
        } catch (e) {
            console.error(e);
            return "（生成失败，请确保主聊天API已连接）";
        }
    }
}

async function handleInteraction(type) {
    const charName = SillyTavern.getContext().name2 || '伴侣';
    const acts = {
        'poke': `用手指轻轻戳了戳 ${charName} 的脸颊`,
        'hug': `突然扑进 ${charName} 的怀里求抱抱撒娇`,
        'sleep': `拉了拉 ${charName} 的衣角，想要TA哄睡`,
        'vent': `靠在 ${charName} 肩膀上，说自己心情很差`
    };
    
    $('#yume-interact-result').show();
    $('#yume-interact-text').text('');
    $('#yume-interact-loading').show();

    const task = `用户刚刚对你做了一个动作：*${acts[type]}*。请直接描写你的简短反应和一句对话，控制在80字左右。直接输出动作和说话内容即可，千万不要输出前言后语。`;
    const reply = await callYumeAI(task);
    
    $('#yume-interact-loading').hide();
    $('#yume-interact-text').text(`🌸 ${charName}：\n${reply}`);
}

function renderLetters() {
    const $c = $('#yume-letters-history'); $c.empty();
    settings.letters.forEach(l => {
        const isUser = l.type === 'user';
        $c.append(`
            <div class="ym-msg-wrapper ${isUser ? 'is-user' : 'is-ai'}">
                <div class="ym-msg-time">${isUser ? '你' : 'TA'} - ${l.date}</div>
                <div class="ym-bubble">${l.text}</div>
            </div>
        `);
    });
    $c.scrollTop($c[0].scrollHeight);
}

async function handleSendLetter() {
    const text = $('#ym_letter_input').val().trim();
    if (!text) return toastr.warning('信纸是空的！');
    
    settings.letters.push({ type: 'user', date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), text });
    $('#ym_letter_input').val(''); renderLetters();
    $('#ym_send_letter_btn').prop('disabled', true).text('TA正在提笔...');

    const task = `用户给你写了一封信：\n"${text}"\n\n请以你的口吻写一封回信。要求：极度深情宠溺，直接输出信的正文，不需要输出“这是我的回信”等系统废话。`;
    const reply = await callYumeAI(task);
    
    settings.letters.push({ type: 'ai', date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), text: reply });
    SillyTavern.getContext().saveSettingsDebounced(); renderLetters();
    $('#ym_send_letter_btn').prop('disabled', false).text('悄悄寄出');
}

function renderDiary() {
    const $c = $('#yume-diary-history'); $c.empty();
    settings.diary.slice().reverse().forEach(d => {
        let authorStr = d.author === 'user' ? '我的日记' : 'TA的日记';
        let replyHtml = '';
        if (d.aiReply) {
            if (d.aiReply === 'loading') replyHtml = `<div class="ym-diary-ai-thinking"><i class="fa-solid fa-pen-nib fa-bounce"></i> TA正在悄悄写留言...</div>`;
            else replyHtml = `<div class="yume-diary-reply">📝 TA的悄悄话：${d.aiReply}</div>`;
        }
        $c.append(`
            <div class="yume-diary-card">
                <div class="ym-msg-time">📅 ${d.date} | ${authorStr}</div>
                <div>${d.text}</div>
                ${replyHtml}
            </div>
        `);
    });
}

// 🛡️ 修复：真正的全自动后台静默回复
function handleSaveDiary() {
    const text = $('#ym_diary_input').val().trim();
    if (!text) return;
    
    const isPublic = $('#ym_diary_public').prop('checked');
    const wantsReply = $('#ym_diary_reply').prop('checked');
    
    // 直接推入一条记录，UI 立刻反馈，毫不卡顿！
    let entry = { id: Date.now(), author: 'user', date: new Date().toLocaleDateString(), text, isPublic, aiReply: wantsReply ? 'loading' : '' };
    settings.diary.push(entry);
    
    $('#ym_diary_input').val(''); 
    $('#yume-diary-writer').slideUp(); 
    renderDiary();
    SillyTavern.getContext().saveSettingsDebounced();
    updateProfileInjection();

    // 如果渴望回复，则开启后台线程，不阻塞主流程！
    if (wantsReply) {
        const task = `你偶然看到了用户的这篇日记：\n"${text}"\n\n请以你的口吻写一句心疼或宠溺的留言，就像写在日记本空白处一样。直接输出留言内容，绝对不要有系统前缀。`;
        // 不加 await，直接 then 回调
        callYumeAI(task).then(reply => {
            // 找到刚才那条日记，把加载状态替换成真实回复
            const target = settings.diary.find(d => d.id === entry.id);
            if (target) {
                target.aiReply = reply;
                SillyTavern.getContext().saveSettingsDebounced();
                renderDiary();
                toastr.success('TA在你的日记本里留言啦！', '🌸 收到留言');
            }
        });
    }
}

async function handleAIDiary() {
    $('#ym_btn_ai_diary').prop('disabled', true).text('正在偷看...');
    const task = `请写一篇简短的私密日记。记录下你今天对用户的感觉、爱意或者反思。直接输出日记正文，绝不要带任何系统提示和前缀！`;
    const reply = await callYumeAI(task);
    
    settings.diary.push({ id: Date.now(), author: 'ai', date: new Date().toLocaleDateString(), text: reply });
    SillyTavern.getContext().saveSettingsDebounced(); renderDiary();
    $('#ym_btn_ai_diary').prop('disabled', false).text('偷看TA的日记');
}

function updateProfileInjection() {
    const context = SillyTavern.getContext();
    if (!settings.birthday && !settings.periodLast && !settings.vibe && settings.diary.length === 0) return;

    const publicDiaries = settings.diary.filter(d => d.author === 'user' && d.isPublic).slice(-2);
    const diaryText = publicDiaries.length ? `\n- 最近的日记心情：${publicDiaries.map(d => d.text).join('；')}` : '';

    const prompt = `[伴侣绝密档案：
- 生日：${settings.birthday || '未知'}
- 生理期：${currentPeriodStatusText}
- 心情：${settings.vibe || '平静'} ${diaryText}
请在对话中自然体现对上述信息的了解，并主动关怀。]`;

    context.setExtensionPrompt('yume_profile', prompt, 4, 4, false, 0);
}