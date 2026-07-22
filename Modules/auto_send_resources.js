// ══════════════════════════════════════════════════════
//  MODULE: AutoSendResources  (v2.0 - Balanceamento)
//
//  MODOS DE OPERACAO:
//  ─────────────────────────────────────────────────────
//  [balance]  Balanceamento global:
//             Calcula a media de cada recurso entre TODAS
//             as cidades. Cidades acima da media enviam o
//             excedente para cidades abaixo da media.
//             Gatilho extra: qualquer cidade que bater 90%
//             do armazem envia IMEDIATAMENTE para a cidade
//             com menor desenvolvimento (valvula de alivio).
//
//  [manual]   Destino FIXO escolhido pelo usuario.
//             Cidades que batem 90% de armazem enviam para
//             essa cidade escolhida. Mesma logica de antes,
//             agora com percentual de gatilho configuravel.
//
//  REGRAS GERAIS:
//  - Remetente precisa ter mercado ativo (nivel >= 1)
//  - Capacidade minima de 200 unidades de comercio
//  - Nunca envia se o destino ja tiver > 95% de armazem
//  - Margem de seguranca de 5% no destino (nao estoura)
// ══════════════════════════════════════════════════════
var AutoSendResources = class extends MultUtil {
    constructor(c, s) {
        super(c, s);
        this._active        = false;
        this._intervalId    = null;
        this._urgentQueue   = []; // cidades em 90%+ aguardando envio urgente

        this.mode                 = this.storage.load('asr_mode', 'balance');
        this.manualTargetId       = this.storage.load('asr_manual_target', null);
        this.checkIntervalMinutes = this.storage.load('asr_interval_min', 20);
        this.overflowThreshold    = this.storage.load('asr_overflow_pct', 90); // % do armazem
        this.sendThreshold        = this.storage.load('asr_send_pct', 60);     // excedente acima de X%

        if (this.storage.load('asr_active', false)) {
            setTimeout(() => this.start(), 2500);
        }
    }

    // ── Lista de tipos de construcao (para calculo de pontuacao) ──
    BUILDING_TYPES = [
        'main', 'storage', 'farm', 'academy', 'temple',
        'barracks', 'docks', 'market', 'hide',
        'lumber', 'stoner', 'ironer', 'wall'
    ];

    // ─────────────────────────────────────────────────────────────
    //  UI - Settings Panel
    // ─────────────────────────────────────────────────────────────
    settings = () => {
        requestAnimationFrame(() => {
            this._updateTitle();
            this._updateModeButtons();
        });
        return '' +
        '<div class="game_border" style="margin-bottom:20px;">' +
        '  <div class="game_border_top"></div><div class="game_border_bottom"></div>' +
        '  <div class="game_border_left"></div><div class="game_border_right"></div>' +
        '  <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>' +
        '  <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>' +
        this.getTitleHtml('asr_title', '⚖ Auto Envio de Recursos', this.toggle, '', this._active) +

        // Descricao do modo
        '  <div style="padding:5px 10px 2px;font-weight:bold;font-size:12px;">' +
        '    Balanceia recursos entre cidades e aciona envio urgente quando alguma cidade bater o limite de armazém.' +
        '  </div>' +

        // Seletor de modo
        '  <div style="padding:4px 10px;display:flex;gap:6px;align-items:center;">' +
        '    <span style="font-size:11px;font-weight:bold;">Modo:</span>' +
        this.getButtonHtml('asr_mode_balance', '⚖ Balancear', this.setMode, 'balance') +
        this.getButtonHtml('asr_mode_manual',  '📌 Manual',   this.setMode, 'manual') +
        '  </div>' +

        // Parametros globais
        '  <div style="padding:4px 10px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">' +

        '    <span style="font-size:11px;font-weight:bold;">Verificar a cada</span>' +
        '    <input id="asr_interval_input" type="number" min="1" max="1440" value="' + this.checkIntervalMinutes + '" style="width:50px;padding:2px 4px;" />' +
        '    <span style="font-size:11px;">min</span>' +

        '    <span style="font-size:11px;font-weight:bold;margin-left:8px;">Alarme armazém</span>' +
        '    <input id="asr_overflow_input" type="number" min="50" max="99" value="' + this.overflowThreshold + '" style="width:45px;padding:2px 4px;" />' +
        '    <span style="font-size:11px;">%</span>' +

        '    <span style="font-size:11px;font-weight:bold;margin-left:8px;">Enviar excedente ></span>' +
        '    <input id="asr_send_input" type="number" min="10" max="90" value="' + this.sendThreshold + '" style="width:45px;padding:2px 4px;" />' +
        '    <span style="font-size:11px;">%</span>' +

        this.getButtonHtml('asr_save_params_btn', '💾 Salvar', this._saveParams) +
        '  </div>' +
        '  <div id="asr_param_status" style="padding:0 10px 2px;font-size:11px;color:#5a3a0a;min-height:14px;"></div>' +

        // Controles do modo Manual
        '  <div id="asr_manual_controls" style="padding:4px 10px 6px;display:none;">' +
        '    <label style="font-size:11px;font-weight:bold;">🏙 Cidade Destino Fixa</label><br>' +
        '    <div style="display:flex;gap:6px;align-items:center;margin-top:3px;">' +
        '      <select id="asr_manual_target_select" style="flex:1;padding:3px;">' + this._getTownOptionsHtml() + '</select>' +
        this.getButtonHtml('asr_manual_save_btn', 'Salvar', this.saveManualTarget) +
        '    </div>' +
        '    <div id="asr_manual_target_status" style="font-size:11px;color:#5a3a0a;margin-top:3px;">' +
        (this.manualTargetId
            ? '✓ Destino: ' + (uw.ITowns.towns[this.manualTargetId] && uw.ITowns.towns[this.manualTargetId].getName
                ? uw.ITowns.towns[this.manualTargetId].getName()
                : '#' + this.manualTargetId)
            : 'Nenhum destino configurado.') +
        '    </div>' +
        '  </div>' +

        // Log
        '  <div id="asr_log" style="padding:3px 10px 8px;font-size:11px;color:#5a3a0a;min-height:32px;white-space:pre-line;"></div>' +
        '</div>';
    };

    // ─────────────────────────────────────────────────────────────
    //  Controles: start / stop / toggle
    // ─────────────────────────────────────────────────────────────
    toggle = () => {
        if (this._active) this.stop();
        else this.start();
    };

    start() {
        if (this._active) return;
        this._active = true;
        this.storage.save('asr_active', true);
        this._updateTitle();
        this.console.log('[AutoRecursos] Iniciado. Modo: ' + this.mode + ' | Intervalo: ' + this.checkIntervalMinutes + ' min | Alarme: ' + this.overflowThreshold + '%');
        this._tick();
        this._intervalId = this.createGuardedInterval(() => this._tick(), this.checkIntervalMinutes * 60 * 1000);
    }

    stop() {
        this._active = false;
        this.storage.save('asr_active', false);
        if (this._intervalId) { clearInterval(this._intervalId); this._intervalId = null; }
        this._updateTitle();
        this.console.log('[AutoRecursos] Parado.');
        this._setLog('⏹ Módulo parado.');
    }

    _updateTitle() {
        uw.$('#asr_title').css('filter', this._active
            ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    }

    // ─────────────────────────────────────────────────────────────
    //  Controles de UI
    // ─────────────────────────────────────────────────────────────
    setMode = (mode) => {
        this.mode = mode;
        this.storage.save('asr_mode', mode);
        this._updateModeButtons();
        this.console.log('[AutoRecursos] Modo: ' + mode);
    };

    _updateModeButtons() {
        if (this.mode === 'manual') {
            uw.$('#asr_mode_balance').addClass('disabled');
            uw.$('#asr_mode_manual').removeClass('disabled');
            uw.$('#asr_manual_controls').show();
        } else {
            uw.$('#asr_mode_manual').addClass('disabled');
            uw.$('#asr_mode_balance').removeClass('disabled');
            uw.$('#asr_manual_controls').hide();
        }
    }

    _saveParams = () => {
        const interval = parseInt(uw.$('#asr_interval_input').val(), 10);
        const overflow = parseInt(uw.$('#asr_overflow_input').val(), 10);
        const send     = parseInt(uw.$('#asr_send_input').val(), 10);

        if (!interval || interval < 1) {
            uw.$('#asr_param_status').text('✗ Intervalo inválido (mín. 1 min).').css('color', '#f87171');
            return;
        }
        if (!overflow || overflow < 50 || overflow > 99) {
            uw.$('#asr_param_status').text('✗ Alarme deve ser entre 50% e 99%.').css('color', '#f87171');
            return;
        }
        if (!send || send < 10 || send > 90) {
            uw.$('#asr_param_status').text('✗ Excedente deve ser entre 10% e 90%.').css('color', '#f87171');
            return;
        }

        this.checkIntervalMinutes = interval;
        this.overflowThreshold    = overflow;
        this.sendThreshold        = send;
        this.storage.save('asr_interval_min', interval);
        this.storage.save('asr_overflow_pct', overflow);
        this.storage.save('asr_send_pct',     send);

        uw.$('#asr_param_status').text('✓ Parâmetros salvos: ' + interval + ' min | alarme ' + overflow + '% | excedente >' + send + '%').css('color', '#1a6b2a');

        if (this._active) {
            if (this._intervalId) clearInterval(this._intervalId);
            this._intervalId = this.createGuardedInterval(() => this._tick(), this.checkIntervalMinutes * 60 * 1000);
        }
        this.console.log('[AutoRecursos] Parâmetros salvos: intervalo=' + interval + 'min, alarme=' + overflow + '%, excedente>' + send + '%');
    };

    saveManualTarget = () => {
        const id = uw.$('#asr_manual_target_select').val();
        if (!id) {
            uw.$('#asr_manual_target_status').text('Selecione uma cidade.').css('color', '#f87171');
            return;
        }
        this.manualTargetId = id;
        this.storage.save('asr_manual_target', id);
        const name = uw.ITowns.towns[id] && uw.ITowns.towns[id].getName ? uw.ITowns.towns[id].getName() : '#' + id;
        uw.$('#asr_manual_target_status').text('✓ Destino: ' + name).css('color', '#1a6b2a');
        this.console.log('[AutoRecursos] Destino manual: ' + name);
    };

    _getTownOptionsHtml() {
        try {
            const towns = uw.ITowns.towns;
            const keys  = Object.keys(towns);
            keys.sort((a, b) => {
                const nameA = towns[a].getName ? towns[a].getName() : '';
                const nameB = towns[b].getName ? towns[b].getName() : '';
                return nameA.localeCompare(nameB);
            });
            let html = '<option value="">Selecione...</option>';
            for (const id of keys) {
                const t    = towns[id];
                const name = t.getName ? t.getName() : ('#' + id);
                const sel  = (String(id) === String(this.manualTargetId)) ? ' selected' : '';
                html += '<option value="' + id + '"' + sel + '>' + name + '</option>';
            }
            return html;
        } catch (e) {
            return '<option value="">Erro ao carregar cidades</option>';
        }
    }

    _setLog(msg) {
        uw.$('#asr_log').text(msg);
    }

    // ─────────────────────────────────────────────────────────────
    //  TICK PRINCIPAL
    // ─────────────────────────────────────────────────────────────
    async _tick() {
        const townIds = Object.keys(uw.ITowns.towns);
        if (townIds.length < 2) return;

        this.console.log('[AutoRecursos] ── Tick (' + this.mode + ') ──');

        if (this.mode === 'manual') {
            await this._tickManual(townIds);
        } else {
            await this._tickBalance(townIds);
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  MODO BALANCEAMENTO
    //  Logica:
    //  1. Detecta cidades em 90%+ (urgente) → envia imediatamente
    //     para a cidade menos desenvolvida com espaco no armazem.
    //  2. Calcula a media de cada recurso entre todas as cidades.
    //  3. Cidades muito acima da media (> sendThreshold%) enviam
    //     o excedente para cidades abaixo da media.
    // ─────────────────────────────────────────────────────────────
    async _tickBalance(townIds) {
        const lines = [];

        // ── PASSO 1: Urgente (90%+) ──────────────────────────────
        const urgentSenders = townIds.filter(id => this._isOverflowing(id));
        if (urgentSenders.length > 0) {
            lines.push('🚨 ' + urgentSenders.length + ' cidade(s) com armazém em ' + this.overflowThreshold + '%+');
            this.console.log('[AutoRecursos] [URGENTE] ' + urgentSenders.length + ' cidade(s) em ' + this.overflowThreshold + '%+');

            // Destino: menos desenvolvida com espaco
            const devTargets = this._findLeastDevelopedTowns(townIds);
            for (const fromId of urgentSenders) {
                // Encontra o melhor destino (que nao seja o proprio remetente)
                const toId = devTargets.find(id => id !== fromId);
                if (!toId) continue;

                const fromName = this.getTownName(fromId);
                const toName   = this.getTownName(toId);
                this.console.log('[AutoRecursos] [URGENTE] ' + fromName + ' → ' + toName);

                const ok = await this._sendResources(fromId, toId, true);
                lines.push((ok ? '  ✓ ' : '  ✗ ') + fromName + ' → ' + toName);
            }
        }

        // ── PASSO 2: Calcular medias por recurso ──────────────────
        let totalW = 0, totalS = 0, totalI = 0;
        let validCount = 0;

        for (const id of townIds) {
            try {
                const res = uw.ITowns.towns[id].resources();
                totalW += res.wood;
                totalS += res.stone;
                totalI += res.iron;
                validCount++;
            } catch (e) {}
        }

        if (validCount < 2) return;

        const avgW = totalW / validCount;
        const avgS = totalS / validCount;
        const avgI = totalI / validCount;

        this.console.log('[AutoRecursos] Medias: 🪵' + Math.floor(avgW) + ' 🪨' + Math.floor(avgS) + ' ⚙' + Math.floor(avgI));

        // ── PASSO 3: Balancear remetentes → destinatarios ─────────
        // Remetentes: cidades com pelo menos 1 recurso muito acima da media
        // Destinatarios: cidades com todos os recursos abaixo da media
        const senders    = [];
        const receivers  = [];

        for (const id of townIds) {
            try {
                const town     = uw.ITowns.towns[id];
                const res      = town.resources();
                const storage  = res.storage;
                const sendPct  = this.sendThreshold / 100;

                const hasExcess = (
                    res.wood  > avgW * 1.15 && res.wood  > storage * sendPct ||
                    res.stone > avgS * 1.15 && res.stone > storage * sendPct ||
                    res.iron  > avgI * 1.15 && res.iron  > storage * sendPct
                );

                // Verifica se tem mercado disponivel
                const buildings = town.buildings().attributes;
                const hasMkt    = buildings.market && buildings.market >= 1;
                const hasCap    = town.getAvailableTradeCapacity() >= 200;

                if (hasExcess && hasMkt && hasCap) {
                    senders.push(id);
                } else {
                    // Destinatario: tem espaco e esta abaixo da media em pelo menos 1 recurso
                    const roomLeft = (storage - res.wood) + (storage - res.stone) + (storage - res.iron);
                    const needsRes = res.wood < avgW || res.stone < avgS || res.iron < avgI;
                    if (roomLeft > 200 && needsRes && !this._isAlmostFull(id)) {
                        receivers.push({ id, score: this._getDevelopmentScore(town) });
                    }
                }
            } catch (e) {}
        }

        // Ordena destinatarios pelo menos desenvolvidos primeiro
        receivers.sort((a, b) => a.score - b.score);

        if (senders.length === 0) {
            const noMsg = urgentSenders.length === 0
                ? 'Recursos equilibrados entre todas as cidades.'
                : '';
            if (noMsg) { lines.push('⚖ ' + noMsg); }
            this._setLog(lines.join('\n'));
            return;
        }

        lines.push('⚖ Balanceando: ' + senders.length + ' remetente(s) → ' + receivers.length + ' destino(s)');
        this.console.log('[AutoRecursos] ' + senders.length + ' remetente(s) / ' + receivers.length + ' destino(s)');

        if (receivers.length === 0) {
            lines.push('Sem destinos disponíveis para balancear.');
            this._setLog(lines.join('\n'));
            return;
        }

        // Cada remetente envia para um destino (rotativo pelos menos desenvolvidos)
        const balanceResults = await Promise.allSettled(
            senders.map((fromId, i) => {
                const toId = receivers[i % receivers.length].id;
                return this._sendResources(fromId, toId, false).then(ok => {
                    return { fromId, toId, ok };
                });
            })
        );

        let sentCount = 0;
        for (const r of balanceResults) {
            if (r.status === 'fulfilled' && r.value) {
                if (r.value.ok) sentCount++;
                const fName = this.getTownName(r.value.fromId);
                const tName = this.getTownName(r.value.toId);
                lines.push('  ' + (r.value.ok ? '✓' : '✗') + ' ' + fName + ' → ' + tName);
            }
        }

        const summary = sentCount > 0
            ? '✓ ' + sentCount + ' envio(s) realizados com sucesso.'
            : 'Nenhum envio concluído (sem excedente real ou destinos cheios).';
        lines.push(summary);
        this.console.log('[AutoRecursos] ' + summary);
        this._setLog(lines.join('\n'));
    }

    // ─────────────────────────────────────────────────────────────
    //  MODO MANUAL
    //  Destino fixo. Gatilho: cidade atinge overflowThreshold%.
    // ─────────────────────────────────────────────────────────────
    async _tickManual(townIds) {
        if (!this.manualTargetId) {
            this._setLog('⚠ Configure uma cidade destino no modo manual.');
            return;
        }

        const targetTown = uw.ITowns.towns[this.manualTargetId];
        if (!targetTown) {
            this._setLog('✗ Cidade destino não encontrada.');
            return;
        }

        const senders = townIds.filter(id => id !== this.manualTargetId && this._isOverflowing(id));
        if (!senders.length) {
            const msg = 'Nenhuma cidade em ' + this.overflowThreshold + '%+ de armazém.';
            this.console.log('[AutoRecursos] [Manual] ' + msg);
            this._setLog(msg);
            return;
        }

        const targetName = targetTown.getName();
        this.console.log('[AutoRecursos] [Manual] ' + senders.length + ' cidade(s) enviando para ' + targetName);

        const results = await Promise.allSettled(
            senders.map(fromId => this._sendResources(fromId, this.manualTargetId, true))
        );

        const totalSent = results.filter(r => r.status === 'fulfilled' && r.value).length;
        const msg = totalSent > 0
            ? '✓ ' + totalSent + ' cidade(s) enviaram para ' + targetName
            : 'Nenhum envio concluído (' + targetName + ' sem espaço?).';
        this.console.log('[AutoRecursos] [Manual] ' + msg);
        this._setLog(msg);
    }

    // ─────────────────────────────────────────────────────────────
    //  HELPERS de Estado
    // ─────────────────────────────────────────────────────────────

    // Verdadeiro se algum recurso atingiu o threshold de alarme (padrão 90%)
    _isOverflowing(townId) {
        try {
            const res       = uw.ITowns.towns[townId].resources();
            const threshold = res.storage * (this.overflowThreshold / 100);
            return res.wood >= threshold || res.stone >= threshold || res.iron >= threshold;
        } catch (e) {
            return false;
        }
    }

    // Verdadeiro se a cidade esta quase cheia (>= 95%) — exclui de ser destino
    _isAlmostFull(townId) {
        try {
            const res  = uw.ITowns.towns[townId].resources();
            const cap  = res.storage * 0.95;
            return res.wood >= cap && res.stone >= cap && res.iron >= cap;
        } catch (e) {
            return true;
        }
    }

    // Pontuacao de desenvolvimento (soma de niveis de construcao)
    _getDevelopmentScore(town) {
        try {
            const buildings = town.buildings().attributes;
            let sum = 0;
            for (const key of this.BUILDING_TYPES) {
                const v = buildings[key];
                if (typeof v === 'number') sum += v;
            }
            return sum;
        } catch (e) {
            return Infinity;
        }
    }

    // Lista de cidades candidatas a destino, ordenadas da MENOS desenvolvida
    // para a mais, filtrando as que estao quase cheias (>= 95% do armazem).
    _findLeastDevelopedTowns(townIds) {
        const candidates = [];
        for (const id of townIds) {
            try {
                const town   = uw.ITowns.towns[id];
                const res    = town.resources();
                const room   = (res.storage - res.wood) + (res.storage - res.stone) + (res.storage - res.iron);
                if (room < 150) continue;
                if (this._isAlmostFull(id)) continue;
                candidates.push({ id, score: this._getDevelopmentScore(town) });
            } catch (e) {}
        }
        candidates.sort((a, b) => a.score - b.score);
        return candidates.map(c => c.id);
    }

    // ─────────────────────────────────────────────────────────────
    //  ENVIO DE RECURSOS
    //  urgent=true  → envia TODO o excedente acima de 5% (modo urgente)
    //  urgent=false → envia excedente acima de sendThreshold% (balancear)
    // ─────────────────────────────────────────────────────────────
    _sendResources = async (fromId, toId, urgent) => {
        try {
            const from    = uw.ITowns.towns[fromId];
            const to      = uw.ITowns.towns[toId];
            const fromRes = from.resources();
            const toRes   = to.resources();
            const cap     = from.getAvailableTradeCapacity();

            if (cap < 100) return false;

            // Limite inferior para o remetente
            const keepPct  = urgent ? 0.05 : (this.sendThreshold / 100);
            const keepAmt  = fromRes.storage * keepPct;

            const excessW = Math.max(0, Math.floor(fromRes.wood  - keepAmt));
            const excessS = Math.max(0, Math.floor(fromRes.stone - keepAmt));
            const excessI = Math.max(0, Math.floor(fromRes.iron  - keepAmt));

            // Espaco livre no destino (margem de seguranca de 5%)
            const safe  = toRes.storage * 0.05;
            const roomW = Math.max(0, Math.floor(toRes.storage - toRes.wood  - safe));
            const roomS = Math.max(0, Math.floor(toRes.storage - toRes.stone - safe));
            const roomI = Math.max(0, Math.floor(toRes.storage - toRes.iron  - safe));

            // Distribui a capacidade de comercio igualmente entre os 3 recursos
            const perRes = Math.floor(cap / 3);
            const wood   = Math.min(perRes, excessW, roomW);
            const stone  = Math.min(perRes, excessS, roomS);
            const iron   = Math.min(perRes, excessI, roomI);
            const total  = wood + stone + iron;

            if (total < 50) return false;

            const fromName = from.getName ? from.getName() : ('#' + fromId);
            const toName   = to.getName   ? to.getName()   : ('#' + toId);

            this.console.log('[AutoRecursos] ' + (urgent ? '[URGENTE] ' : '') +
                fromName + ' → ' + toName + ': ' +
                '🪵' + wood + ' 🪨' + stone + ' ⚙' + iron);

            const data = {
                id:       parseInt(toId),
                wood:     wood,
                stone:    stone,
                iron:     iron,
                town_id:  parseInt(fromId),
                nl_init:  true
            };

            const res = await this.ajaxPostWithTimeout('town_info', 'trade', data, 15000, true);
            if (res && !res.error) return true;

            this.console.log('[AutoRecursos] ✗ Erro trade: ' + (res && res.error ? res.error : JSON.stringify(res)));
            return false;
        } catch (e) {
            this.console.log('[AutoRecursos] Exceção: ' + (e && e.message ? e.message : e));
            return false;
        }
    };
};
