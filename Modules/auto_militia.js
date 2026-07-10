// ══════════════════════════════════════════════════════
//  MODULE: AutoMilitia
//  Ativa milícia automaticamente em cidades com ataque
//  entrante. Endpoint: building_farm / request_militia
//  Payload exato do Noct AutoMilitia.
// ══════════════════════════════════════════════════════
var AutoMilitia = class extends MultUtil {
    constructor(c, s) {
        super(c, s);

        this._active        = false;
        this._intervalId    = null;
        this._scheduled     = new Map(); // townId -> timeoutId, ataques já agendados

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
            ${this.getTitleHtml('auto_militia_title', 'Auto Milícia', this.toggle, '', this._active)}
            <div style="padding:5px 10px;font-weight:bold;">
                Ativa milícia ~8s antes do impacto em cidades sob ataque.
            </div>
            <div id="militia_log" style="padding:2px 10px 8px;font-size:11px;color:#5a3a0a;min-height:16px;"></div>
        </div>`;
    };

    toggle = () => {
        if (this._active) this.stop();
        else this.start();
        uw.$('#auto_militia_title').css('filter', this._active ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    };

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

        for (const timeoutId of this._scheduled.values()) clearTimeout(timeoutId);
        this._scheduled.clear();

        this._updateButtons();
        this.console.log('[AutoMilícia] Parado.');
    }

    _updateButtons() {
        uw.$('#auto_militia_title').css('filter', this._active
            ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    }

    _tick() {
        if (window.__multbot_captcha_active) return;
        try {
            const attacks = this._getIncomingAttacks();
            const now     = Math.floor(Date.now() / 1000);

            const attackedTowns = new Set(attacks.map(a => String(a.target_town_id)));
            for (const townId of this._scheduled.keys()) {
                if (!attackedTowns.has(townId)) {
                    clearTimeout(this._scheduled.get(townId));
                    this._scheduled.delete(townId);
                }
            }

            if (attacks.length === 0) return;

            for (const atk of attacks) {
                const townId = String(atk.target_town_id);
                if (this._scheduled.has(townId)) continue;
                if (!uw.ITowns?.towns?.[townId]) continue;

                const arrival = atk.arrival_at ?? atk.time_of_arrival ?? 0;
                if (!arrival) continue;

                const remaining = arrival - now;
                const fireInMs = Math.max(0, (remaining - 8) * 1000);

                const timeoutId = setTimeout(() => {
                    this._scheduled.delete(townId);
                    this._activateMilitia(townId);
                }, fireInMs);

                this._scheduled.set(townId, timeoutId);
                this.console.log(`[AutoMilícia] Agendado: ${uw.ITowns.towns[townId]?.getName?.() ?? townId} em ${Math.round(fireInMs / 1000)}s`);
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

            const data = { town_id: parseInt(townId), nl_init: true };
            uw.gpAjax.ajaxPost('building_farm', 'request_militia', data, true,
                res => {
                    if (res && !res.error) {
                        const msg = `✓ Milícia ativada em ${townName}`;
                        this.console.log('[AutoMilícia] ' + msg);
                        uw.$('#militia_log').text(msg).css('color', '#1a6b2a');
                        if (uw.HumanMessage) uw.HumanMessage.success(msg);
                    } else {
                        const msg = `✗ Falha em ${townName}`;
                        this.console.log('[AutoMilícia] ' + msg);
                        uw.$('#militia_log').text(msg).css('color', '#8a2a2a');
                    }
                },
                err => {
                    this.console.log(`[AutoMilícia] ✗ Erro rede em ${townName}: ${err}`);
                }
            );
        } catch(e) {
            this.console.log('[AutoMilícia] Exceção: ' + e?.message);
        }
    }
};
