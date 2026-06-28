// ══════════════════════════════════════════════════════
//  MODULE: AutoMilitia
//  Ativa milícia automaticamente em cidades com ataque
//  entrante. Endpoint: building_farm / request_militia
//  Payload exato do Noct AutoMilitia.
// ══════════════════════════════════════════════════════
class AutoMilitia extends ModernUtil {
    constructor(c, s) {
        super(c, s);

        this._active        = false;
        this._intervalId    = null;
        this._processed     = new Set(); // cidades já processadas neste ciclo de ataques

        if (this.storage.load('militia_active', false)) {
            setTimeout(() => this.start(), 2000);
        }
    }

    settings = () => {
        requestAnimationFrame(() => this._updateButtons());
        return `
        <div class="game_border" style="margin-bottom:20px;">
            <div class="game_border_top"></div><div class="game_border_bottom"></div>
            <div class="game_border_left"></div><div class="game_border_right"></div>
            <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>
            <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>
            <div class="game_header bold" style="position:relative;">
                <span style="z-index:10;position:relative;">Auto Milícia</span>
                <span class="command_count"></span>
            </div>
            <div id="autoparty_types">
                <div style="padding:5px 8px;font-size:11px;color:#7a5c2a;line-height:1.6;">
                    Detecta ataques entrantes e ativa a milícia automaticamente
                    nas cidades afetadas. Verifica a cada 15 segundos.
                </div>

                <div class="split_content" style="padding:5px;">
                    <div>
                        ${this.getButtonHtml('militia_start_btn', '▶ Ativar', this._startBtn)}
                        ${this.getButtonHtml('militia_stop_btn',  '■ Parar',  this._stopBtn)}
                    </div>
                    <span id="militia_status"
                        style="font-size:12px;font-weight:bold;color:#94a3b8;line-height:28px;">
                        ${this._active ? '● Ativo' : '○ Parado'}
                    </span>
                </div>

                <div id="militia_log" style="padding:5px 8px;font-size:11px;color:#5a3a0a;min-height:20px;"></div>
            </div>
        </div>`;
    };

    _startBtn = () => this.start();
    _stopBtn  = () => this.stop();

    start() {
        if (this._active) return;
        this._active = true;
        this.storage.save('militia_active', true);
        this._updateButtons();
        this.console.log('[AutoMilícia] Iniciado. Monitorando ataques...');
        this._tick();
        this._intervalId = setInterval(() => this._tick(), 15000);
    }

    stop() {
        this._active = false;
        this.storage.save('militia_active', false);
        if (this._intervalId) { clearInterval(this._intervalId); this._intervalId = null; }
        this._processed.clear();
        this._updateButtons();
        this.console.log('[AutoMilícia] Parado.');
    }

    _updateButtons() {
        if (this._active) {
            uw.$('#militia_start_btn').addClass('disabled');
            uw.$('#militia_stop_btn').removeClass('disabled');
        } else {
            uw.$('#militia_start_btn').removeClass('disabled');
            uw.$('#militia_stop_btn').addClass('disabled');
        }
        uw.$('#militia_status')
            .text(this._active ? '● Ativo' : '○ Parado')
            .css('color', this._active ? '#1a6b2a' : '#94a3b8');
    }

    _tick() {
        if (window.__multbot_conquest_check?.()) return;
        try {
            const attacks = this._getIncomingAttacks();

            // Limpa cidades processadas que já não têm ataques
            const attackedTowns = new Set(attacks.map(a => String(a.target_town_id)));
            for (const tid of this._processed) {
                if (!attackedTowns.has(tid)) this._processed.delete(tid);
            }

            if (attacks.length === 0) return;

            for (const atk of attacks) {
                const townId = String(atk.target_town_id);
                if (this._processed.has(townId)) continue;
                if (!uw.ITowns?.towns?.[townId]) continue;

                this._processed.add(townId);
                this._activateMilitia(townId);
            }
        } catch(e) {
            this.console.log('[AutoMilícia] Erro: ' + e?.message);
        }
    }

    _getIncomingAttacks() {
        try {
            const models = uw.MM.getModels().MovementsUnits;
            if (!models) return [];
            const attacks = [];
            for (const key in models) {
                const mv = models[key].attributes;
                if ((mv.type === 'attack' || mv.type === 'attack_with_spy')
                    && uw.ITowns?.towns?.[mv.target_town_id]) {
                    attacks.push(mv);
                }
            }
            return attacks;
        } catch(e) { return []; }
    }

    _activateMilitia(townId) {
        try {
            const townName = uw.ITowns.towns[townId]?.getName?.() ?? '#' + townId;
            this.console.log(`[AutoMilícia] Ativando milícia em ${townName}...`);

            // Payload exato do Noct AutoMilitia (Tf['ReiWs'] = 'request_militia')
            const data = { town_id: parseInt(townId), nl_init: true };
            uw.gpAjax.ajaxPost('building_farm', 'request_militia', data, true,
                res => {
                    if (res && res.json) {
                        const msg = `✓ Milícia ativada em ${townName}`;
                        this.console.log('[AutoMilícia] ' + msg);
                        uw.$('#militia_log').text(msg).css('color', '#1a6b2a');
                        if (uw.HumanMessage) uw.HumanMessage.success(msg);
                    } else {
                        const msg = `✗ Falha em ${townName}: ${JSON.stringify(res)}`;
                        this.console.log('[AutoMilícia] ' + msg);
                        uw.$('#militia_log').text(msg).css('color', '#8a2a2a');
                        this._processed.delete(String(townId)); // Permite retry
                    }
                },
                err => {
                    this.console.log(`[AutoMilícia] ✗ Erro rede em ${townName}: ${err}`);
                    this._processed.delete(String(townId)); // Permite retry
                }
            );
        } catch(e) {
            this.console.log('[AutoMilícia] Exceção: ' + e?.message);
            this._processed.delete(String(townId));
        }
    }
}
