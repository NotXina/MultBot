// ══════════════════════════════════════════════════════
//  MODULE: AutoResearch
//  Pesquisa automaticamente na academia seguindo
//  uma ordem de prioridade configurável.
//  Endpoint: frontend_bridge/execute (ResearchOrder/research)
// ══════════════════════════════════════════════════════
class AutoResearch extends ModernUtil {
    // Ordem de prioridade de pesquisa
    DEFAULT_ORDER = [
        'city_guard',       // Guarda da Cidade
        'meteorology',      // Meteorologia
        'espionage',        // Espionagem
        'farmers_loyalty',  // Lealdade dos Aldeões (opcional — só se disponível)
        'pottery',          // Cerâmica
        'architecture',     // Arquitetura
        'crane',            // Guindaste
        'shipwright',       // Construtor Naval
        'colonize_ship',    // Navios Colonizadores
        'plow',             // Arado
    ];

    constructor(c, s) {
        super(c, s);
        this._interval = null;
        this._active   = false;

        if (this.storage.load('ares_active', false)) {
            setTimeout(() => this.start(), 2500);
        }
    }

    // Nomes para exibição
    RESEARCH_NAMES = {
        city_guard:      'Guarda da Cidade',
        meteorology:     'Meteorologia',
        espionage:       'Espionagem',
        farmers_loyalty: 'Lealdade',
        pottery:         'Cerâmica',
        architecture:    'Arquitetura',
        crane:           'Guindaste',
        shipwright:      'Const. Naval',
        colonize_ship:   'Nav. Colonizador',
        plow:            'Arado',
    };

    settings = () => {
        requestAnimationFrame(() => {
            this._updateTitle();
            this._renderIcons();
        });
        return `
        <div class="game_border" style="margin-bottom:20px;">
            <div class="game_border_top"></div><div class="game_border_bottom"></div>
            <div class="game_border_left"></div><div class="game_border_right"></div>
            <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>
            <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>
            ${this.getTitleHtml('ares_title', 'Auto Pesquisa', this.toggle, '', this._active)}
            <div id="ares_icons" style="padding:5px;"></div>
            <div id="ares_log" style="padding:2px 10px 8px;font-size:11px;color:#5a3a0a;min-height:16px;"></div>
        </div>`;
    };

    _renderIcons() {
        try {
            const town       = uw.ITowns.getCurrentTown();
            const researches = town?.researches()?.attributes ?? {};
            const BASE       = 'https://gpit.innogamescdn.com/images/game/academy/';

            const icons = this.DEFAULT_ORDER.map(tech => {
                const done    = !!researches[tech];
                const name    = this.RESEARCH_NAMES[tech] ?? tech;
                const opacity = done ? '0.35' : '1';
                const border  = done ? '2px solid #4ade80' : '2px solid transparent';
                return `
                <div style="display:inline-block;text-align:center;margin:3px;vertical-align:top;width:58px;">
                    <div class="auto_build_box" style="border:${border};box-sizing:border-box;opacity:${opacity};">
                        <img src="${BASE}${tech}.png"
                            style="position:absolute;top:4px;left:4px;width:50px;height:50px;"
                            onerror="this.style.display='none'">
                    </div>
                    <div style="font-size:9px;color:#3a2a0a;line-height:1.2;margin-top:2px;">${name}</div>
                </div>`;
            }).join('');

            uw.$('#ares_icons').html(icons);
        } catch(e) {}
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
        this.console.log('[AutoPesquisa] Iniciado.');
        this._tick();
        this._interval = setInterval(() => this._tick(), 30000);
    }

    stop() {
        this._active = false;
        this.storage.save('ares_active', false);
        if (this._interval) { clearInterval(this._interval); this._interval = null; }
        this._updateTitle();
        this.console.log('[AutoPesquisa] Parado.');
    }

    _updateTitle() {
        uw.$('#ares_title').css('filter', this._active
            ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    }

    async _tick() {
        const townIds = Object.keys(uw.ITowns.towns);
        let count = 0;

        for (const townId of townIds) {
            const researched = await this._researchNext(townId);
            if (researched) { count++; await this.sleep(800 + Math.random() * 400); }
        }

        if (count > 0) {
            const msg = `✓ ${count} pesquisa(s) iniciada(s)`;
            this.console.log('[AutoPesquisa] ' + msg);
            uw.$('#ares_log').text(msg);
            this._renderIcons(); // Atualiza ícones
        }
    }

    async _researchNext(townId) {
        try {
            const town      = uw.ITowns.towns[townId];
            const buildings = town.buildings().attributes;
            const researches = town.researches().attributes;

            // Precisa de academia nível >= 1
            if (!buildings.academy || buildings.academy < 1) return false;

            // Verifica se já há pesquisa em andamento
            const orders = uw.MM.getModels().ResearchOrder;
            if (orders) {
                for (const key in orders) {
                    if (String(orders[key].attributes.town_id) === String(townId)) return false;
                }
            }

            // Encontra a próxima pesquisa na ordem de prioridade
            for (const tech of this.DEFAULT_ORDER) {
                // Verifica se existe neste mundo
                const req = uw.GameData.researches?.[tech];
                if (!req) continue; // não disponível neste mundo

                if (researches[tech]) continue; // já pesquisado

                // Verifica requisitos de academia
                if (buildings.academy < (req.academy_level ?? 1)) continue;

                // Verifica se tem recursos
                const { wood, stone, iron } = town.resources();
                const cost = req?.resources ?? { wood: 0, stone: 0, iron: 0 };
                if (wood < cost.wood || stone < cost.stone || iron < cost.iron) continue;

                // Pesquisa!
                await this._doResearch(townId, tech, town.getName());
                return true;
            }
            return false;
        } catch(e) { return false; }
    }

    _doResearch(townId, tech, townName) {
        return new Promise(resolve => {
            const data = {
                model_url:   'ResearchOrder',
                action_name: 'research',
                arguments:   { research_id: tech },
                town_id:     parseInt(townId),
            };
            this.console.log(`[AutoPesquisa] ${townName}: pesquisando ${tech}`);
            uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data, false,
                res => resolve(res && !res.error),
                ()  => resolve(false)
            );
        });
    }
}
