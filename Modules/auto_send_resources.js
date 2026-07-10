// ══════════════════════════════════════════════════════
//  MODULE: AutoSendResources
//  Condições para enviar da cidade X para cidade Y:
//  - Cidade X: pop < 200, festa + teatro em curso, mercado ativo,
//    não pode fazer festa/teatro
//  - Cidade Y: cidade do jogador com menor % storage
//  Envia o máximo balanceado via town_info/trade
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
                Envia recursos de cidades ociosas para a cidade com menor % de storage. Verifica a cada 30 min.
            </div>
            <div style="padding:2px 10px 4px;font-size:11px;color:#5a3a0a;">
                Condição para enviar: pop &lt; 200 + AutoBuild concluído + recurso &gt; 50% storage.
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
        this._intervalId = setInterval(() => this._tick(), 30 * 60 * 1000);
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

        const target = this._findPoorestTown(townIds);
        if (!target) return;

        const targetName = uw.ITowns.towns[target].getName();
        this.console.log(`[AutoRecursos] Destino: ${targetName}`);

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

    // Cidade com menor % de storage (wood+stone+iron / storage*3)
    _findPoorestTown(townIds) {
        let bestId  = null;
        let bestPct = Infinity;

        for (const id of townIds) {
            try {
                const town = uw.ITowns.towns[id];
                const res  = town.resources();
                const pct  = (res.wood + res.stone + res.iron) / (res.storage * 3);
                if (pct < bestPct) { bestPct = pct; bestId = id; }
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

    // Envia o excedente acima de 50% do storage para a cidade destino
    _sendResources(fromId, toId) {
        return new Promise(resolve => {
            try {
                const from     = uw.ITowns.towns[fromId];
                const fromRes  = from.resources();
                const capacity = from.getAvailableTradeCapacity();

                if (capacity < 100) { resolve(false); return; }

                const threshold = fromRes.storage * 0.5;
                const excessW = Math.max(0, Math.floor(fromRes.wood  - threshold));
                const excessS = Math.max(0, Math.floor(fromRes.stone - threshold));
                const excessI = Math.max(0, Math.floor(fromRes.iron  - threshold));

                const perRes = Math.floor(capacity / 3);
                const wood   = Math.min(perRes, excessW);
                const stone  = Math.min(perRes, excessS);
                const iron   = Math.min(perRes, excessI);
                const total  = wood + stone + iron;

                if (total < 100) { resolve(false); return; }

                const fromName = from.getName();
                const toName   = uw.ITowns.towns[toId]?.getName?.() ?? '#' + toId;
                const data = { id: parseInt(toId), wood, stone, iron, town_id: parseInt(fromId), nl_init: true };

                this.console.log(`[AutoRecursos] ${fromName} → ${toName}: ${wood}🪵 ${stone}🪨 ${iron}⚙`);

                // Timeout de 15s — evita Promise pendente para sempre
                const timer = setTimeout(() => {
                    this.console.log(`[AutoRecursos] ✗ ${fromName}: timeout`);
                    resolve(false);
                }, 15000);

                uw.gpAjax.ajaxPost('town_info', 'trade', data, true,
                    res => {
                        clearTimeout(timer);
                        if (res && !res.error) {
                            resolve(true);
                        } else {
                            this.console.log(`[AutoRecursos] ✗ Erro trade: ${res?.error ?? JSON.stringify(res)}`);
                            resolve(false);
                        }
                    },
                    () => { clearTimeout(timer); resolve(false); }
                );
            } catch(e) {
                this.console.log('[AutoRecursos] Exceção: ' + e?.message);
                resolve(false);
            }
        });
    }
};
