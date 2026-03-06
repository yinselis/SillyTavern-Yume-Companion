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
    const htmlPath = `${currentPath}/settings.html`;
    
    $('#extensions_settings').append(await $.get(htmlPath));

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
    
    // API 设置
    bindSetting('ym_api_url', 'apiUrl');
    bindSetting('ym_api_key', 'apiKey');
    bindSetting('ym_api_model', 'apiModel');
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

    // 拖拽
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

    // Tabs
    $('.yume-tab').on('click', function() {
        $('.yume-tab').removeClass('active'); $(this).addClass('active');
        $('.yume-tab-pane').removeClass('active'); $(`#${$(this).data('target')}`).addClass('active');
    });

    // 📌 这里修复了之前的致命语法错误['birth', 'mbti', 'vibe'].forEach(id => {
        $(`#ym_${id}`).val(settings[id == 'birth' ? 'birthday' : id]).on('input', (e) => {
            settings[id == 'birth' ? 'birthday' : id] = $(e.target).val();
            context.saveSettingsDebounced(); updateProfileInjection();
        });
    });

    // 生理期绑定
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

// ✨核心：构造独立的底层大模型请求（提取角色性格、最新对话）
async function callYumeAI(taskPrompt) {
    const context = SillyTavern.getContext();
    const charName = context.name2 || '伴侣';
    const userName = context.name1 || '用户';
    
    // 强制读取当前角色卡设定
    const char = context.characters[context.characterId] || {};
    const charDesc = char.description || '';
    const charPersona = char.personality || '';
    
    // 提取最近5条聊天记录，增强伴随感
    let chatLog = "无";
    if (context.chat && context.chat.length > 0) {
        chatLog = context.chat.slice(-5).map(m => `${m.is_user ? userName : charName}: ${m.mes}`).join('\n');
    }

    const sysPrompt = `你现在扮演 ${charName}。这是你的设定：\n${charPersona}\n${charDesc}\n\n你们最近的聊天记录：\n${chatLog}\n\n当前状态：你们正处于私下的特殊陪伴空间。请完全遵循人设，语气要极其自然、宠溺，绝对不要像AI。`;

    if (settings.apiUrl && settings.apiKey) {
        // 使用独立配置的 API
        try {
            let url = settings.apiUrl;
            if (!url.endsWith('/')) url += '/';
            const res = await fetch(url + 'chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
                body: JSON.stringify({
                    model: settings.apiModel || 'gpt-3.5-turbo',
                    messages:[ {role: "system", content: sysPrompt}, {role: "user", content: taskPrompt} ],
                    temperature: 0.75
                })
            });
            const data = await res.json();
            return data.choices[0].message.content;
        } catch(e) {
            console.error(e);
            return "（TA的思绪似乎断开了连接，请检查独立API设置或网络...）";
        }
    } else {
        // 使用酒馆默认后台生成
        return await context.generateQuietPrompt({ quietPrompt: sysPrompt + "\n\n【任务要求】\n" + taskPrompt });
    }
}

// 互动面板
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

    const task = `用户刚刚对你做了一个动作：*${acts[type]}*。请给出一个简短但符合你人设的反应描写和一两句对话。只需输出你的反应，控制在100字左右。`;
    
    const reply = await callYumeAI(task);
    
    $('#yume-interact-loading').hide();
    $('#yume-interact-text').text(`🌸 ${charName}：\n${reply}`);
}

// 信笺系统
function renderLetters() {
    const $c = $('#yume-letters-history'); $c.empty();
    settings.letters.forEach(l => {
        const isUser = l.type === 'user';
        $c.append(`
            <div class="yume-msg-box ${isUser ? 'yume-msg-user' : 'yume-msg-ai'}">
                <div class="yume-msg-time">${isUser ? '你' : 'TA'} - ${l.date}</div>
                <div>${l.text}</div>
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

    const task = `用户给你写了一封信：\n"${text}"\n请以你的口吻写一封回信。要求：符合信笺格式，极度深情宠溺，只输出正文。`;
    const reply = await callYumeAI(task);
    
    settings.letters.push({ type: 'ai', date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), text: reply });
    SillyTavern.getContext().saveSettingsDebounced(); renderLetters();
    $('#ym_send_letter_btn').prop('disabled', false).text('悄悄寄出');
}

// 日记系统
function renderDiary() {
    const $c = $('#yume-diary-history'); $c.empty();
    settings.diary.slice().reverse().forEach(d => {
        let authorStr = d.author === 'user' ? '我的日记' : 'TA的日记';
        let html = `
            <div class="yume-diary-card">
                <div class="yume-msg-time">📅 ${d.date} | ${authorStr}</div>
                <div>${d.text}</div>
                ${d.aiReply ? `<div class="yume-diary-reply">📝 TA的悄悄话：${d.aiReply}</div>` : ''}
            </div>
        `;
        $c.append(html);
    });
}

async function handleSaveDiary() {
    const text = $('#ym_diary_input').val().trim();
    if (!text) return;
    
    const isPublic = $('#ym_diary_public').prop('checked');
    const wantsReply = $('#ym_diary_reply').prop('checked');
    const btn = $('#ym_save_diary_btn');
    
    let entry = { id: Date.now(), author: 'user', date: new Date().toLocaleDateString(), text, isPublic };
    settings.diary.push(entry);
    $('#ym_diary_input').val(''); $('#yume-diary-writer').slideUp(); renderDiary();

    if (wantsReply) {
        btn.prop('disabled', true);
        const task = `你偶然看到了用户的这篇日记：\n"${text}"\n请以你的口吻写一句简短的心疼/宠溺的留言，就像写在日记本空白处一样。`;
        entry.aiReply = await callYumeAI(task);
        btn.prop('disabled', false);
        renderDiary();
    }
    
    SillyTavern.getContext().saveSettingsDebounced();
    updateProfileInjection(); // 更新公开日记到主记忆
}

async function handleAIDiary() {
    $('#ym_btn_ai_diary').prop('disabled', true).text('正在偷看...');
    const task = `请根据你们最近的聊天记录，写一篇简短的私密日记。记录下你今天对用户的感觉、爱意或者反思。不要写信头，直接写日记正文。`;
    const reply = await callYumeAI(task);
    
    settings.diary.push({ id: Date.now(), author: 'ai', date: new Date().toLocaleDateString(), text: reply });
    SillyTavern.getContext().saveSettingsDebounced(); renderDiary();
    $('#ym_btn_ai_diary').prop('disabled', false).text('偷看TA的日记');
}

// 主干记忆注入
function updateProfileInjection() {
    const context = SillyTavern.getContext();
    if (!settings.birthday && !settings.periodLast && !settings.vibe && settings.diary.length === 0) return;

    // 提取公开日记
    const publicDiaries = settings.diary.filter(d => d.author === 'user' && d.isPublic).slice(-2);
    const diaryText = publicDiaries.length ? `\n- 最近的日记心情：${publicDiaries.map(d => d.text).join('；')}` : '';

    const prompt = `[伴侣绝密档案：
- 生日：${settings.birthday || '未知'}
- 生理期：${currentPeriodStatusText}
- 心情：${settings.vibe || '平静'} ${diaryText}
请在对话中自然体现对上述信息的了解，并主动关怀。]`;

    context.setExtensionPrompt('yume_profile', prompt, 4, 4, false, 0);
}