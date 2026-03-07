const MODULE_NAME = 'yume-companion';

// 默认全局设置（API等）
const defaultSettings = {
    showFloat: true, floatIcon: '', fabX: '', fabY: '', anniversary: '',
    apiUrl: '', apiKey: '', apiModel: '',
    theme: 'dark', // 全局主题设置
    chars: {}      // 核心：所有角色数据存储在这里
};

let settings = {};
let currentPeriodStatusText = '未知'; 
let currentCharId = null;

// ====== 1. 核心数据管理 ======

// 获取当前角色的专属数据
function getCharData() {
    const context = SillyTavern.getContext();
    if (!context.characterId) return null;
    
    // 确保 chars 对象存在
    if (!settings.chars) settings.chars = {};
    
    // 初始化当前角色数据
    if (!settings.chars[context.characterId]) {
        settings.chars[context.characterId] = {
            birthday: '', mbti: '', vibe: '', 
            periodStart: '', periodEnd: '', periodCycle: 28, 
            randomLetterProb: 0, // 默认突发信笺概率
            diary: [], 
            letters: [], 
            pendingLetters: [] // 待回信队列
        };
    }
    return settings.chars[context.characterId];
}

function loadSettings() {
    const context = SillyTavern.getContext();
    if (!context.extensionSettings[MODULE_NAME]) context.extensionSettings[MODULE_NAME] = {};
    settings = context.extensionSettings[MODULE_NAME];
    // 补全默认值
    for (const key in defaultSettings) {
        if (settings[key] === undefined) settings[key] = defaultSettings[key];
    }
}

// 自动迁移旧版本数据（防止老用户数据丢失）
function migrateOldData() {
    const context = SillyTavern.getContext();
    // 如果发现根目录下有 diary 或 letters，说明是旧版数据
    if (settings.diary && settings.diary.length > 0 || settings.letters && settings.letters.length > 0) {
        if (!settings.chars) settings.chars = {};
        
        // 创建一个名为 "default_migrated" 的虚拟角色存放旧数据
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
        }
        // 清理根目录旧数据
        delete settings.diary;
        delete settings.letters;
        delete settings.birthday;
        delete settings.mbti;
        delete settings.vibe;
        delete settings.periodLast;
        
        context.saveSettingsDebounced();
        console.log('[Yume] 旧版本数据已迁移至 default_migrated');
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
        
        // 绑定事件
        context.eventSource.on(context.eventTypes.CHAT_CHANGED, handleChatChange);
        context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, handleChatProgress);
        
        // 初始加载
        handleChatChange();
    });
});

// 切换聊天时触发
function handleChatChange() {
    const context = SillyTavern.getContext();
    currentCharId = context.characterId;
    const charName = context.name2 || 'TA';
    
    if (currentCharId) {
        $('#yume-modal-title').text(`🌸 ${charName} 的专属手账`);
        refreshAllDataBindings();
    } else {
        $('#yume-modal-title').text(`🌸 梦向专属手账 (未选中角色)`);
        // 清空输入框显示
        $('.yume-tab-pane input').val('');
        $('#yume-letters-history').empty();
        $('#yume-diary-history').empty().append('<div style="padding:20px;text-align:center;opacity:0.5;">请先选择一个聊天对象</div>');
    }
}

// 刷新面板数据绑定
function refreshAllDataBindings() {
    const data = getCharData();
    if(!data) return;

    // 应用主题
    applyTheme(settings.theme || 'dark');
    $('#ym_theme_select').val(settings.theme || 'dark');

    // 绑定基础信息
    $('#ym_birth').val(data.birthday);
    $('#ym_mbti').val(data.mbti);
    $('#ym_vibe').val(data.vibe);
    $('#ym_p_start').val(data.periodStart);
    $('#ym_p_end').val(data.periodEnd);
    $('#ym_p_cycle').val(data.periodCycle);
    $('#ym_random_letter_prob').val(data.randomLetterProb !== undefined ? data.randomLetterProb : 0);

    calculateAnniversary();
    calculatePeriod();
    renderDiary();
    renderLetters();
    updateProfileInjection();
}

// 应用 CSS 主题
function applyTheme(themeName) {
    const modal = $('#yume-main-modal');
    modal.removeClass('theme-light theme-dark theme-matcha');
    modal.addClass(`theme-${themeName}`);
}

// ====== 3. UI 初始化与事件绑定 ======
async function initSidebarUI() {
    const context = SillyTavern.getContext();
    const currentPath = import.meta.url.substring(0, import.meta.url.lastIndexOf('/'));
    $('#extensions_settings').append(await $.get(`${currentPath}/settings.html`));

    // 绑定设置项
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

    // API 测试按钮
    $('#ym_btn_save_api').on('click', async function() {
        const btn = $(this);
        btn.html('<i class="fa-solid fa-spinner fa-spin"></i> 测试中...');
        if (!settings.apiUrl || !settings.apiKey) {
            toastr.info('已保存！当前未配置独立API，将默认使用酒馆通道。');
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
            else toastr.error('连接失败，请检查 URL 和 Key。');
        } catch (e) {
            toastr.error('请求出错，请检查网络。');
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

    // 拖动逻辑
    let isDragging = false, startX, startY, initialX, initialY;
    fab.on('mousedown touchstart', function(e) {
        isDragging = false;
        const evt = e.type.includes('touch') ? e.originalEvent.touches[0] : e;
        startX = evt.clientX; startY = evt.clientY;
        initialX = fab.offset().left - $(window).scrollLeft(); 
        initialY = fab.offset().top - $(window).scrollTop();
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
            // 每次打开自动滚动到底部
            setTimeout(() => {
                const activeTab = $('.yume-tab.active').data('target');
                if(activeTab === 'yume-tab-letters') scrollToBottom('yume-letters-history');
                if(activeTab === 'yume-tab-diary') scrollToBottom('yume-diary-history');
            }, 100);
        }
    });
    $('#yume-close-btn').on('click', () => $('#yume-main-modal').fadeOut(200));

    // 标签切换
    $('.yume-tab').on('click', function() {
        $('.yume-tab').removeClass('active'); $(this).addClass('active');
        $('.yume-tab-pane').removeClass('active'); 
        const target = $(this).data('target');
        $(`#${target}`).addClass('active');
        // 切换标签时也滚动到底部
        setTimeout(() => {
            if(target === 'yume-tab-letters') scrollToBottom('yume-letters-history');
            if(target === 'yume-tab-diary') scrollToBottom('yume-diary-history');
        }, 50);
    });

    // 绑定当前角色的输入事件
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

    // 主题切换
    $('#ym_theme_select').on('change', (e) => {
        settings.theme = $(e.target).val();
        applyTheme(settings.theme);
        context.saveSettingsDebounced();
    });

    // 按钮功能绑定
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
    // 默认持续5天
    const end = data.periodEnd ? new Date(data.periodEnd).setHours(0,0,0,0) : start + 4 * 86400000;
    
    // 如果在经期内
    if (today >= start && today <= end) {
        const dayNum = Math.floor((today - start) / 86400000) + 1;
        currentPeriodStatusText = `生理期第 ${dayNum} 天`;
        $('#yume-period-status').text('🩸 ' + currentPeriodStatusText).css('color', '#ff5a5f');
    } else {
        // 计算距离下次
        const diff = Math.floor((today - start) / 86400000);
        const cycle = parseInt(data.periodCycle) || 28;
        if (cycle > 0) {
            // 简单的周期推算
            const daysIntoCycle = diff % cycle;
            const daysLeft = cycle - daysIntoCycle;
            // 如果 daysIntoCycle 为负数(即开始时间在未来)，处理一下
            const realDaysLeft = daysIntoCycle < 0 ? Math.abs(daysIntoCycle) : daysLeft;
            
            currentPeriodStatusText = `距下次还有 ${realDaysLeft} 天`;
            $('#yume-period-status').text('☁️ ' + currentPeriodStatusText).css('color', 'var(--ym-primary)');
        } else {
            $('#yume-period-status').text('☁️ 周期未设置');
        }
    }
}

// ====== 4. 核心 AI 请求 (后台静默生成) ======
async function callYumeAI(taskPrompt) {
    const context = SillyTavern.getContext();
    const charName = context.name2 || '伴侣';
    const userName = context.name1 || '用户';
    const char = context.characters[context.characterId] || {};
    
    const sysPrompt = `你现在扮演 ${charName}。这是你的核心设定：\n${char.personality || ''}\n${char.description || ''}\n\n当前状态：你正在一个私下的陪伴空间中给用户(${userName})反馈。请完全遵循人设，语气极度自然、宠溺。绝不能暴露AI身份，绝不能包含系统通知！`;

    // 1. 尝试使用独立 API
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
            return "（独立API请求失败）";
        }
    } else {
        // 2. 使用酒馆主 API (Raw Generation)
        try {
            const rawReply = await context.generateRaw({
                systemPrompt: sysPrompt,
                prompt: taskPrompt,
                bypassChat: true // 不影响主聊天记录
            });
            return rawReply.trim();
        } catch (e) {
            console.error(e);
            return "（生成失败，请检查主API连接）";
        }
    }
}

// 全局互动函数
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

// ====== 5. 信笺模块 (延时与突发机制) ======
function renderLetters() {
    const data = getCharData(); if(!data) return;
    const $c = $('#yume-letters-history'); 
    $c.empty();
    
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
    
    // 用户信件立即上屏
    data.letters.push({ 
        type: 'user', 
        date: new Date().toLocaleDateString()+' '+new Date().toLocaleTimeString(), 
        text 
    });
    
    // 加入待回复队列
    if(!data.pendingLetters) data.pendingLetters = [];
    data.pendingLetters.push({ 
        userText: text, 
        remainingTurns: delayTurns, 
        readDepth: readDepth 
    });
    
    $('#ym_letter_input').val(''); 
    $('#yume-letter-writer').slideUp();
    renderLetters();
    scrollToBottom('yume-letters-history');
    
    SillyTavern.getContext().saveSettingsDebounced(); 
    toastr.success(`信件已寄出！TA将在大约 ${delayTurns} 轮对话后回信。`, '💌 递交成功');
}

// 核心监听：聊天进行时检查回信和突发事件
async function handleChatProgress() {
    const data = getCharData(); if(!data) return;
    const context = SillyTavern.getContext();
    const chat = context.chat;
    let needSave = false;

    // 1. 处理待回信队列
    if (data.pendingLetters && data.pendingLetters.length > 0) {
        // 倒序遍历以便安全删除
        for (let i = data.pendingLetters.length - 1; i >= 0; i--) {
            let p = data.pendingLetters[i];
            p.remainingTurns--; // 减少等待回合
            
            if (p.remainingTurns <= 0) {
                // 时间到了，生成回信
                // 读取最近 X 条聊天记录作为参考
                const history = chat.slice(-p.readDepth).map(m => `${m.is_user ? '我' : 'TA'}: ${m.mes}`).join('\n');
                const task = `用户之前给你写了一封信：\n"${p.userText}"\n\n你们在这段时间里的聊天记录：\n${history}\n\n请你经过一段时间的思考后，结合你们刚聊的内容，给用户写一封回信。直接输出信件正文！`;
                
                callYumeAI(task).then(reply => {
                    data.letters.push({ 
                        type: 'ai', 
                        date: new Date().toLocaleDateString()+' '+new Date().toLocaleTimeString(), 
                        text: reply 
                    });
                    renderLetters(); // 如果面板开着，实时刷新
                    SillyTavern.getContext().saveSettingsDebounced();
                    toastr.success('信箱里有一封TA的新回信！', '💌 收到来信');
                });
                
                data.pendingLetters.splice(i, 1); // 移出队列
                needSave = true;
            }
        }
    }

    // 2. 突发信笺机制 (Spontaneous Letter)
    // 获取概率设置，默认 0% (不开启)，最大 100%
    const prob = (data.randomLetterProb !== undefined ? parseInt(data.randomLetterProb) : 0) / 100;
    
    // 只有当概率 > 0 且真的随机到了
    if (prob > 0 && Math.random() < prob) {
        const history = chat.slice(-10).map(m => `${m.is_user ? '我' : 'TA'}: ${m.mes}`).join('\n');
        const task = `结合刚才的聊天记录：\n${history}\n\n你突然有感而发，偷偷给用户写了一封长信。直接输出信件正文！`;
        
        callYumeAI(task).then(reply => {
            data.letters.push({ 
                type: 'ai', 
                date: new Date().toLocaleDateString()+' '+new Date().toLocaleTimeString(), 
                text: reply 
            });
            renderLetters();
            SillyTavern.getContext().saveSettingsDebounced();
            toastr.success('TA似乎悄悄给你塞了一封信...', '💌 意外惊喜');
        });
    }

    if(needSave) context.saveSettingsDebounced();
}

// ====== 6. 日记模块 (论坛式盖楼) ======
function renderDiary() {
    const data = getCharData(); if(!data) return;
    const $c = $('#yume-diary-history'); 
    $c.empty();
    let needSave = false;

    // 倒序显示（最新的在最上面）
    data.diary.slice().reverse().forEach(d => {
        let authorStr = d.author === 'user' ? '我的日记' : 'TA的日记';
        
        // 自动修复旧数据结构
        if (d.aiReply && d.aiReply !== '' && (!d.replies || d.replies.length === 0)) {
            if (!d.replies) d.replies = [];
            d.replies.push({ author: 'ai', text: d.aiReply, date: d.date });
            delete d.aiReply;
            needSave = true;
        }
        if (!d.replies) d.replies = [];

        // 渲染评论区
        let repliesHtml = d.replies.map(r => {
            const name = r.author === 'user' ? '我' : 'TA';
            const cls = r.author === 'user' ? 'user-reply' : 'ai-reply';
            
            if (r.isLoading) {
                return `<div class="yume-diary-reply ai-reply"><i class="fa-solid fa-pen-nib fa-bounce"></i> TA正在思考...</div>`;
            }
            return `<div class="yume-diary-reply ${cls}">
                <div style="font-size:0.7em; opacity:0.6;">${name}</div>
                ${r.text.replace(/\n/g, '<br>')}
            </div>`;
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
    
    let entry = { 
        id: Date.now(), 
        author: 'user', 
        date: new Date().toLocaleDateString(), 
        text, 
        isPublic, 
        replies: [] 
    };
    data.diary.push(entry);
    
    $('#ym_diary_input').val(''); 
    $('#yume-diary-writer').slideUp(); 
    
    SillyTavern.getContext().saveSettingsDebounced();
    updateProfileInjection();
    renderDiary();
    
    // 如果勾选了渴望回复，自动触发 AI 盖楼
    if (wantsReply) yumeAddReply(entry.id, 'ai', true);
}

async function handleAIDiary() {
    const data = getCharData(); if(!data) return;
    $('#ym_btn_ai_diary').prop('disabled', true).text('正在偷看...');
    
    const task = `请写一篇简短的私密日记。记录下你今天对用户的感觉、爱意或者反思。直接输出日记正文，绝不要带任何系统提示和前缀！禁止油腻、土味、霸道语录`;
    callYumeAI(task).then(reply => {
        data.diary.push({ 
            id: Date.now(), 
            author: 'ai', 
            date: new Date().toLocaleDateString(), 
            text: reply, 
            replies:[] 
        });
        SillyTavern.getContext().saveSettingsDebounced(); 
        renderDiary();
        $('#ym_btn_ai_diary').prop('disabled', false).text('偷看TA的日记');
        toastr.success('偷看成功！TA写了一篇新日记。', '🌸 秘密');
    });
}

// 暴露全局函数供 HTML onclick 调用
window.yumeDeleteDiary = function(id) {
    if(!confirm('确定要撕掉这一页日记吗？')) return;
    const data = getCharData(); if(!data) return;
    data.diary = data.diary.filter(d => d.id !== id);
    SillyTavern.getContext().saveSettingsDebounced();
    renderDiary();
    updateProfileInjection();
};

window.yumeAddReply = function(id, author, isInitial = false) {
    const data = getCharData(); if(!data) return;
    const d = data.diary.find(x => x.id === id);
    if (!d) return;
    if (!d.replies) d.replies = [];

    // 用户评论
    if (author === 'user') {
        const text = $(`#ym_reply_input_${id}`).val().trim();
        if (!text) return toastr.warning('评论内容不能为空');
        d.replies.push({ author: 'user', text, date: new Date().toLocaleTimeString() });
        SillyTavern.getContext().saveSettingsDebounced();
        renderDiary();
        return;
    }

    // AI 评论
    if (author === 'ai') {
        const contextHistory = d.replies.map(r => `${r.author === 'user' ? '用户' : '你'}说: "${r.text}"`).join('\n');
        const task = `这是用户的一篇日记：\n"${d.text}"\n\n目前的评论区记录：\n${contextHistory}\n\n请你接着上面的对话，在评论区里新发一条留言。要求：\n1. 语气符合你的人设（亲密、调侃或温柔）。\n2. 针对上一条评论或日记正文回复，不要自言自语。`;
        
        const loadingId = Date.now();
        // 插入 Loading 占位符
        d.replies.push({ author: 'ai', text: '', isLoading: true, tempId: loadingId });
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

// ====== 7. 记忆注入 ======
function updateProfileInjection() {
    const data = getCharData(); if(!data) return;
    const context = SillyTavern.getContext();
    
    // 如果啥数据都没，就不注入
    if (!data.birthday && !data.periodStart && !data.vibe && data.diary.length === 0) return;

    const publicDiaries = data.diary.filter(d => d.author === 'user' && d.isPublic).slice(-2);
    const diaryText = publicDiaries.length ? `\n- 最近的日记心情：${publicDiaries.map(d => d.text).join('；')}` : '';

    const prompt = `[伴侣绝密档案：\n- 生日：${data.birthday || '未知'}\n- 生理期状态：${currentPeriodStatusText}\n- 今日心情：${data.vibe || '平静'} ${diaryText}\n请在日常对话中自然体现对上述信息的了解，并主动关怀。]`;

    // 注入到深度 4，不占用永久token
    context.setExtensionPrompt('yume_profile', prompt, 4, 4, false, 0);
}