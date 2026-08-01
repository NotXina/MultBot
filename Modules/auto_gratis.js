var AutoGratis = class extends MultUtil {
    constructor(c, s) {
        super(c, s);

        this.onlyActiveTown = this.storage.load('autogratis_only_active_town', false);
        this._fired = new Set(); // ordens já disparadas, evita chamada duplicada

        if (this.storage.load('enable_autogratis', false)) this.toggle();
    }

    settings = () => {
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
            <div id="auto_gratis_title" style="cursor: pointer; filter: ${this.autogratis ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : ''
            }" class="game_header bold" onclick="window.multBot.autoGratis.toggle()"> Auto Gratis <span class="command_count"></span>
                <div style="position: absolute; right: 10px; top: 4px; font-size: 10px;"> (click to toggle) </div>
            </div>
            <div style="padding: 5px; font-weight: 600">
                Trigger to automatically press the <div id="dummy_free" class="btn_time_reduction button_new js-item-btn-premium-action js-tutorial-queue-item-btn-premium-action type_building_queue type_instant_buy instant_buy type_free">
                <div class="left"></div>
                <div class="right"></div>
                <div class="caption js-caption">Gratis<div class="effect js-effect"></div></div>
            </div> button (try every 2.5 seconds)
            </div>
            <div style="padding: 0 5px 8px; font-size: 11px; font-weight: 500;">
                <label style="cursor: pointer;">
                    <input type="checkbox" ${this.onlyActiveTown ? 'checked' : ''} onchange="window.multBot.autoGratis.setOnlyActiveTown(this.checked)" />
                    Only fire on the actively-viewed town (legacy behaviour)
                </label>
            </div>
        </div>
        `;
    };

    /* Call to trigger the Auto Gratis */
    toggle = () => {
        if (!this.autogratis) {
            uw.$('#auto_gratis_title').css(
                'filter',
                'brightness(100%) saturate(186%) hue-rotate(241deg)',
            );
            // Backbone: detecta nova ordem de construcao instantaneamente
            // (cada vez que o jogo adiciona uma BuildingOrder ao cache,
            // o main() roda na hora sem esperar o poll de 1s)
            this._hookBuildingOrders();
            this.autogratis = this.createGuardedInterval(this.main, 1000);
        } else {
            uw.$('#auto_gratis_title').css('filter', '');
            clearInterval(this.autogratis);
            this.autogratis = null;
            this._unhookBuildingOrders();
        }
        this.storage.save('enable_autogratis', !!this.autogratis);
    };

    _hookBuildingOrders() {
        try {
            const col = uw.MM.getOnlyCollectionByName('BuildingOrder');
            if (!col) return;
            this._boundOnOrderAdd = () => { if (this.autogratis) this.main(); };
            col.on('add', this._boundOnOrderAdd);
            this._buildingOrderCol = col;
        } catch (e) {}
    }

    _unhookBuildingOrders() {
        try {
            if (this._buildingOrderCol && this._boundOnOrderAdd) {
                this._buildingOrderCol.off('add', this._boundOnOrderAdd);
            }
        } catch (e) {}
        this._buildingOrderCol = null;
        this._boundOnOrderAdd = null;
    }

    /* Persist the active-town-only toggle and reflect it in subsequent ticks. */
    setOnlyActiveTown = (value) => {
        this.onlyActiveTown = !!value;
        this.storage.save('autogratis_only_active_town', this.onlyActiveTown);
    };

    /* Inspect a single town's first build order and fire callGratis when the
       order finishes within the 5-minute window. Returns true on a fire so
       the caller can short-circuit the sweep. */
    tryTown = (town, now) => {
        if (!town || typeof town.buildingOrders !== 'function') return false;
        const orders = town.buildingOrders();
        if (!orders || !orders.models || orders.models.length === 0) return false;
        const order = orders.models[0];
        const completedAt = order.attributes.to_be_completed_at;
        if (!completedAt) return false;
        const remaining = completedAt - now;
        if (remaining > 0 && remaining < 300) {
            if (this._fired.has(order.id)) return false;
            this._fired.add(order.id);
            this.callGratis(town.id, order.id);
            return true;
        }
        return false;
    };

    /* Main loop. Default: sweep every town the player owns and fire on the
       first eligible order. With `onlyActiveTown`: limit the sweep to the
       town currently focused via getCurrentTown — same scope as the
       pre-PR-#75 behaviour, opt-in for users who prefer that cadence. */
    main = () => {
        try {
            const now = Math.floor(Date.now() / 1000);

            // Safety net contra crescimento indefinido do Set
            if (this._fired.size > 50) this._fired.clear();

            if (this.onlyActiveTown) {
                this.tryTown(uw.ITowns.getCurrentTown(), now);
                return;
            }

            // FIX: cada cidade isolada no proprio try/catch - antes, uma
            // excecao em tryTown (ex: buildingOrders() falhando numa cidade
            // especifica) escapava do loop inteiro sem log, cancelando a
            // checagem das cidades seguintes nesse mesmo tick.
            for (const town_id in uw.ITowns.towns) {
                try {
                    if (this.tryTown(uw.ITowns.towns[town_id], now)) return;
                } catch (e) {
                    this.console.log('[AutoGratis] Erro ao verificar ' + town_id + ': ' + (e?.message ?? e));
                }
            }
        } catch (e) {
            this.console.log('[AutoGratis] Erro no ciclo principal: ' + (e?.message ?? e));
        }
    };

    /* Post request to call the gratis */
    callGratis = async (town_id, order_id) => {
        const data = {
            "model_url": "BuildingOrder/" + order_id,
            "action_name": "buyInstant",
            "arguments": {
                "order_id": order_id
            },
            "town_id": town_id
        };

        this.console.log('[AutoGratis] ' + uw.ITowns.towns[town_id].getName() + ': calling gratis for order ' + order_id);

        try {
            const res = await this.ajaxPostWithTimeout('frontend_bridge', 'execute', data);
            if (res && res.error) {
                this.console.log('[AutoGratis] Erro ao usar gratis (ordem ' + order_id + '): ' + res.error);
                this._fired.delete(order_id); // permite tentar de novo no proximo tick
            }
        } catch (e) {
            this.console.log('[AutoGratis] Erro de rede ao usar gratis (ordem ' + order_id + '): ' + (e?.message ?? e));
            this._fired.delete(order_id); // permite tentar de novo no proximo tick
        }
    };

};
