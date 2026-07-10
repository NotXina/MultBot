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
        this._decidedThisSession = new Set();

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

    /* Algumas missoes de ilha vem em pares "Bem" (Good) e "Mal"
       (Evil) pro mesmo evento (ex: AllJustAnExploitGoodIslandQuest
       / AllJustAnExploitEvilIslandQuest). Confirmado via captura
       real: enquanto nenhum lado foi escolhido, os DOIS aparecem
       com state "viable" ao mesmo tempo. Escolher e feito via
       model_url "IslandQuests", action_name "decide", arguments:
       { decision: "good"|"evil", progressable_name: <nome> }.
       So considera que existe uma bifurcacao pendente quando os
       DOIS lados (Bem e Mal) aparecem juntos como "viable" - se
       so um lado existir, trata como missao normal (sem decidir
       nada), pra nao arriscar chamar "decide" em algo que nao
       precisa.
       IMPORTANTE: nao tem preferencia por Bem ou Mal - escolhe
       QUALQUER lado que nao tenha custo (nem recursos, nem
       tropas), ou seja, so as missoes de tempo/espera. Se os
       DOIS lados pedirem algo, fica de fora - decisao fica pra
       voce fazer manualmente no jogo, ja que decidir
       provavelmente tranca o lado oposto. */
    _getUndecidedFreeForks() {
        try {
            const collection = uw.MM.getOnlyCollectionByName('IslandQuest');
            const models = collection?.models ?? [];
            const viable = models.filter(m => m.attributes?.state === 'viable');

            const GOOD_SUFFIX = 'GoodIslandQuest';
            const EVIL_SUFFIX = 'EvilIslandQuest';
            const groups = {};

            for (const m of viable) {
                const name = m.attributes?.progressable_id;
                if (!name) continue;
                if (name.endsWith(GOOD_SUFFIX)) {
                    const base = name.slice(0, -GOOD_SUFFIX.length);
                    if (!groups[base]) groups[base] = {};
                    groups[base].good = m;
                } else if (name.endsWith(EVIL_SUFFIX)) {
                    const base = name.slice(0, -EVIL_SUFFIX.length);
                    if (!groups[base]) groups[base] = {};
                    groups[base].evil = m;
                }
            }

            const result = [];
            for (const base in groups) {
                const g = groups[base];
                if (!g.good || !g.evil) continue;

                const goodFree = !this._hasCost(g.good);
                const evilFree = !this._hasCost(g.evil);

                // Prefere "Bem" quando os dois sao de graca (tanto faz,
                // mas precisa escolher um); senao pega o que for de graca.
                let chosen, decision;
                if (goodFree) { chosen = g.good; decision = 'good'; }
                else if (evilFree) { chosen = g.evil; decision = 'evil'; }
                else continue; // os dois tem custo - fica de fora

                const name = chosen.attributes.progressable_id;
                if (this._decidedThisSession.has(name)) continue;

                result.push({ name, decision });
            }
            return result;
        } catch (e) {
            return [];
        }
    }

    /* Verdadeiro se a missao pede recursos ou tropas pra progredir
       (ou seja, NAO e uma missao de tempo/espera pura). */
    _hasCost(model) {
        const progress = model.attributes?.progress;
        if (!progress) return false;
        if (progress.resources && Object.values(progress.resources).some(v => v > 0)) return true;
        if (progress.units && Object.values(progress.units).some(v => v > 0)) return true;
        return false;
    }

    _renderStatus() {
        try {
            const quests = this._getSatisfiedQuests();
            const forks = this._getUndecidedFreeForks();
            let html = this.t('aq_ready_count', { count: quests.length });
            if (forks.length > 0) html += this.t('aq_pending_forks', { count: forks.length });
            uw.$('#aq_status').html(html);
        } catch (e) {}
    }

    async _tick() {
        if (window.__multbot_captcha_active) return;
        try {
            const townId = uw.ITowns.getCurrentTown().id;

            // 1. Reivindica missoes ja prontas
            const quests = this._getSatisfiedQuests();
            this._renderStatus();

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

            // 2. Decide bifurcacoes pendentes que tenham um lado de graca
            //    (tempo/espera) - escolhe Bem ou Mal, o que for de graca.
            const forks = this._getUndecidedFreeForks();
            for (const fork of forks) {
                const success = await this._decideQuest(townId, fork.name, fork.decision);
                if (success) {
                    this._decidedThisSession.add(fork.name);
                    const side = this.t(fork.decision === 'good' ? 'aq_side_good' : 'aq_side_evil');
                    const msg = this.t('aq_decided_log', { name: fork.name, side });
                    this.console.log('[AutoQuest] ' + msg);
                    uw.$('#aq_log').text(msg).css('color', '#1a6b2a');
                }
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

    /* Confirmado via captura real de rede: quando existe uma
       bifurcacao pendente com um lado de graca, escolher esse
       lado e feito via model_url "IslandQuests", action_name
       "decide", arguments: { decision: "good"|"evil",
       progressable_name: <nome> }.
       Repara que aqui e "progressable_name", nao "progressable_id"
       como no claimReward - nomes de campo diferentes confirmados
       em capturas separadas. */
    _decideQuest = async (townId, progressableName, decision) => {
        const data = {
            model_url: 'IslandQuests',
            action_name: 'decide',
            captcha: null,
            arguments: {
                decision: decision,
                progressable_name: progressableName,
            },
            town_id: townId,
            nl_init: true,
        };

        try {
            const res = await this.ajaxPostWithTimeout('frontend_bridge', 'execute', data);
            if (res && !res.error) return true;
            this.console.log('[AutoQuest] ' + this.t('aq_decide_fail_log', { name: progressableName, reason: res?.error ?? '?' }));
            return false;
        } catch (e) {
            this.console.log('[AutoQuest] ' + this.t('aq_decide_network_error', { name: progressableName, msg: e?.message ?? e }));
            return false;
        }
    };
}
