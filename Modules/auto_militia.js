// ══════════════════════════════════════════════════════
//  MODULE: AutoMilitia
//  Ativa milícia automaticamente em cidades com ataque
//  entrante. Endpoint: building_farm / request_militia
//
//  Deteccao via evento Backbone (add no MovementsUnits) —
//  reage instantaneamente a novos ataques, sem esperar
//  o poll periodico de 15s. Poll mantido como fallback
//  (ataques ja existentes ao ativar, reloads de pagina).
// ══════════════════════════════════════════════════════
var AutoMilitia = class extends MultUtil {
    constructor(c, s) {
        super(c, s);

        this._active        = false;
        this._intervalId    = null;
        this._scheduled     = new Map(); // townId -> timeoutId
        this._boundOnAdd    = null;      // referencia do listener backbone
        this._collection    = null;

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
            ${this.getTitleHtml('auto_militia_title', this.t('am_title'), this.toggle, '', this._active)}
            <div style="padding:5px 10px;font-weight:bold;">
                ${this.t('am_desc')}
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
        this.console.log('[AutoMilicia] ' + this.t('am_started_log'));

        // Deteccao instantanea via Backbone
        this._hookBackbone();

        // Poll de seguranca: pega ataques ja existentes ao ativar
        // e cobre qualquer evento perdido por reload.
        // respectSleep=false: modulo de defesa critico.
        this._tick();
        this._intervalId = this.createGuardedInterval(() => this._tick(), 15000, false);
    }

    stop() {
        this._active = false;
        this.storage.save('militia_active', false);
        if (this._intervalId) { clearInterval(this._intervalId); this._intervalId = null; }

        for (const timeoutId of this._scheduled.values()) clearTimeout(timeoutId);
        this._scheduled.clear();

        this._unhookBackbone();
        this._updateButtons();
        this.console.log('[AutoMilicia] ' + this.t('am_stopped_log'));
    }

    // ─────────────────────────────────────────────────────────────
    //  BACKBONE — deteccao instantanea de novos ataques
    // ─────────────────────────────────────────────────────────────

    _hookBackbone() {
        this._unhookBackbone();

        const MAX_WAIT_MS = 10000;
        const RETRY_MS   = 500;
        const start      = Date.now();

        const tryHook = () => {
            try {
                const collection = uw.MM.getOnlyCollectionByName('MovementsUnits');
                if (!collection) {
                    if (Date.now() - start < MAX_WAIT_MS) setTimeout(tryHook, RETRY_MS);
                    else this.console.log('[AutoMilicia] MovementsUnits nao encontrado - so poll ativo.');
                    return;
                }

                this._boundOnAdd = (model) => {
                    try {
                        const mv = model?.attributes;
                        if (!mv) return;
                        const isAttack = mv.type === 'attack' || mv.type === 'attack_with_spy';
                        const isOurTown = uw.ITowns?.towns?.[mv.target_town_id];
                        if (!isAttack || !isOurTown) return;

                        const townId = String(mv.target_town_id);
                        if (this._scheduled.has(townId)) return;

                        const arrival = mv.arrival_at ?? mv.time_of_arrival ?? 0;
                        if (!arrival) return;

                        const now = Math.floor(Date.now() / 1000);
                        const remaining = arrival - now;
                        const fireInMs = Math.max(0, (remaining - 8) * 1000);

                        const timeoutId = setTimeout(() => {
                            this._scheduled.delete(townId);
                            this._activateMilitia(townId);
                        }, fireInMs);

                        this._scheduled.set(townId, timeoutId);
                        this.console.log('[AutoMilicia] [INSTANT] ' + this.t('am_scheduled_log', {
                            town: uw.ITowns.towns[townId]?.getName?.() ?? townId,
                            sec: Math.round(fireInMs / 1000),
                        }));
                    } catch (e) {
                        this.console.log('[AutoMilicia] backbone onAdd error: ' + (e?.message ?? e));
                    }
                };

                collection.on('add', this._boundOnAdd);
                this._collection = collection;
                this.console.log('[AutoMilicia] Backbone hook ativo — deteccao instantanea.');
            } catch (e) {
                this.console.log('[AutoMilicia] _hookBackbone error: ' + (e?.message ?? e));
            }
        };

        tryHook();
    }

    _unhookBackbone() {
        try {
            if (this._collection && this._boundOnAdd) {
                this._collection.off('add', this._boundOnAdd);
            }
        } catch (e) {}
        this._collection = null;
        this._boundOnAdd = null;
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

            // Cancela timers de ataques que ja sumiram
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
                this.console.log('[AutoMilicia] ' + this.t('am_scheduled_log', {
                    town: uw.ITowns.towns[townId]?.getName?.() ?? townId,
                    sec: Math.round(fireInMs / 1000),
                }));
            }
        } catch(e) {
            this.console.log('[AutoMilicia] ' + this.t('am_tick_error', { msg: e?.message ?? e }));
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

    _activateMilitia = async (townId) => {
        try {
            const townName = uw.ITowns.towns[townId]?.getName?.() ?? '#' + townId;
            this.console.log('[AutoMilicia] ' + this.t('am_activating_log', { town: townName }));

            const data = { town_id: parseInt(townId), nl_init: true };
            const res = await this.ajaxPostWithTimeout('building_farm', 'request_militia', data, 10000, true);

            if (res && !res.error) {
                const msg = this.t('am_activated_log', { town: townName });
                this.console.log('[AutoMilicia] ' + msg);
                uw.$('#militia_log').text(msg).css('color', '#1a6b2a');
                if (uw.HumanMessage) uw.HumanMessage.success(msg);
            } else {
                const msg = this.t('am_activate_fail_log', { town: townName, reason: res?.error ?? '?' });
                this.console.log('[AutoMilicia] ' + msg);
                uw.$('#militia_log').text(msg).css('color', '#8a2a2a');
            }
        } catch(e) {
            this.console.log('[AutoMilicia] ' + this.t('am_activate_exception_log', { id: townId, msg: e?.message ?? e }));
        }
    };
};
