// ══════════════════════════════════════════════════════
//  MODULE: AutoHide
//  Guarda prata (iron nos resources) automaticamente no
//  esconderijo em duas situacoes:
//
//  1. FERRO FIXO (comportamento original):
//     Cidade com mais de 15.000 de ferro guarda STORE_AMOUNT
//     fixo no esconderijo.
//     NOTA: no Grepolis, "iron" nos resources() e PRATA —
//     o campo de recursos usa o nome interno "iron" pra
//     representar prata (recurso raro do jogo).
//
//  2. PRATA 90% (novo):
//     Quando a prata (iron) bate 90% do armazem (storage),
//     guarda 10% do armazem no esconderijo imediatamente —
//     valvula de alivio pra nao perder prata em ataques.
//
//  Endpoint confirmado via captura real de rede:
//  frontend_bridge/execute, model_url: "BuildingHide",
//  action_name: "storeIron", arguments: { iron_to_store: N }
// ══════════════════════════════════════════════════════
var AutoHide = class extends MultUtil {
    // Quantidade fixa guardada por vez no modo ferro
    STORE_AMOUNT = 10000;
    // Threshold de gatilho para o modo prata (90% do armazem)
    SILVER_THRESHOLD = 0.9;
    // Percentual guardado quando gatilho dispara (10% do armazem)
    SILVER_STORE_PCT = 0.1;

    constructor(c, s) {
        super(c, s);
        this._active     = this.storage.load('autohide_active', false);
        this._intervalId = null;
        // Controla quais cidades ja foram tratadas neste ciclo de
        // prata, pra nao guardar multiplas vezes seguidas enquanto
        // o armazem ainda esta alto (o jogo demora a atualizar o
        // valor apos o storeIron)
        this._silverCooldown = new Set();

        if (this._active) {
            setTimeout(() => this.start(), 2500);
        }
    }

    settings = () => {
        requestAnimationFrame(() => {
            this._updateTitle();
            this._renderStatus();
        });

        return `
        <div class="game_border" style="margin-bottom: 20px">
            <div class="game_border_top"></div>
            <div class="game_border_bottom"></div>
            <div class="game_border_left"></div>
            <div class="game_border_right"></div>
            <div class="game_border_corner corner1"></div>
            <div class="game_border_corner corner2"></div>
            <div class="game_border_corner corner3"></div>
            <div class="game_border_corner corner4"></div>
            ${this.getTitleHtml('auto_cave_title', this.t('ah_title'), this.toggle, '', this._active)}
            <div style="padding: 5px; font-weight: 600">
                ${this.t('ah_desc', { amount: this.STORE_AMOUNT })}
            </div>
            <div style="padding: 2px 10px 4px; font-size: 11px; color: #5a3a0a;">
                ${this.t('ah_silver_desc')}
            </div>
            <div id="ah_status" style="padding:2px 10px 8px;font-size:11px;color:#5a3a0a;"></div>
        </div>
        `;
    };

    toggle = () => {
        if (this._active) this.stop();
        else this.start();
    };

    start() {
        if (this._active) return;
        this._active = true;
        this.storage.save('autohide_active', true);
        this._updateTitle();
        this.console.log('[AutoHide] ' + this.t('ar_started'));
        this.main();
        this._intervalId = this.createGuardedInterval(() => this.main(), 5000);
    }

    stop() {
        this._active = false;
        this.storage.save('autohide_active', false);
        if (this._intervalId) { clearInterval(this._intervalId); this._intervalId = null; }
        this._silverCooldown.clear();
        this._updateTitle();
        this.console.log('[AutoHide] ' + this.t('ar_stopped_log'));
    }

    _updateTitle() {
        uw.$('#auto_cave_title').css('filter', this._active
            ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    }

    /* Cidades elegiveis: esconderijo nivel 10 (requisito minimo
       confirmado no codigo original). */
    _getEligibleTowns() {
        try {
            return Object.values(uw.ITowns.towns).filter(t => {
                try { return t.buildings().attributes.hide === 10; } catch (e) { return false; }
            });
        } catch (e) {
            return [];
        }
    }

    _renderStatus() {
        try {
            const eligible = this._getEligibleTowns();
            uw.$('#ah_status').text(this.t('ah_eligible_count', { count: eligible.length }));
        } catch (e) {}
    }

    main = async () => {
        if (!this._active) return;

        const eligible = this._getEligibleTowns();
        this._renderStatus();

        for (const town of eligible) {
            try {
                const res     = town.resources();
                const iron    = res.iron;    // prata no Grepolis
                const storage = res.storage;

                // ── Modo prata 90%: gatilho prioritario ──────────
                // Quando a prata bate 90% do armazem, guarda 10%
                // imediatamente. Cooldown de 60s por cidade pra evitar
                // guardar multiplas vezes enquanto o jogo nao atualiza
                // o valor do recurso apos o storeIron.
                const silverThreshold = Math.floor(storage * this.SILVER_THRESHOLD);
                const townKey = String(town.id);

                if (iron >= silverThreshold && !this._silverCooldown.has(townKey)) {
                    // Guarda 10% da capacidade total do armazem.
                    // Usa Math.max(1, ...) pra garantir que nunca
                    // manda iron_to_store: 0 pro servidor.
                    const toStore = Math.max(1, Math.floor(storage * this.SILVER_STORE_PCT));

                    this.console.log('[AutoHide] ' + this.t('ah_silver_trigger_log', {
                        town: town.getName(),
                        iron: iron,
                        pct: Math.round(iron / storage * 100),
                        amount: toStore,
                    }));

                    // Cooldown ANTES do await — evita que outro ciclo
                    // de 5s dispare um segundo storeIron enquanto o
                    // primeiro ainda esta em flight
                    this._silverCooldown.add(townKey);
                    setTimeout(() => this._silverCooldown.delete(townKey), 60000);

                    await this.storeIron(town.id, toStore);
                    continue; // pula o check de ferro fixo nesse ciclo
                }

                // ── Modo ferro fixo (comportamento original) ──────
                if (iron > 15000) {
                    await this.storeIron(town.id, this.STORE_AMOUNT);
                }
            } catch (e) {
                this.console.log('[AutoHide] ' + this.t('ah_store_error', { msg: e?.message ?? e }));
            }
        }
    }

    /* Confirmado via captura real de rede:
       frontend_bridge/execute, BuildingHide/storeIron,
       arguments: { iron_to_store: N }, town_id, nl_init:true. */
    storeIron = async (town_id, count) => {
        try {
            const res = await this.ajaxPostWithTimeout('frontend_bridge', 'execute', {
                model_url:   'BuildingHide',
                action_name: 'storeIron',
                captcha:     null,
                arguments:   { iron_to_store: count },
                town_id:     town_id,
                nl_init:     true,
            });
            if (res && !res.error) {
                const name = uw.ITowns.towns[town_id]?.getName?.() ?? ('#' + town_id);
                this.console.log('[AutoHide] ' + this.t('ah_stored_log', { town: name, amount: count }));
            } else {
                this.console.log('[AutoHide] ' + this.t('ah_store_error', { msg: res?.error ?? '?' }));
            }
        } catch (e) {
            this.console.log('[AutoHide] ' + this.t('ah_store_error', { msg: e?.message ?? e }));
        }
    }
};
