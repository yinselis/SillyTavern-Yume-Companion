const MODULE_NAME = 'yume-companion';

const defaultSettings = {
    showFloat: true, floatIcon: '', fabX: '', fabY: '', anniversary: '',
    apiUrl: '', apiKey: '', apiModel: '',
    theme: 'dark', 
    chars: {} 
};

let settings = {};
let currentPeriodStatusText = '未知'; 
let currentCharId = null;

// ====== 1. 核心数据管理 ======

function getCharData() {
    const context = SillyTavern.getContext();
    if (!context.characterId) return null;
    
    if (!settings.chars) settings.chars = {};
    
    // 初始化当前角色
    if (!settings.chars[context.characterId]) {
        settings.chars[context.characterId] = {
            birthday: '', mbti: '', vibe: '', 
            periodStart: '', periodEnd: '', periodCycle: 28, 
            randomLetterProb: 0, 
            diary: [], 
            letters: [], 
            pendingLetters: []
        };
    }
    return settings.chars[context.characterId];
}

function loadSettings() {
    const context = SillyTavern.getContext();
    if (!context.extensionSettings[MODULE_NAME]) context.extensionSettings[MODULE_NAME] = {};
    settings = context.extensionSettings[MODULE_NAME];
    for (const key in defaultSettings) {
        if (settings[key] === undefined) settings[key] = defaultSettings[key];
    }
}

// 自动备份旧数据（防止丢失）
function migrateOldData() {
    const context = SillyTavern.getContext();
    // 只要根目录下还有旧数据，就赶紧存到 default_migrated 里保护起来
    if ((settings.diary && settings.diary.length > 0) || (settings.letters && settings.letters.length > 0)) {
        if (!settings.chars) settings.chars = {};
        
        if (!settings.chars['default_migrated']) {
            settings.chars['default_migrated'] = {
                birthday: settings.birthday || '',
                mbti: settings.mbti || '',
                vibe: settings.vibe || '',
                periodStart: settings.periodLast || '',
                periodEnd: '',
                periodCycle: settings.periodCycle || 28,
                randomLetterProb: 5,
                diary: settings.diary || [],
                letters: settings.letters || [],
                pendingLetters: []
            };
            console.log('[Yume] 旧数据已安全备份至 default_migrated');
        }
        // 清理根目录，避免混淆（数据已在 chars['default_migrated'] 中）
        delete settings.diary; delete settings.letters; delete settings.birthday; delete settings.mbti; 
        delete settings.vibe; delete settings.periodLast;
        context.saveSettingsDebounced();
    }
}

// ====== 2. 初始化流程 ======
jQuery(async () => {
    const context = SillyTavern.getContext();
    context.eventSource.on(context.eventTypes.APP_READY, async () => {
        loadSettings();
        migrateOldData();
        await initSidebarUI();
        await initModalUI();
        
        context.eventSource.on(context.eventTypes.CHAT_CHANGED, handleChatChange);
        context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, handleChatProgress);
        
        handleChatChange();
    });
});

function handleChatChange() {
    const context = SillyTavern.getContext();
    currentCharId = context.characterId;
    const charName = context.name2 || 'TA';
    
    if (currentCharId) {
        $('#yume-modal-title').text(`🌸 ${charName} 的专属手账`);
        refreshAllDataBindings();
    } else {
        $('#yume-modal-title').text(`🌸 梦向专属手账 (未选中角色)`);
    }
}

function refreshAllDataBindings() {
    const data = getCharData();
    if(!data) return;

    applyTheme(settings.theme || 'dark');
    $('#ym_theme_select').val(settings.theme || 'dark');

    $('#ym_birth').val(data.birthday);
    $('#ym_mbti').val(data.mbti);
    $('#ym_vibe').val(data.vibe);
    $('#ym_p_start').val(data.periodStart);
    $('#ym_p_end').val(data.periodEnd);
    $('#ym_p_cycle').val(data.periodCycle);
    $('#ym_random_letter_prob').val(data.randomLetterProb !== undefined ? data.randomLetterProb : 0);

    // 🔥 检查是否有旧数据备份，如果有，显示恢复按钮
    checkAndShowRestoreButton();

    calculateAnniversary();
    calculatePeriod();
    renderDiary();
    renderLetters();
    updateProfileInjection();
}

// 🔥 新增：检测并显示数据恢复按钮
function checkAndShowRestoreButton() {
    // 先移除旧按钮防止重复
    $('#ym_restore_btn_container').remove();

    // 检查是否有备份数据
    if (settings.chars && settings.chars['default_migrated']) {
        const backup = settings.chars['default_migrated'];
        if ((backup.diary && backup.diary.length > 0) || (backup.letters && backup.letters.length > 0)) {
            // 在档案页最上方插入恢复按钮
            const btnHtml = `
                <div id="ym_restore_btn_container" style="margin-bottom: 15px; padding: 10px; background: rgba(255, 154, 158, 0.15); border: 1px dashed #ff9a9e; border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.85em; margin-bottom: 5px; color: var(--ym-primary);">⚠️ 检测到旧版本数据 (日记/信件)</div>
                    <button id="ym_btn_restore_data" class="yume-btn" style="background: #ff9a9e; padding: 6px;">📥 导入给当前角色</button>
                </div>
            `;
            $('#yume-tab-profile').prepend(btnHtml);
            
            // 绑定恢复事件
            $('#ym_btn_restore_data').on('click', () => {
                if(!confirm('确定要将旧版日记和信件合并到当前角色吗？\n(不会覆盖现有数据，只会追加)')) return;
                
                const currentData = getCharData();
                const oldData = settings.chars['default_migrated'];
                
                // 合并日记（去重）
                if (oldData.diary) {
                    oldData.diary.forEach(oldD => {
                        if (!currentData.diary.find(d => d.id === oldD.id)) {
                            currentData.diary.push(oldD);
                        }
                    });
                }
                
                // 合并信件
                if (oldData.letters) {
                    oldData.letters.forEach(oldL => {
                        // 简单判断是否重复
                        const isDup = currentData.letters.some(curL => curL.date === oldL.date && curL.text === oldL.text);
                        if (!isDup) currentData.letters.push(oldL);
                    });
                }

                // 恢复其他设置（如果当前为空）
                if(!currentData.birthday) currentData.birthday = oldData.birthday;
                if(!currentData.mbti) currentData.mbti = oldData.mbti;
                if(!currentData.periodStart) currentData.periodStart = oldData.periodStart;

                SillyTavern.getContext().saveSettingsDebounced();
                toastr.success('旧数据已成功导入！', '🌸 恢复成功');
                $('#ym_restore_btn_container').fadeOut(); // 隐藏按钮
                refreshAllDataBindings(); // 刷新界面
            });
        }
    }
}

function applyTheme(themeName) {
    const modal = $('#yume-main-modal');
    modal.removeClass('theme-light theme-dark theme-matcha');
    modal.addClass(`theme-${themeName}`);
}

// ====== 3. UI 初始化 ======
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
            toastr.info('已保存！默认使用酒馆通道。');
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
            if (res.ok) toastr.success('API 连接成功！');
            else toastr.error('连接失败，请检查 URL 和 Key。');
        } catch (e) {
            toastr.error('请求出错。');
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

    fab.on('click', () => { 
        if(!isDragging) {
            $('#yume-main-modal').fadeToggle(200);
            setTimeout(() => {
                const activeTab = $('.yume-tab.active').data('target');
                if(activeTab === 'yume-tab-letters') scrollToBottom('yume-letters-history');
                if(activeTab === 'yume-tab-diary') scrollToBottom('yume-diary-history');
            }, 100);
        }
    });
    $('#yume-close-btn').on('click', () => $('#yume-main-modal').fadeOut(200));

    $('.yume-tab').on('click', function() {
        $('.yume-tab').removeClass('active'); $(this).addClass('active');
        $('.yume-tab-pane').removeClass('active'); 
        const target = $(this).data('target');
        $(`#${target}`).addClass('active');
        setTimeout(() => {
            if(target === 'yume-tab-letters') scrollToBottom('yume-letters-history');
            if(target === 'yume-tab-diary') scrollToBottom('yume-diary-history');
        }, 50);
    });

    const bindCharData = (id, key) => {
        $(`#${id}`).on('input change', (e) => {
            const data = getCharData(); if(!data) return;
            data[key] = $(e.target).val();
            context.saveSettingsDebounced();
            if(id.startsWith('ym_p_')) calculatePeriod();
            updateProfileInjection();
        });
    };
    bindCharData('ym_birth', 'birthday');
    bindCharData('ym_mbti', 'mbti');
    bindCharData('ym_vibe', 'vibe');
    bindCharData('ym_p_start', 'periodStart');
    bindCharData('ym_p_end', 'periodEnd');
    bindCharData('ym_p_cycle', 'periodCycle');
    bindCharData('ym_random_letter_prob', 'randomLetterProb');

    $('#ym_theme_select').on('change', (e) => {
        settings.theme = $(e.target).val();
        applyTheme(settings.theme);
        context.saveSettingsDebounced();
    });

    $('#ym_btn_write_letter').on('click', () => $('#yume-letter-writer').slideToggle());
    $('#ym_send_letter_btn').on('click', handleSendLetter);
    $('#ym_btn_write_diary').on('click', () => $('#yume-diary-writer').slideToggle());
    $('#ym_save_diary_btn').on('click', handleSaveDiary);
    $('#ym_btn_ai_diary').on('click', handleAIDiary);
}

function scrollToBottom(id) {
    const el = document.getElementById(id);
    if(el) el.scrollTop = el.scrollHeight;
}

function calculateAnniversary() {
    if (!settings.anniversary) { $('#yume-anniversary-text').text(''); return; }
    const diff = Math.floor((new Date().setHours(0,0,0,0) - new Date(settings.anniversary).setHours(0,0,0,0)) / 86400000);
    $('#yume-anniversary-text').text(diff >= 0 ? `💕 已相伴 ${diff} 天` : `💕 距离相伴还有 ${Math.abs(diff)} 天`);
}

function calculatePeriod() {
    const data = getCharData();
    if (!data || !data.periodStart) { 
        $('#yume-period-status').text('尚未设置生理期').css('color', 'inherit'); 
        currentPeriodStatusText = '未知';
        return; 
    }
    const today = new Date().setHours(0,0,0,0);
    const start = new Date(data.periodStart).setHours(0,0,0,0);
    const end = data.periodEnd ? new Date(data.periodEnd).setHours(0,0,0,0) : start + 4 * 86400000;
    
    if (today >= start && today <= end) {
        const dayNum = Math.floor((today - start) / 86400000) + 1;
        currentPeriodStatusText = `生理期第 ${dayNum} 天`;
        $('#yume-period-status').text('🩸 ' + currentPeriodStatusText).css('color', '#ff5a5f');
    } else {
        const diff = Math.floor((today - start) / 86400000);
        const cycle = parseInt(data.periodCycle) || 28;
        if (cycle > 0) {
            const daysIntoCycle = diff % cycle;
            const daysLeft = cycle - daysIntoCycle;
            const realDaysLeft = daysIntoCycle < 0 ? Math.abs(daysIntoCycle) : daysLeft;
            currentPeriodStatusText = `距下次还有 ${realDaysLeft} 天`;
            $('#yume-period-status').text('☁️ ' + currentPeriodStatusText).css('color', 'var(--ym-primary)');
        } else {
            $('#yume-period-status').text('☁️ 周期未设置');
        }
    }
}

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
        } catch(e) { return "（独立API请求失败）"; }
    } else {
        try {
            const rawReply = await context.generateRaw({
                systemPrompt: sysPrompt,
                prompt: taskPrompt,
                bypassChat: true
            });
            return rawReply.trim();
        } catch (e) { return "（生成失败，请检查主API连接）"; }
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

// ====== 5. 信笺模块 ======
function renderLetters() {
    const data = getCharData(); if(!data) return;
    const $c = $('#yume-letters-history'); $c.empty();
    data.letters.forEach(l => {
        const isUser = l.type === 'user';
        const senderText = isUser ? `To TA - 寄出: ${l.date}` : `From TA - 收到: ${l.date}`;
        $c.append(`
            <div class="yume-letter-card">
                <div class="yume-letter-header">✉️ ${senderText}</div>
                <div>${l.text.replace(/\n/g, '<br>')}</div>
            </div>
        `);
    });
}

async function handleSendLetter() {
    const data = getCharData(); if(!data) return;
    const text = $('#ym_letter_input').val().trim();
    if (!text) return toastr.warning('信纸是空的！');
    const delayTurns = parseInt($('#ym_letter_delay').val()) || 3;
    const readDepth = parseInt($('#ym_letter_depth').val()) || 10;
    
    data.letters.push({ type: 'user', date: new Date().toLocaleDateString()+' '+new Date().toLocaleTimeString(), text });
    if(!data.pendingLetters) data.pendingLetters = [];
    data.pendingLetters.push({ userText: text, remainingTurns: delayTurns, readDepth: readDepth });
    
    $('#ym_letter_input').val(''); $('#yume-letter-writer').slideUp();
    renderLetters(); scrollToBottom('yume-letters-history');
    SillyTavern.getContext().saveSettingsDebounced(); 
    toastr.success(`信件已寄出！TA将在大约 ${delayTurns} 轮对话后回信。`, '💌 递交成功');
}

async function handleChatProgress() {
    const data = getCharData(); if(!data) return;
    const context = SillyTavern.getContext();
    const chat = context.chat;
    let needSave = false;

    if (data.pendingLetters && data.pendingLetters.length > 0) {
        for (let i = data.pendingLetters.length - 1; i >= 0; i--) {
            let p = data.pendingLetters[i];
            p.remainingTurns--;
            if (p.remainingTurns <= 0) {
                const history = chat.slice(-p.readDepth).map(m => `${m.is_user ? '我' : 'TA'}: ${m.mes}`).join('\n');
                const task = `用户之前给你写了一封信：\n"${p.userText}"\n\n你们在这段时间里的聊天记录：\n${history}\n\n请你经过一段时间的思考后，结合你们刚聊的内容，给用户写一封深情的回信。直接输出信件正文！`;
                callYumeAI(task).then(reply => {
                    data.letters.push({ type: 'ai', date: new Date().toLocaleDateString()+' '+new Date().toLocaleTimeString(), text: reply });
                    renderLetters(); SillyTavern.getContext().saveSettingsDebounced();
                    toastr.success('信箱里有一封TA的新回信！', '💌 收到来信');
                });
                data.pendingLetters.splice(i, 1);
                needSave = true;
            }
        }
    }
    const prob = (data.randomLetterProb !== undefined ? parseInt(data.randomLetterProb) : 0) / 100;
    if (prob > 0 && Math.random() < prob) {
        const history = chat.slice(-10).map(m => `${m.is_user ? '我' : 'TA'}: ${m.mes}`).join('\n');
        const task = `结合刚才的聊天记录：\n${history}\n\n你突然有感而发，偷偷给用户写了一封充满爱意和占有欲的长信。直接输出信件正文！`;
        callYumeAI(task).then(reply => {
            data.letters.push({ type: 'ai', date: new Date().toLocaleDateString()+' '+new Date().toLocaleTimeString(), text: reply });
            renderLetters(); SillyTavern.getContext().saveSettingsDebounced();
            toastr.success('TA似乎悄悄给你塞了一封信...', '💌 意外惊喜');
        });
    }
    if(needSave) context.saveSettingsDebounced();
}

// ====== 6. 日记模块 ======
function renderDiary() {
    const data = getCharData(); if(!data) return;
    const $c = $('#yume-diary-history'); $c.empty();
    let needSave = false;
    data.diary.slice().reverse().forEach(d => {
        let authorStr = d.author === 'user' ? '我的日记' : 'TA的日记';
        if (d.aiReply && d.aiReply !== '' && (!d.replies || d.replies.length === 0)) {
            if (!d.replies) d.replies = [];
            d.replies.push({ author: 'ai', text: d.aiReply, date: d.date });
            delete d.aiReply; needSave = true;
        }
        if (!d.replies) d.replies = [];
        let repliesHtml = d.replies.map(r => {
            const name = r.author === 'user' ? '我' : 'TA';
            const cls = r.author === 'user' ? 'user-reply' : 'ai-reply';
            if (r.isLoading) return `<div class="yume-diary-reply ai-reply"><i class="fa-solid fa-pen-nib fa-bounce"></i> TA正在思考...</div>`;
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
    const data = getCharData(); if(!data) return;
    const text = $('#ym_diary_input').val().trim();
    if (!text) return;
    const isPublic = $('#ym_diary_public').prop('checked');
    const wantsReply = $('#ym_diary_reply').prop('checked');
    let entry = { id: Date.now(), author: 'user', date: new Date().toLocaleDateString(), text, isPublic, replies: [] };
    data.diary.push(entry);
    $('#ym_diary_input').val(''); $('#yume-diary-writer').slideUp(); 
    SillyTavern.getContext().saveSettingsDebounced(); updateProfileInjection(); renderDiary();
    if (wantsReply) yumeAddReply(entry.id, 'ai', true);
}

async function handleAIDiary() {
    const data = getCharData(); if(!data) return;
    $('#ym_btn_ai_diary').prop('disabled', true).text('正在偷看...');
    const task = `请写一篇简短的私密日记。记录下你今天对用户的感觉、爱意或者反思。直接输出日记正文，绝不要带任何系统提示和前缀！`;
    callYumeAI(task).then(reply => {
        data.diary.push({ id: Date.now(), author: 'ai', date: new Date().toLocaleDateString(), text: reply, replies:[] });
        SillyTavern.getContext().saveSettingsDebounced(); renderDiary();
        $('#ym_btn_ai_diary').prop('disabled', false).text('偷看TA的日记');
        toastr.success('偷看成功！TA写了一篇新日记。', '🌸 秘密');
    });
}

window.yumeDeleteDiary = function(id) {
    if(!confirm('确定要撕掉这一页日记吗？')) return;
    const data = getCharData(); if(!data) return;
    data.diary = data.diary.filter(d => d.id !== id);
    SillyTavern.getContext().saveSettingsDebounced(); renderDiary(); updateProfileInjection();
};

window.yumeAddReply = function(id, author, isInitial = false) {
    const data = getCharData(); if(!data) return;
    const d = data.diary.find(x => x.id === id);
    if (!d) return;
    if (!d.replies) d.replies = [];
    if (author === 'user') {
        const text = $(`#ym_reply_input_${id}`).val().trim();
        if (!text) return toastr.warning('评论内容不能为空');
        d.replies.push({ author: 'user', text, date: new Date().toLocaleTimeString() });
        SillyTavern.getContext().saveSettingsDebounced(); renderDiary(); return;
    }
    if (author === 'ai') {
        const contextHistory = d.replies.map(r => `${r.author === 'user' ? '用户' : '你'}说: "${r.text}"`).join('\n');
        const task = `这是用户的一篇日记：\n"${d.text}"\n\n目前的评论区记录：\n${contextHistory}\n\n请你接着上面的对话，在评论区里新发一条留言。要求：\n1. 语气符合你的人设（亲密、调侃或温柔）。\n2. 针对上一条评论或日记正文回复，不要自言自语。`;
        const loadingId = Date.now();
        d.replies.push({ author: 'ai', text: '', isLoading: true, tempId: loadingId });
        renderDiary();
        callYumeAI(task).then(reply => {
            const target = d.replies.find(r => r.tempId === loadingId);
            if (target) {
                target.text = reply; delete target.isLoading; delete target.tempId;
                SillyTavern.getContext().saveSettingsDebounced(); renderDiary();
                if (!isInitial) toastr.success('TA回复了你的评论！', '🌸');
            }
        });
    }
};

function updateProfileInjection() {
    const data = getCharData(); if(!data) return;
    const context = SillyTavern.getContext();
    if (!data.birthday && !data.periodStart && !data.vibe && data.diary.length === 0) return;
    const publicDiaries = data.diary.filter(d => d.author === 'user' && d.isPublic).slice(-2);
    const diaryText = publicDiaries.length ? `\n- 最近的日记心情：${publicDiaries.map(d => d.text).join('；')}` : '';
    const prompt = `[伴侣绝密档案：\n- 生日：${data.birthday || '未知'}\n- 生理期状态：${currentPeriodStatusText}\n- 今日心情：${data.vibe || '平静'} ${diaryText}\n请在日常对话中自然体现对上述信息的了解，并主动关怀。]`;
    context.setExtensionPrompt('yume_profile', prompt, 4, 4, false, 0);
      }
