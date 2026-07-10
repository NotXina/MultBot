// ══════════════════════════════════════════════════════
//  MODULE: AutoTrade
//  Placeholder — funcionalidade de trade manual via autoTradeBot
//  A classe AutoTrade existe para ser instanciada pelo multbot.js
// ══════════════════════════════════════════════════════
var AutoTrade = class extends MultUtil {
    constructor(c, s) {
        super(c, s);
    }

    settings = () => {
        return `
        <div class="game_border" style="margin-bottom: 20px">
            <div class="game_border_top"></div><div class="game_border_bottom"></div>
            <div class="game_border_left"></div><div class="game_border_right"></div>
            <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>
            <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>
            <div class="game_header bold">${this.t('at_trade_title')}</div>
            <div style="padding:8px;font-size:11px;color:#5a3a0a;">
                ${this.t('at_trade_desc')}
            </div>
        </div>`;
    };

    /* ── Lógica de trade (chamada manualmente via console) ─────── */

    tradeUntilComplete = async (target = 'active', troop = 'bireme') => {
        if (target === 'active') target = uw.ITowns.getCurrentTown().id;
        this.console.log(`[AutoTrade] ${this.t('at_starting_trade', { target, troop })}`);

        let attempts = 0;
        const MAX_ATTEMPTS = 20;

        try {
            let amount;
            do {
                if (attempts++ >= MAX_ATTEMPTS) {
                    this.console.log('[AutoTrade] ' + this.t('at_max_attempts'));
                    break;
                }
                amount = await this._calculateAmount(target, troop);
                if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) break;

                amount = await this._trade(target, troop, amount);
                if (amount > 0) await this.sleep(30000);
            } while (amount > 0);

            this.console.log('[AutoTrade] ' + this.t('at_trade_complete'));
        } catch (e) {
            this.console.log(`[AutoTrade] ${this.t('error')}: ${e.message}`);
            console.error('[AutoTrade] tradeUntilComplete error:', e);
        }
    };

    _trade = async (target, troop, amount) => {
        let current;
        let safetyCounter = 0;

        do {
            if (safetyCounter++ > 50) {
                this.console.log('[AutoTrade] ' + this.t('at_safety_break'));
                break;
            }
            current = amount;
            for (const town of Object.values(uw.ITowns.towns)) {
                if (town.id == target) continue;
                if (amount <= 0) break;
                try {
                    amount = await this._sendBalance(town.id, target, troop, amount);
                } catch (e) {
                    this.console.log(`[AutoTrade] ${this.t('at_send_error', { town: town.getName(), msg: e.message })}`);
                }
            }
        } while (current > amount);

        return amount;
    };

    _getAllTrades = () => {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('getAllTrades timeout')), 10000);
            uw.gpAjax.ajaxGet('town_overviews', 'trade_overview', {}, true, res => {
                clearTimeout(timeout);
                if (!res?.movements) return reject(new Error('getAllTrades: resposta inválida'));
                resolve(res.movements);
            });
        });
    };

    _getCount = (town_id, troop) => {
        const town = uw.ITowns.towns[town_id];
        if (!town) return 0;
        const res  = town.resources();
        const cost = uw.GameData.units[troop].resources;
        return Math.min(
            res.wood  / cost.wood,
            res.stone / cost.stone,
            res.iron  / cost.iron
        );
    };

    _getTradeTarget = html => {
        const el = document.createElement('div');
        el.innerHTML = html;
        const name = el.textContent;
        return Object.values(uw.ITowns.towns).find(t => t.name === name)?.id;
    };

    _calculateAmount = async (target_id, troop) => {
        const target = uw.ITowns.towns[target_id];
        if (!target) return 0;

        const discount = uw.GeneralModifications.getUnitBuildResourcesModification(target_id, uw.GameData.units[troop]);
        let todo = parseInt(target.getAvailablePopulation() / uw.GameData.units[troop].population) * discount;
        todo -= this._getCount(target_id, troop);
        if (todo <= 0) return 0;

        try {
            const trades = await this._getAllTrades();
            for (const trade of trades) {
                if (this._getTradeTarget(trade.to.link) != target_id) continue;
                const cost = uw.GameData.units[troop].resources;
                todo -= Math.min(
                    trade.res.wood  / cost.wood,
                    trade.res.stone / cost.stone,
                    trade.res.iron  / cost.iron
                );
            }
        } catch (e) {
            this.console.log(`[AutoTrade] ${this.t('at_transit_trade_error', { msg: e.message })}`);
        }

        return Math.max(0, todo);
    };

    _getCountWithTrade = (town_id, troop) => {
        const town = uw.ITowns.towns[town_id];
        if (!town) return 0;
        const res  = town.resources();
        const cost = uw.GameData.units[troop].resources;
        const byRes   = Math.min(res.wood / cost.wood, res.stone / cost.stone, res.iron / cost.iron);
        const byTrade = town.getAvailableTradeCapacity() / (cost.wood + cost.stone + cost.iron);
        return Math.min(byRes, byTrade);
    };

    _sendTradeRequest = async (from_id, target_id, troop, count) => {
        const cost = uw.GameData.units[troop].resources;
        const data = {
            id:       target_id,
            wood:     cost.wood  * count,
            stone:    cost.stone * count,
            iron:     cost.iron  * count,
            town_id:  from_id,
            nl_init:  true,
        };
        await this.ajaxPostWithTimeout('town_info', 'trade', data, 15000, true);
        await this.sleep(500);
    };

    _sendBalance = async (from_id, target_id, troop, count) => {
        const UNIT_AMOUNTS = { bireme: 2.9, slinger: 28 };
        const batch = UNIT_AMOUNTS[troop];
        if (!batch) return 0;
        if (from_id == target_id) return count;

        const sender = uw.ITowns.towns[from_id];
        if (!sender) return count;
        if (this._getCount(from_id, troop) < batch) return count;
        if (sender.getAvailableTradeCapacity() < 500) return count;
        if (this._getCountWithTrade(from_id, troop) < batch) return count;

        await this._sendTradeRequest(from_id, target_id, troop, batch);
        return Math.max(0, count - batch);
    };

    /* sleep vem herdado de MultUtil (core.js) — não precisa duplicar aqui */
};
