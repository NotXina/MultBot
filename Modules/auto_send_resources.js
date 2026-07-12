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

        if (this.storage.load('asr_active', false)) {
            setTimeout(() => this.start(), 2500);
        }
    }

    settings = () => {
        requestAnimationFrame(() => this._updateTitle());
        return `
        <div class="game_border" style="margin-bottom:20px;">
            <div class="game_border_top"></div><div class="game_border_bottom"></div>
            <div class="game_border_left"></div><div class="game_border_right"></div>
            <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>
            <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>
            ${this.getTitleHtml('asr_title', 'Auto Envio de Recursos', this.toggle, '', this._active)}
            <div style="padding:5px 10px;font-weight:bold;">
                Envia recursos de cidades ociosas para a cidade menos desenvolvida (com espaço no armazém). Verifica a cada 30 min.
            </div>
            <div style="padding:2px 10px 4px;font-size:11px;color:#5a3a0a;">
                Remetente: pop &lt; 200 + AutoBuild concluído + recurso &gt; 50% storage. Destino: menor soma de níveis de construção, com margem de 5% de espaço livre no armazém.
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
        this.console.log('[AutoRecursos] Iniciado. Intervalo: 30 min.');
        this._tick();
        this._intervalId = this.createGuardedInterval(() => this._tick(), 30 * 60 * 1000);
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

    async _tick() {
        this.console.log('[AutoRecursos] Verificando cidades...');

        const townIds = Object.keys(uw.ITowns.towns);
        if (townIds.length < 2) return;

        const target = this._findLeastDevelopedTown(townIds);
        if (!target) return;

        const targetName = uw.ITowns.towns[target].getName();
        this.console.log(`[AutoRecursos] Destino (menos desenvolvida, com espaço no armazém): ${targetName}`);

        const senders = townIds.filter(id => id !== target && this._isEligibleSender(id));
        if (!senders.length) {
            this.console.log('[AutoRecursos] Nenhuma cidade elegível para envio.');
            uw.$('#asr_log').text('Nenhuma cidade elegível para envio.');
            return;
        }

        // Envia em paralelo — sem await sequencial
        const results = await Promise.allSettled(
            senders.map(fromId => this._sendResources(fromId, target))
        );

        const totalSent = results.filter(r => r.status === 'fulfilled' && r.value).length;
        const msg = totalSent > 0
            ? `✓ Recursos enviados de ${totalSent} cidade(s) → ${targetName}`
            : 'Nenhuma cidade elegível para envio.';
        this.console.log('[AutoRecursos] ' + msg);
        uw.$('#asr_log').text(msg);
    }

    // Soma dos niveis de todas as construcoes de uma cidade - usado
    // como indicador de "quao desenvolvida" ela e (uma cidade nova/
    // recem-fundada tem essa soma bem menor que uma ja consolidada).
    _getDevelopmentScore(town) {
        try {
            const buildings = town.buildings().attributes;
            let sum = 0;
            for (const key in buildings) {
                if (typeof buildings[key] === 'number') sum += buildings[key];
            }
            return sum;
        } catch (e) {
            return Infinity; // erro ao ler -> nunca escolhe essa cidade como alvo
        }
    }

    // Cidade MENOS DESENVOLVIDA (menor soma de niveis de construcao)
    // entre as que ainda tem espaco de sobra no armazem - cidades com
    // o armazem praticamente cheio sao ignoradas aqui, pra nao virar
    // alvo de um envio que so vai desperdicar recurso estourando.
    _findLeastDevelopedTown(townIds) {
        let bestId    = null;
        let bestScore = Infinity;

        for (const id of townIds) {
            try {
                const town = uw.ITowns.towns[id];
                const res  = town.resources();

                // Espaco livre total (soma dos 3 recursos) - se sobrar
                // pouco, nem vale considerar essa cidade como destino.
                const roomLeft = (res.storage - res.wood) + (res.storage - res.stone) + (res.storage - res.iron);
                if (roomLeft < 300) continue;

                const score = this._getDevelopmentScore(town);
                if (score < bestScore) { bestScore = score; bestId = id; }
            } catch(e) {}
        }
        return bestId;
    }

    // Verifica se a cidade pode enviar recursos
    _isEligibleSender(townId) {
        try {
            const town      = uw.ITowns.towns[townId];
            const buildings = town.buildings().attributes;
            const res       = town.resources();

            // 1. Pop disponível < 200
            if (town.getAvailablePopulation() >= 200) return false;

            // 2. AutoBuild done — fila de construção vazia
            if ((town.buildingOrders?.()?.length ?? 0) > 0) return false;

            // 3. Mercado ativo com capacidade > 500
            if (!buildings.market || buildings.market < 1) return false;
            if (town.getAvailableTradeCapacity() < 500) return false;

            // 4. Pelo menos um recurso acima de 50% do storage
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
