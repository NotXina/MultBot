var AutoHide = class extends MultUtil {
    // Quantidade fixa de ferro guardada no esconderijo por vez - guarda
    // so isso, deixando o resto disponivel pra uso na cidade.
    STORE_AMOUNT = 10000;

    constructor(c, s) {
        super(c, s);
        this._active = this.storage.load('autohide_active', false);
        this._intervalId = null;

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
        this._updateTitle();
        this.console.log('[AutoHide] ' + this.t('ar_stopped_log'));
    }

    _updateTitle() {
        uw.$('#auto_cave_title').css('filter', this._active
            ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    }

    // Todas as cidades do jogador que tem esconderijo nivel 10 -
    // requisito minimo pra guardar ferro (confirmado no codigo
    // original: hide == 10).
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

    // Passa por TODAS as cidades elegiveis (nao so uma selecionada
    // manualmente) e guarda ferro em cada uma que estiver acima do
    // limite - essa e a mudanca principal: antes so cobria a cidade
    // que o jogador escolhia manualmente na janela do esconderijo.
    main = async () => {
        if (!this._active) return;

        const eligible = this._getEligibleTowns();
        this._renderStatus();

        for (const town of eligible) {
            try {
                const { iron } = town.resources();
                if (iron > 15000) {
                    await this.storeIron(town.id, this.STORE_AMOUNT);
                }
            } catch (e) {
                this.console.log('[AutoHide] ' + this.t('ah_store_error', { msg: e?.message ?? e }));
            }
        }
    }

    storeIron = async (town_id, count) => {
        try {
            const res = await this.ajaxPostWithTimeout('frontend_bridge', 'execute', {
                "model_url": "BuildingHide",
                "action_name": "storeIron",
                "arguments": {
                    "iron_to_store": count
                },
                "town_id": town_id,
            });
            if (res && !res.error) {
                const name = uw.ITowns.towns[town_id]?.getName?.() ?? ('#' + town_id);
                this.console.log('[AutoHide] ' + this.t('ah_stored_log', { town: name, amount: count }));
            } else {
                this.console.log('[AutoHide] ' + this.t('ah_store_error', { msg: res?.error ?? '?' }));
            }
        } catch (e) {
            this.console.log('[AutoHide] ' + this.t('ah_store_error', { msg: e.message }));
        }
    }
};
