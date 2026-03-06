const MODULE_NAME = 'yume-companion';

const defaultSettings = {
    showFloat: true, floatIcon: '', fabX: '', fabY: '', anniversary: '',
    apiUrl: '', apiKey: '', apiModel: '',
    birthday: '', mbti: '', vibe: '', periodLast: '', periodCycle: 28, periodDuration: 5,
    letters: [], diary:[]
};

let settings = {};
let currentPeriodStatusText = '未知'; 

// ====== 1. 初始化入口 ======
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

// ====== 2. 侧边栏 UI ======
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

// ====== 3. 主弹窗 UI ======
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

// ====== 4. 核心 AI 调用 ======
async function callYumeAI(taskPrompt) {
    const context = SillyTavern.getContext();
    const charName = context.name2 || '伴侣';
    const userName = context.name1 || '用户';
    const char = context.characters[context.characterId] || {};
    
    const sysPrompt = `你现在扮演 ${charName}。这是你的核心设定：\n${char.personality || ''}\n${char.description || ''}\n\n当前状态：你正在一个私下的陪伴空间中给用户(${userName})反馈。请完全遵循人设，语气极度自然、宠溺。绝不能暴露AI身份，绝不能包含系统通知！`;

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
        try {
            const rawReply = await context.generateRaw({
                systemPrompt: sysPrompt,
                prompt: taskPrompt,
                bypassChat: true
            });
            return rawReply.trim();
        } catch (e) {
            console.error(e);
            return "（生成失败，请确保主聊天API已连接）";
        }
    }
}

window.yumeInteract = async function(type) {
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

// ====== 5. 信笺模块 (纸质渲染) ======
function renderLetters() {
    const $c = $('#yume-letters-history'); $c.empty();
    settings.letters.forEach(l => {
        const isUser = l.type === 'user';
        const senderText = isUser ? `To TA - 寄出时间: ${l.date}` : `From TA - 收到时间: ${l.date}`;
        $c.append(`
            <div class="yume-letter-card">
                <div class="yume-letter-header">✉️ ${senderText}</div>
                <div>${l.text.replace(/\n/g, '<br>')}</div>
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
    $('#ym_send_letter_btn').prop('disabled', true).text('TA正在拆信...');

    const task = `用户给你写了一封信：\n"${text}"\n\n请以你的口吻写一封回信。要求：极度深情宠溺，直接输出信的正文，不需要输出“这是回信”等系统废话。`;
    callYumeAI(task).then(reply => {
        settings.letters.push({ type: 'ai', date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), text: reply });
        SillyTavern.getContext().saveSettingsDebounced(); 
        renderLetters();
        $('#ym_send_letter_btn').prop('disabled', false).text('悄悄寄出');
        toastr.success('TA给你回信啦！', '🌸 收到回信');
    });
}

// ====== 6. 日记模块 (盖楼+自动迁移修复) ======
function renderDiary() {
    const $c = $('#yume-diary-history'); 
    $c.empty();
    let needSave = false;

    settings.diary.slice().reverse().forEach(d => {
        let authorStr = d.author === 'user' ? '我的日记' : 'TA的日记';
        
        // 🚨 自动迁移修复：把旧的单条回复转成数组
        if (d.aiReply && d.aiReply !== '' && (!d.replies || d.replies.length === 0)) {
            if (!d.replies) d.replies = [];
            d.replies.push({ author: 'ai', text: d.aiReply, date: d.date });
            delete d.aiReply;
            needSave = true;
        }
        if (!d.replies) d.replies = [];

        let repliesHtml = d.replies.map(r => {
            const name = r.author === 'user' ? '我' : 'TA';
            const cls = r.author === 'user' ? 'user-reply' : 'ai-reply';
            if (r.isLoading) {
                return `<div class="yume-diary-reply ai-reply"><i class="fa-solid fa-pen-nib fa-bounce"></i> TA正在思考...</div>`;
            }
            return `<div class="yume-diary-reply ${cls}"><div style="font-size:0.7em; opacity:0.6;">${name}</div>${r.text.replace(/\n/g, '<br>')}</div>`;
        }).join('');

        $c.append(`
            <div class="yume-diary-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px dashed rgba(255,255,255,0.1); padding-bottom:5px;">
                    <span class="ym-msg-time">📅 ${d.date} | ${authorStr}</span>
                    <button class="ym-btn-del" onclick="yumeDeleteDiary(${d.id})" title="撕掉这页"><i class="fa-solid fa-trash-can"></i></button>
                </div>
                <div style="font-size:1.05em; margin-bottom: 15px; padding:0 5px;">${d.text.replace(/\n/g, '<br>')}</div>
                <div class="yume-replies-container" style="${d.replies.length===0?'display:none;':''}">${repliesHtml}</div>
                <div class="ym-reply-box">
                    <input type="text" id="ym_reply_input_${d.id}" class="text_pole" style="flex:1; padding:8px; font-size:0.9em; border-radius:4px;" placeholder="在此处追加评论...">
                    <button class="yume-btn-outline" style="padding:6px 12px; margin:0;" onclick="yumeAddReply(${d.id}, 'user')">我来说</button>
                    <button class="yume-btn-outline" style="padding:6px 12px; margin:0;" onclick="yumeAddReply(${d.id}, 'ai')">让TA回</button>
                </div>
            </div>
        `);
    });

    if (needSave) SillyTavern.getContext().saveSettingsDebounced();
}

function handleSaveDiary() {
    const text = $('#ym_diary_input').val().trim();
    if (!text) return;
    const isPublic = $('#ym_diary_public').prop('checked');
    const wantsReply = $('#ym_diary_reply').prop('checked');
    let entry = { id: Date.now(), author: 'user', date: new Date().toLocaleDateString(), text, isPublic, replies: [] };
    settings.diary.push(entry);
    $('#ym_diary_input').val(''); 
    $('#yume-diary-writer').slideUp(); 
    SillyTavern.getContext().saveSettingsDebounced();
    updateProfileInjection();
    renderDiary();
    if (wantsReply) yumeAddReply(entry.id, 'ai', true);
}

async function handleAIDiary() {
    $('#ym_btn_ai_diary').prop('disabled', true).text('正在偷看...');
    const task = `请写一篇简短的私密日记。记录下你今天对用户的感觉、爱意或者反思。直接输出日记正文，绝不要带任何系统提示和前缀！`;
    callYumeAI(task).then(reply => {
        settings.diary.push({ id: Date.now(), author: 'ai', date: new Date().toLocaleDateString(), text: reply, replies:[] });
        SillyTavern.getContext().saveSettingsDebounced(); 
        renderDiary();
        $('#ym_btn_ai_diary').prop('disabled', false).text('偷看TA的日记');
        toastr.success('偷看成功！TA写了一篇新日记。', '🌸 秘密');
    });
}

window.yumeDeleteDiary = function(id) {
    if(!confirm('确定要撕掉这一页日记吗？')) return;
    settings.diary = settings.diary.filter(d => d.id !== id);
    SillyTavern.getContext().saveSettingsDebounced();
    renderDiary();
    updateProfileInjection();
};

window.yumeAddReply = function(id, author, isInitial = false) {
    const d = settings.diary.find(x => x.id === id);
    if (!d) return;
    if (!d.replies) d.replies = [];

    if (author === 'user') {
        const text = $(`#ym_reply_input_${id}`).val().trim();
        if (!text) return toastr.warning('评论内容不能为空');
        d.replies.push({ author: 'user', text, date: new Date().toLocaleTimeString() });
        SillyTavern.getContext().saveSettingsDebounced();
        renderDiary();
        return;
    }

    if (author === 'ai') {
        const contextHistory = d.replies.map(r => `${r.author === 'user' ? '用户' : '你'}说: "${r.text}"`).join('\n');
        const task = `这是用户的一篇日记：\n"${d.text}"\n\n目前的评论区记录：\n${contextHistory}\n\n请你接着上面的对话，在评论区里新发一条留言。要求：\n1. 语气符合你的人设（亲密、调侃或温柔）。\n2. 针对上一条评论或日记正文回复，不要自言自语。`;
        
        const loadingId = Date.now();
        const loadingEntry = { author: 'ai', text: '', isLoading: true, tempId: loadingId };
        d.replies.push(loadingEntry);
        renderDiary();

        callYumeAI(task).then(reply => {
            const target = d.replies.find(r => r.tempId === loadingId);
            if (target) {
                target.text = reply;
                delete target.isLoading;
                delete target.tempId;
                SillyTavern.getContext().saveSettingsDebounced();
                renderDiary();
                if (!isInitial) toastr.success('TA回复了你的评论！', '🌸');
            }
        });
    }
};

function updateProfileInjection() {
    const context = SillyTavern.getContext();
    if (!settings.birthday && !settings.periodLast && !settings.vibe && settings.diary.length === 0) return;
    const publicDiaries = settings.diary.filter(d => d.author === 'user' && d.isPublic).slice(-2);
    const diaryText = publicDiaries.length ? `\n- 最近的日记心情：${publicDiaries.map(d => d.text).join('；')}` : '';
    const prompt = `[伴侣绝密档案：\n- 生日：${settings.birthday || '未知'}\n- 生理期状态：${currentPeriodStatusText}\n- 今日心情：${settings.vibe || '平静'} ${diaryText}\n请在日常对话中自然体现对上述信息的了解，并主动关怀。]`;
    context.setExtensionPrompt('yume_profile', prompt, 4, 4, false, 0);
}