// ══════════════════════════════════════════════════════
//  MODULE: AutoSendResources
//  Condições para enviar da cidade X para cidade Y:
//  - Cidade X (remetente): pop < 200, sem construção em fila,
//    mercado ativo, recurso acima de 50% do storage
//  - Cidade Y (destino): cidade do jogador com MENOR soma de
//    níveis de construção (proxy de "menos desenvolvida"),
//    entre as que ainda têm espaço de sobra no armazém
//  Envia o excedente do remetente, mas nunca mais do que o
//  espaço livre no armazém do destino (margem de 5%) - evita
//  desperdiçar recurso que "estoura" o armazém de lá.
// ══════════════════════════════════════════════════════
var AutoSendResources = class extends MultUtil {
    constructor(c, s) {
        super(c, s);
        this._active     = false;
        this._intervalId = null;
        this._lastRun    = null;
        this.mode                = this.storage.load('asr_mode', 'auto'); // 'auto' | 'manual'
        this.manualTargetId      = this.storage.load('asr_manual_target', null);
        this.checkIntervalMinutes = this.storage.load('asr_interval_min', 30);

        if (this.storage.load('asr_active', false)) {
            setTimeout(() => this.start(), 2500);
        }
    }

    settings = () => {
        requestAnimationFrame(() => {
            this._updateTitle();
            this._updateModeButtons();
        });
        return `
        <div class="game_border" style="margin-bottom:20px;">
            <div class="game_border_top"></div><div class="game_border_bottom"></div>
            <div class="game_border_left"></div><div class="game_border_right"></div>
            <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>
            <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>
            ${this.getTitleHtml('asr_title', 'Auto Envio de Recursos', this.toggle, '', this._active)}
            <div style="padding:5px 10px;font-weight:bold;">
                Envia recursos de cidades ociosas para a cidade menos desenvolvida (com espaço no armazém).
            </div>
            <div style="padding:2px 10px 4px;font-size:11px;color:#5a3a0a;">
                Remetente: qualquer cidade com mercado disponível e algum recurso acima de 50% do storage (não precisa estar ociosa). Destino: menor soma de níveis de construção, com margem de 5% de espaço livre no armazém.
            </div>

            <div style="padding:4px 10px;display:flex;gap:6px;align-items:center;">
                <label style="font-size:11px;font-weight:bold;">Verificar a cada</label>
                <input id="asr_interval_input" type="number" min="1" max="1440" value="${this.checkIntervalMinutes}" style="width:55px;padding:2px 5px;" />
                <span style="font-size:11px;">min</span>
                ${this.getButtonHtml('asr_interval_save_btn', 'Salvar', this.saveInterval)}
                <span id="asr_interval_status" style="font-size:11px;color:#5a3a0a;"></span>
            </div>

            <div style="padding:4px 10px;display:flex;gap:6px;">
                ${this.getButtonHtml('asr_mode_auto', 'Automático', this.setMode, 'auto')}
                ${this.getButtonHtml('asr_mode_manual', 'Manual (90%)', this.setMode, 'manual')}
            </div>

            <div id="asr_manual_controls" style="padding:4px 10px;display:none;">
                <label style="font-size:11px;font-weight:bold;">Cidade Destino (envia quando alguma cidade atingir 90% de armazém)</label><br>
                <div style="display:flex;gap:6px;align-items:center;margin-top:3px;">
                    <select id="asr_manual_target_select" style="flex:1;padding:3px;">
                        ${this._getTownOptionsHtml()}
                    </select>
                    ${this.getButtonHtml('asr_manual_save_btn', 'Salvar', this.saveManualTarget)}
                </div>
                <div id="asr_manual_target_status" style="font-size:11px;color:#5a3a0a;margin-top:3px;">
                    ${this.manualTargetId ? '✓ Destino atual: ' + (uw.ITowns.towns[this.manualTargetId]?.getName?.() ?? '#' + this.manualTargetId) : 'Nenhum destino configurado.'}
                </div>
            </div>

            <div id="asr_log" style="padding:2px 10px 8px;font-size:11px;color:#5a3a0a;min-height:16px;"></div>
        </div>`;
    };

    toggle = () => {
        if (this._active) this.stop();
        else this.start();
    };

    start() {
        if (this._active) return;
        this._active = true;
        this.storage.save('asr_active', true);
        this._updateTitle();
        this.console.log('[AutoRecursos] Iniciado. Intervalo: ' + this.checkIntervalMinutes + ' min.');
        this._tick();
        this._intervalId = this.createGuardedInterval(() => this._tick(), this.checkIntervalMinutes * 60 * 1000);
    }

    stop() {
        this._active = false;
        this.storage.save('asr_active', false);
        if (this._intervalId) { clearInterval(this._intervalId); this._intervalId = null; }
        this._updateTitle();
        this.console.log('[AutoRecursos] Parado.');
    }

    _updateTitle() {
        uw.$('#asr_title').css('filter', this._active
            ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    }

    setMode = (mode) => {
        this.mode = mode;
        this.storage.save('asr_mode', mode);
        this._updateModeButtons();
        this.console.log('[AutoRecursos] Modo alterado para: ' + (mode === 'manual' ? 'Manual (90%)' : 'Automático'));
    };

    // Salva o intervalo de verificação (em minutos) e, se o módulo já
    // estiver ativo, reinicia o ciclo na hora com o novo valor - não
    // precisa desligar e ligar de novo pra a mudança valer.
    saveInterval = () => {
        const val = parseInt(uw.$('#asr_interval_input').val(), 10);
        if (!val || val < 1) {
            uw.$('#asr_interval_status').text('Intervalo inválido (mínimo 1 min).').css('color', '#f87171');
            return;
        }

        this.checkIntervalMinutes = val;
        this.storage.save('asr_interval_min', val);
        uw.$('#asr_interval_status').text('✓ Intervalo salvo: ' + val + ' min.').css('color', '#1a6b2a');
        this.console.log('[AutoRecursos] Intervalo alterado para ' + val + ' min.');

        if (this._active) {
            if (this._intervalId) clearInterval(this._intervalId);
            this._intervalId = this.createGuardedInterval(() => this._tick(), this.checkIntervalMinutes * 60 * 1000);
        }
    };

    _updateModeButtons() {
        if (this.mode === 'manual') {
            uw.$('#asr_mode_auto').addClass('disabled');
            uw.$('#asr_mode_manual').removeClass('disabled');
            uw.$('#asr_manual_controls').show();
        } else {
            uw.$('#asr_mode_manual').addClass('disabled');
            uw.$('#asr_mode_auto').removeClass('disabled');
            uw.$('#asr_manual_controls').hide();
        }
    }

    saveManualTarget = () => {
        const id = uw.$('#asr_manual_target_select').val();
        if (!id) {
            uw.$('#asr_manual_target_status').text('Selecione uma cidade.').css('color', '#f87171');
            return;
        }
        this.manualTargetId = id;
        this.storage.save('asr_manual_target', id);
        const name = uw.ITowns.towns[id]?.getName?.() ?? '#' + id;
        uw.$('#asr_manual_target_status').text('✓ Destino atual: ' + name).css('color', '#1a6b2a');
        this.console.log('[AutoRecursos] Destino manual salvo: ' + name);
    };

    _getTownOptionsHtml() {
        try {
            const towns = uw.ITowns.towns;
            const keys = Object.keys(towns);
            keys.sort((a, b) => {
                const nameA = towns[a].getName ? towns[a].getName() : '';
                const nameB = towns[b].getName ? towns[b].getName() : '';
                return nameA.localeCompare(nameB);
            });
            let html = '<option value="">Selecione...</option>';
            for (const id of keys) {
                const t = towns[id];
                const name = t.getName ? t.getName() : ('#' + id);
                const selected = (String(id) === String(this.manualTargetId)) ? ' selected' : '';
                html += '<option value="' + id + '"' + selected + '>' + name + ' (#' + id + ')</option>';
            }
            return html;
        } catch (e) {
            return '<option value="">Erro ao carregar cidades</option>';
        }
    }

    async _tick() {
        this.console.log('[AutoRecursos] Verificando cidades...');

        const townIds = Object.keys(uw.ITowns.towns);
        if (townIds.length < 2) return;

        if (this.mode === 'manual') {
            await this._tickManual(townIds);
            return;
        }

        // Lista de cidades carentes (menos desenvolvidas primeiro), nao
        // so a mais pobre - assim varias cidades sao ajudadas no mesmo
        // ciclo, em vez de uma por vez.
        const targets = this._findLeastDevelopedTowns(townIds);
        if (targets.length === 0) return;

        const targetNames = targets.map(id => uw.ITowns.towns[id].getName()).join(', ');
        this.console.log(`[AutoRecursos] Destinos (menos desenvolvidas primeiro, com espaço no armazém): ${targetNames}`);

        const senders = townIds.filter(id => !targets.includes(id) && this._isEligibleSender(id));
        if (!senders.length) {
            this.console.log('[AutoRecursos] Nenhuma cidade elegível para envio.');
            uw.$('#asr_log').text('Nenhuma cidade elegível para envio.');
            return;
        }

        // Cada remetente manda pra um destino diferente, girando pela
        // lista de carentes - as mais pobres aparecem primeiro e recebem
        // prioridade quando ha mais remetentes do que destinos.
        const results = await Promise.allSettled(
            senders.map((fromId, i) => this._sendResources(fromId, targets[i % targets.length]))
        );

        const totalSent = results.filter(r => r.status === 'fulfilled' && r.value).length;
        const msg = totalSent > 0
            ? `✓ Recursos enviados de ${totalSent} cidade(s) para ${targets.length} destino(s)`
            : 'Nenhuma cidade elegível para envio.';
        this.console.log('[AutoRecursos] ' + msg);
        uw.$('#asr_log').text(msg);
    }

    /* Modo manual: destino FIXO escolhido por voce. Diferente do modo
       automatico, aqui NAO checa pop/fila de construcao/mercado - o
       unico gatilho e "algum recurso bateu 90% do armazem". E uma
       valvula de seguranca contra desperdicio por armazem cheio, nao
       um balanceamento entre cidades. */
    async _tickManual(townIds) {
        if (!this.manualTargetId) {
            this.console.log('[AutoRecursos] Modo manual: nenhuma cidade destino configurada ainda.');
            uw.$('#asr_log').text('Configure uma cidade destino no modo manual.').css('color', '#f87171');
            return;
        }

        const targetTown = uw.ITowns.towns[this.manualTargetId];
        if (!targetTown) {
            this.console.log('[AutoRecursos] Modo manual: cidade destino #' + this.manualTargetId + ' não encontrada (saiu do cache ou não é mais sua).');
            uw.$('#asr_log').text('Cidade destino não encontrada.').css('color', '#f87171');
            return;
        }
        const targetName = targetTown.getName();

        const senders = townIds.filter(id => id !== this.manualTargetId && this._isOverflowing(id));
        if (!senders.length) {
            this.console.log('[AutoRecursos] Modo manual: nenhuma cidade em 90%+ de armazém no momento.');
            uw.$('#asr_log').text('Nenhuma cidade em 90%+ de armazém no momento.');
            return;
        }

        this.console.log(`[AutoRecursos] Modo manual: ${senders.length} cidade(s) em 90%+ de armazém, enviando para ${targetName}...`);

        const results = await Promise.allSettled(
            senders.map(fromId => this._sendResources(fromId, this.manualTargetId))
        );

        const totalSent = results.filter(r => r.status === 'fulfilled' && r.value).length;
        const msg = totalSent > 0
            ? `✓ Recursos enviados de ${totalSent} cidade(s) → ${targetName}`
            : 'Nenhum envio concluído (destino sem espaço ou remetentes sem excedente).';
        this.console.log('[AutoRecursos] ' + msg);
        uw.$('#asr_log').text(msg);
    }

    // Verdadeiro se algum recurso da cidade estiver em 90% ou mais do
    // armazem - o gatilho do modo manual.
    _isOverflowing(townId) {
        try {
            const town = uw.ITowns.towns[townId];
            const res  = town.resources();
            const threshold = res.storage * 0.9;
            return res.wood >= threshold || res.stone >= threshold || res.iron >= threshold;
        } catch (e) {
            return false;
        }
    }

    // Soma dos niveis de todas as construcoes de uma cidade - usado
    // como indicador de "quao desenvolvida" ela e (uma cidade nova/
    // recem-fundada tem essa soma bem menor que uma ja consolidada).
    // Lista de construcoes de verdade (mesma do auto_build.js) - usada
    // pra filtrar SOMENTE niveis de construcao, ignorando outros campos
    // numericos que existem em buildings().attributes (id, town_id,
    // timestamps de atualizacao, etc) que iriam corromper a soma se
    // entrassem no calculo (um timestamp e um numero gigante e sozinho
    // ja dominaria a pontuacao inteira).
    BUILDING_TYPES = ['main', 'storage', 'farm', 'academy', 'temple', 'barracks', 'docks', 'market', 'hide', 'lumber', 'stoner', 'ironer', 'wall'];

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
            return Infinity; // erro ao ler -> nunca escolhe essa cidade como alvo
        }
    }

    // Lista de cidades candidatas a destino, ordenada da MENOS
    // DESENVOLVIDA (menor soma de niveis de construcao) pra mais -
    // entre as que ainda tem espaco de sobra no armazem. Cidades com
    // o armazem praticamente cheio sao excluidas aqui, pra nao virar
    // alvo de um envio que so vai desperdicar recurso estourando.
    _findLeastDevelopedTowns(townIds) {
        const candidates = [];

        for (const id of townIds) {
            try {
                const town = uw.ITowns.towns[id];
                const res  = town.resources();

                // Espaco livre total (soma dos 3 recursos) - se sobrar
                // pouco, nem vale considerar essa cidade como destino.
                const roomLeft = (res.storage - res.wood) + (res.storage - res.stone) + (res.storage - res.iron);
                if (roomLeft < 300) continue;

                const score = this._getDevelopmentScore(town);
                candidates.push({ id, score });
            } catch(e) {}
        }

        candidates.sort((a, b) => a.score - b.score);
        return candidates.map(c => c.id);
    }

    // Verifica se a cidade pode enviar recursos
    /* IMPORTANTE: nao exige mais que a cidade esteja "ociosa" (pop
       livre baixa + fila de construcao vazia) - essa exigencia
       excluia exatamente as cidades desenvolvidas/ativas, que sao
       as que mais acumulam recurso parado (sempre construindo ou
       recrutando, mas com excedente de sobra). Manda o excedente
       de QUALQUER cidade com mercado disponivel, esteja ela ociosa
       ou nao - tirar o excedente (acima de 50%) nao atrapalha nada
       que ja esta em andamento. */
    _isEligibleSender(townId) {
        try {
            const town      = uw.ITowns.towns[townId];
            const buildings = town.buildings().attributes;
            const res       = town.resources();

            // Mercado ativo com capacidade > 500
            if (!buildings.market || buildings.market < 1) return false;
            if (town.getAvailableTradeCapacity() < 500) return false;

            // Pelo menos um recurso acima de 50% do storage
            const threshold = res.storage * 0.5;
            const hasExcess = res.wood > threshold || res.stone > threshold || res.iron > threshold;
            if (!hasExcess) return false;

            return true;
        } catch(e) { return false; }
    }

    // Envia o excedente acima de 50% do storage do remetente, mas
    // NUNCA mais do que o espaço livre no armazém do destino - deixa
    // uma margem de segurança de 5% no destino, pra sobrar espaço
    // mesmo com a produção normal da cidade entre o envio e a chegada.
    _sendResources = async (fromId, toId) => {
        try {
            const from     = uw.ITowns.towns[fromId];
            const to       = uw.ITowns.towns[toId];
            const fromRes  = from.resources();
            const toRes    = to.resources();
            const capacity = from.getAvailableTradeCapacity();

            if (capacity < 100) return false;

            const threshold = fromRes.storage * 0.5;
            const excessW = Math.max(0, Math.floor(fromRes.wood  - threshold));
            const excessS = Math.max(0, Math.floor(fromRes.stone - threshold));
            const excessI = Math.max(0, Math.floor(fromRes.iron  - threshold));

            // Espaço livre no destino, por recurso, com margem de 5%
            const safetyMargin = toRes.storage * 0.05;
            const roomW = Math.max(0, Math.floor(toRes.storage - toRes.wood  - safetyMargin));
            const roomS = Math.max(0, Math.floor(toRes.storage - toRes.stone - safetyMargin));
            const roomI = Math.max(0, Math.floor(toRes.storage - toRes.iron  - safetyMargin));

            const perRes = Math.floor(capacity / 3);
            const wood   = Math.min(perRes, excessW, roomW);
            const stone  = Math.min(perRes, excessS, roomS);
            const iron   = Math.min(perRes, excessI, roomI);
            const total  = wood + stone + iron;

            if (total < 100) return false;

            const fromName = from.getName();
            const toName   = to?.getName?.() ?? '#' + toId;
            const data = { id: parseInt(toId), wood, stone, iron, town_id: parseInt(fromId), nl_init: true };

            this.console.log(`[AutoRecursos] ${fromName} → ${toName}: ${wood}🪵 ${stone}🪨 ${iron}⚙`);

            const res = await this.ajaxPostWithTimeout('town_info', 'trade', data, 15000, true);
            if (res && !res.error) return true;

            this.console.log(`[AutoRecursos] ✗ Erro trade: ${res?.error ?? JSON.stringify(res)}`);
            return false;
        } catch (e) {
            this.console.log('[AutoRecursos] Exceção: ' + (e?.message ?? e));
            return false;
        }
    };
};
