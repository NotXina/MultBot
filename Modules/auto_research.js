// ══════════════════════════════════════════════════════
//  MODULE: AutoResearch
//  Pesquisa automaticamente na academia seguindo
//  uma ordem de prioridade configuravel.
//
//  PDCA - correcao desta rodada: o tick roda via
//  this.createGuardedInterval - com muitas cidades, um ciclo
//  pode facilmente passar de 30s (sleep de 800ms por cidade
//  bem sucedida); sem a guarda, o proximo tick podia comecar
//  em cima do anterior ainda rodando.
// ══════════════════════════════════════════════════════
var AutoResearch = class extends MultUtil {
    DEFAULT_ORDER = [
        'town_guard',
        'meteorology',
        'espionage',
        'booty',
        'pottery',
        'architecture',
        'building_crane',
        'shipwright',
        'colonize_ship',
        'plow',
    ];

    constructor(c, s) {
        super(c, s);
        this._interval = null;
        this._active = false;
        this._failedThisCycle = new Map();
        this._townSwitchSubscribed = false;

        if (this.storage.load('ares_active', false)) {
            setTimeout(() => this.start(), 2500);
        }
    }

    settings = () => {
        requestAnimationFrame(() => {
            this._updateTitle();
            this._renderStatus();
            this._subscribeTownSwitch();
        });
        return `
        <div class="game_border" style="margin-bottom:20px;">
            <div class="game_border_top"></div><div class="game_border_bottom"></div>
            <div class="game_border_left"></div><div class="game_border_right"></div>
            <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>
            <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>
            ${this.getTitleHtml('ares_title', this.t('ar_title'), this.toggle, '', this._active)}
            <div style="padding:5px 10px;font-weight:bold;">
                ${this.t('ar_desc')}
            </div>
            <div id="ares_status" style="padding:2px 10px;font-size:11px;color:#5a3a0a;"></div>
            <div id="ares_log" style="padding:2px 10px 8px;font-size:11px;color:#5a3a0a;min-height:16px;"></div>
        </div>`;
    };

    _subscribeTownSwitch() {
        if (this._townSwitchSubscribed) return;
        try {
            uw.$.Observer(uw.GameEvents.town.town_switch).subscribe(() => {
                this._renderStatus();
            });
            this._townSwitchSubscribed = true;
        } catch (e) {
            this.console.log('[AutoPesquisa] ' + this.t('ar_subscribe_warning', { msg: e?.message ?? e }));
        }
    }

    _renderStatus() {
        try {
            const town = uw.ITowns.getCurrentTown();
            const researches = town?.researches()?.attributes ?? {};

            const done = this.DEFAULT_ORDER.filter(t => researches[t] && uw.GameData.researches?.[t]);
            const pending = this.DEFAULT_ORDER.filter(t => !researches[t] && uw.GameData.researches?.[t]);

            const doneNames = done.map(t => this.getGameName('research', t)).join(', ') || '-';
            const pendingNames = pending.map(t => this.getGameName('research', t)).join(' -> ') || '-';

            const townName = town && town.getName ? town.getName() : '?';

            uw.$('#ares_status').html(
                `<span style="color:#3a2a0a;font-weight:bold;">${townName}</span><br>` +
                `<span style="color:#1a6b2a;">${this.t('ar_done_label')} ${doneNames}</span><br>` +
                `<span style="color:#5a3a0a;">${this.t('ar_pending_label')} ${pendingNames}</span>`
            );
        } catch (e) {}
    }

    toggle = () => {
        if (this._active) this.stop();
        else this.start();
    };

    start() {
        if (this._active) return;
        this._active = true;
        this.storage.save('ares_active', true);
        this._updateTitle();
        this.console.log('[AutoPesquisa] ' + this.t('ar_started'));
        this._tick();
        this._interval = this.createGuardedInterval(() => this._tick(), 30000);
    }

    stop() {
        this._active = false;
        this.storage.save('ares_active', false);
        if (this._interval) { clearInterval(this._interval); this._interval = null; }
        this._updateTitle();
        this.console.log('[AutoPesquisa] ' + this.t('ar_stopped_log'));
    }

    /* API publica: garante que o Auto Pesquisa esta ativo. Se ja
       estava ativo, forca uma varredura imediata (_tick) em vez de
       esperar o proximo ciclo de 30s. Criado pra o MultTools (aba
       Mult) nao precisar mais checar this._active nem chamar
       this._tick() diretamente. */
    ensureActive() {
        if (!this._active) this.start();
        else this._tick();
    }

    _updateTitle() {
        uw.$('#ares_title').css('filter', this._active
            ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    }

    async _tick() {
        if (window.__multbot_captcha_active) return;
        const townIds = Object.keys(uw.ITowns.towns);
        let count = 0;

        for (const townId of townIds) {
            const done = await this._researchNext(townId);
            if (done) {
                count++;
                await this.sleep(800);
            }
        }

        if (count > 0) {
            this._renderStatus();
        }
    }

    async _researchNext(townId) {
        try {
            const town = uw.ITowns.towns[townId];
            const buildings = town.buildings().attributes;
            const researches = town.researches().attributes;
            const townName = town.getName();

            if (!buildings.academy || buildings.academy < 1) return false;

            const orders = uw.MM.getModels().ResearchOrder;
            if (orders) {
                for (const key in orders) {
                    if (String(orders[key].attributes.town_id) === String(townId)) {
                        return false;
                    }
                }
            }

            const failedSet = this._failedThisCycle.get(townId) ?? new Set();

            for (const tech of this.DEFAULT_ORDER) {
                const req = uw.GameData.researches?.[tech];
                if (!req) continue;
                if (researches[tech]) continue;
                if (failedSet.has(tech)) continue;

                const requiredAcademy = req.building_dependencies?.academy ?? 1;
                if (buildings.academy < requiredAcademy) continue;

                const deps = req.research_dependencies ?? [];
                const missingDep = deps.find(dep => !researches[dep]);
                if (missingDep) continue;

                if (req.requires_farming_villages && !this._islandHasFarmTowns(town)) continue;

                const { wood, stone, iron } = town.resources();
                const cost = req?.resources ?? { wood: 0, stone: 0, iron: 0 };
                if (wood < cost.wood || stone < cost.stone || iron < cost.iron) continue;

                const success = await this._doResearch(townId, tech, townName);
                if (success) {
                    return true;
                }

                failedSet.add(tech);
                this._failedThisCycle.set(townId, failedSet);
            }

            return false;
        } catch (e) {
            this.console.log(`[AutoPesquisa] ${this.t('error')}: ${e?.message}`);
            return false;
        }
    }

    _islandHasFarmTowns(town) {
        try {
            const ix = town.attributes.island_x;
            const iy = town.attributes.island_y;
            const farmTowns = uw.MM.getOnlyCollectionByName('FarmTown')?.models ?? [];
            for (const ft of farmTowns) {
                if (ft.attributes.island_x === ix && ft.attributes.island_y === iy) return true;
            }
            return false;
        } catch (e) { return false; }
    }

    _doResearch(townId, tech, townName) {
        return new Promise(resolve => {
            const data = {
                model_url: 'ResearchOrder',
                action_name: 'research',
                captcha: null,
                arguments: { id: tech },
                town_id: parseInt(townId),
            };
            uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data, false,
                res => {
                    if (res && !res.error) {
                        const msg = this.t('ar_research_started', { town: townName, tech: this.getGameName('research', tech) });
                        this.console.log(`[AutoPesquisa] ✓ ${msg}`);
                        uw.$('#ares_log').text(`✓ ${msg}`).css('color', '#1a6b2a');
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                },
                () => resolve(false)
            );
        });
    }
};
