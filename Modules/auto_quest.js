// ══════════════════════════════════════════════════════
//  MODULE: AutoQuest
//  Reivindica automaticamente as recompensas de missoes de
//  ilha (Island Quests) assim que ficam prontas.
//
//  Confirmado via captura real de rede (Network, F12):
//  - MM.getOnlyCollectionByName('IslandQuest') tem o status
//    de cada missao no campo "state":
//      'satisfied' = pronta pra reivindicar
//      'running'   = em andamento (ex: aguardando tempo)
//      'viable'    = disponivel, mas requisitos ainda nao
//                    cumpridos (ex: precisa mandar tropas)
//  - Reivindicar: model_url "IslandQuests", action_name
//    "claimReward", arguments: { reward_action: "use",
//    state: "closed", progressable_id: <id da missao> },
//    junto de town_id (cidade atual) e nl_init:true.
// ══════════════════════════════════════════════════════
class AutoQuest extends MultUtil {
    constructor(c, s) {
        super(c, s);
        this._active = false;
        this._interval = null;

        if (this.storage.load('aq_active', false)) {
            setTimeout(() => this.start(), 2500);
        }
    }

    settings = () => {
        requestAnimationFrame(() => {
            this._updateTitle();
            this._renderStatus();
        });

        return `
        <div class="game_border" style="margin-bottom:20px;">
            <div class="game_border_top"></div><div class="game_border_bottom"></div>
            <div class="game_border_left"></div><div class="game_border_right"></div>
            <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>
            <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>
            ${this.getTitleHtml('aq_title', this.t('aq_title'), this.toggle, '', this._active)}
            <div style="padding:5px 10px;font-weight:bold;">
                ${this.t('aq_desc')}
            </div>
            <div id="aq_status" style="padding:2px 10px;font-size:11px;color:#5a3a0a;"></div>
            <div id="aq_log" style="padding:2px 10px 8px;font-size:11px;color:#5a3a0a;min-height:16px;"></div>
        </div>`;
    };

    toggle = () => {
        if (this._active) this.stop();
        else this.start();
    };

    start() {
        if (this._active) return;
        this._active = true;
        this.storage.save('aq_active', true);
        this._updateTitle();
        this.console.log('[AutoQuest] ' + this.t('ar_started'));
        this._tick();
        this._interval = this.createGuardedInterval(() => this._tick(), 20000);
    }

    stop() {
        this._active = false;
        this.storage.save('aq_active', false);
        if (this._interval) { clearInterval(this._interval); this._interval = null; }
        this._updateTitle();
        this.console.log('[AutoQuest] ' + this.t('ar_stopped_log'));
    }

    _updateTitle() {
        uw.$('#aq_title').css('filter', this._active
            ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    }

    /* Le direto da collection IslandQuest do Backbone - a mesma
       fonte que a janela nativa do jogo (questlog) usa. Nao
       depende da janela estar aberta. */
    _getSatisfiedQuests() {
        try {
            const collection = uw.MM.getOnlyCollectionByName('IslandQuest');
            const models = collection?.models ?? [];
            return models.filter(m => m.attributes?.state === 'satisfied');
        } catch (e) {
            return [];
        }
    }

    _renderStatus() {
        try {
            const quests = this._getSatisfiedQuests();
            uw.$('#aq_status').html(this.t('aq_ready_count', { count: quests.length }));
        } catch (e) {}
    }

    async _tick() {
        if (window.__multbot_captcha_active) return;
        try {
            const quests = this._getSatisfiedQuests();
            this._renderStatus();
            if (quests.length === 0) return;

            const townId = uw.ITowns.getCurrentTown().id;

            for (const quest of quests) {
                const progressableId = quest.attributes?.progressable_id;
                if (!progressableId) continue;

                const success = await this._claimReward(townId, progressableId);
                if (success) {
                    const msg = this.t('aq_claimed_log', { name: progressableId });
                    this.console.log('[AutoQuest] ' + msg);
                    uw.$('#aq_log').text(msg).css('color', '#1a6b2a');
                }

                // Pequena pausa entre reivindicacoes pra nao sobrecarregar
                await this.sleep(500);
            }

            this._renderStatus();
        } catch (e) {
            this.console.log('[AutoQuest] ' + this.t('aas_tick_error', { msg: e?.message ?? e }));
        }
    }

    /* Confirmado via captura real de rede:
       model_url: "IslandQuests", action_name: "claimReward",
       arguments: { reward_action: "use", state: "closed",
       progressable_id: <id> }, town_id, nl_init:true. */
    _claimReward = async (townId, progressableId) => {
        const data = {
            model_url: 'IslandQuests',
            action_name: 'claimReward',
            captcha: null,
            arguments: {
                reward_action: 'use',
                state: 'closed',
                progressable_id: progressableId,
            },
            town_id: townId,
            nl_init: true,
        };

        try {
            const res = await this.ajaxPostWithTimeout('frontend_bridge', 'execute', data);
            if (res && !res.error) return true;
            this.console.log('[AutoQuest] ' + this.t('aq_claim_fail_log', { name: progressableId, reason: res?.error ?? '?' }));
            return false;
        } catch (e) {
            this.console.log('[AutoQuest] ' + this.t('aq_claim_network_error', { name: progressableId, msg: e?.message ?? e }));
            return false;
        }
    };
}
