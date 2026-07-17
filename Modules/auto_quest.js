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
var AutoQuest = class extends MultUtil {
    // Limite do proprio jogo: so e possivel ter 3 missoes aceitas
    // (em andamento ou prontas pra reivindicar) ao mesmo tempo.
    MAX_ACCEPTED_QUESTS = 3;

    constructor(c, s) {
        super(c, s);
        this._active = false;
        this._interval = null;
        this._decidedThisSession = new Set();
        this._challengedThisSession = new Set();
        // Controla o throttling da mensagem "3/3 vagas cheias" - so
        // loga a cada X minutos em vez de todo ciclo de 20s, pra nao
        // atravancar o console (missoes aceitas demoram bem mais que
        // 20s pra concluir, entao checar/logar com essa frequencia
        // so gera ruido sem necessidade).
        this._lastFullLogAt = 0;

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

    /* Conta quantas missoes ja estao ocupando uma vaga - "running"
       (em andamento) OU "satisfied" (pronta mas ainda nao
       reivindicada, ainda ocupa a vaga ate ser reivindicada). O
       jogo so permite 3 vagas ao mesmo tempo - MAX_ACCEPTED_QUESTS. */
    _getAcceptedQuestCount() {
        try {
            const collection = uw.MM.getOnlyCollectionByName('IslandQuest');
            const models = collection?.models ?? [];
            return models.filter(m => {
                const s = m.attributes?.state;
                return s === 'running' || s === 'satisfied';
            }).length;
        } catch (e) {
            return this.MAX_ACCEPTED_QUESTS; // erro ao ler -> assume cheio, nao arrisca
        }
    }

    /* Algumas missoes de ilha vem em pares "Bem" (Good) e "Mal"
       (Evil) pro mesmo evento (ex: TearOffThePastGoodIslandQuest
       / TearOffThePastEvilIslandQuest). Confirmado via captura
       real: enquanto nenhum lado foi escolhido, os DOIS aparecem
       com state "viable" ao mesmo tempo. Escolher e feito via
       model_url "IslandQuests", action_name "decide", arguments:
       { decision: "good"|"evil", progressable_name: <nome> }.
       So considera que existe uma bifurcacao pendente quando os
       DOIS lados (Bem e Mal) aparecem juntos como "viable" - se
       so um lado existir, trata como missao normal (sem decidir
       nada), pra nao arriscar chamar "decide" em algo que nao
       precisa.
       IMPORTANTE: so decide automaticamente o lado cujo
       static_data.challenge_type seja "bear_effect" ("Suportar
       efeito" - fica so esperando um efeito, sem gastar nada).
       Confirmado via captura real de dados completos da
       IslandQuest (F12): esse campo e MUITO mais confiavel que
       tentar adivinhar pelo formato de "progress" - descobrimos
       que missoes do tipo "collect_units" (enviar tropas) tambem
       aparecem com progress vazio enquanto "viable" (o requisito
       so populada depois que voce comeca a mandar apoio), o que
       fazia a heuristica antiga (checar progress.units/resources)
       escolher errado. Se NENHUM dos dois lados for "bear_effect",
       fica de fora - decisao fica pra voce fazer manualmente. */
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

                const goodIsBearEffect = g.good.attributes?.static_data?.challenge_type === 'bear_effect';
                const evilIsBearEffect = g.evil.attributes?.static_data?.challenge_type === 'bear_effect';

                let chosen, decision;
                if (goodIsBearEffect) { chosen = g.good; decision = 'good'; }
                else if (evilIsBearEffect) { chosen = g.evil; decision = 'evil'; }
                else continue; // nenhum dos dois lados e "suportar efeito" - fica de fora

                const name = chosen.attributes.progressable_id;
                if (this._decidedThisSession.has(name)) continue;

                result.push({ name, decision });
            }
            return result;
        } catch (e) {
            return [];
        }
    }

    /* Procura uma cidade SUA que fique na mesma ilha da missao
       (mesma island_x/island_y). Confirmado por relato real: a
       chamada de "challenge" (aceitar o desafio) so funciona quando
       feita a partir de uma cidade na ilha certa - por isso o jogo
       exige "ir ate a cidade da quest" manualmente na UI nativa.
       Aqui o bot acha essa cidade sozinho, sem precisar de
       navegacao manual. */
    _findTownOnIsland(islandX, islandY) {
        try {
            const towns = uw.ITowns.towns;
            for (const id in towns) {
                const t = towns[id];
                if (t.getIslandCoordinateX() === islandX && t.getIslandCoordinateY() === islandY) {
                    return id;
                }
            }
        } catch (e) {}
        return null;
    }

    /* Missoes "bear_effect" que estao "viable" e prontas pra receber
       o "challenge" (segundo aceite, depois do decide) - exclui as
       que ainda fazem parte de uma bifurcacao Bem/Mal NAO decidida
       (os dois lados ainda viable ao mesmo tempo), ja que nesse caso
       "challenge" ainda nao faz sentido - precisa decidir primeiro. */
    _getChallengeableBearEffectQuests() {
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
                    groups[base].good = true;
                } else if (name.endsWith(EVIL_SUFFIX)) {
                    const base = name.slice(0, -EVIL_SUFFIX.length);
                    if (!groups[base]) groups[base] = {};
                    groups[base].evil = true;
                }
            }
            const stillForked = new Set();
            for (const base in groups) {
                if (groups[base].good && groups[base].evil) {
                    stillForked.add(base + GOOD_SUFFIX);
                    stillForked.add(base + EVIL_SUFFIX);
                }
            }

            return viable.filter((m) => {
                const a = m.attributes;
                if (a?.static_data?.challenge_type !== 'bear_effect') return false;
                if (stillForked.has(a.progressable_id)) return false;
                if (this._challengedThisSession.has(a.progressable_id)) return false;
                return true;
            });
        } catch (e) {
            return [];
        }
    }

    _renderStatus() {
        try {
            const quests = this._getSatisfiedQuests();
            const forks = this._getUndecidedFreeForks();
            const accepted = this._getAcceptedQuestCount();
            let html = this.t('aq_accepted_count', { count: accepted, max: this.MAX_ACCEPTED_QUESTS });
            html += ' | ' + this.t('aq_ready_count', { count: quests.length });
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

            // 3. Aceita (challenge) as missoes "suportar efeito" que ja
            //    estao decididas e prontas pra comecar - precisa ser
            //    feito a partir de uma cidade na MESMA ilha da missao.
            //    RESPEITA o limite do jogo de 3 missoes aceitas ao
            //    mesmo tempo (running + satisfied ocupam vaga).
            let slotsAvailable = this.MAX_ACCEPTED_QUESTS - this._getAcceptedQuestCount();

            // Throttling: so loga "vagas cheias" a cada 3 minutos, nao
            // todo ciclo de 20s - missoes aceitas demoram bem mais que
            // isso pra concluir, entao repetir esse log com tanta
            // frequencia so atravanca o console sem necessidade.
            const now = Date.now();
            const shouldLogFull = (now - this._lastFullLogAt) > 180000;

            if (slotsAvailable <= 0) {
                if (shouldLogFull) {
                    this.console.log('[AutoQuest] ' + this.t('aq_max_accepted_log', { max: this.MAX_ACCEPTED_QUESTS }));
                    this._lastFullLogAt = now;
                }
            } else {
                const challengeable = this._getChallengeableBearEffectQuests();
                for (const quest of challengeable) {
                    if (slotsAvailable <= 0) {
                        if (shouldLogFull) {
                            this.console.log('[AutoQuest] ' + this.t('aq_max_accepted_log', { max: this.MAX_ACCEPTED_QUESTS }));
                            this._lastFullLogAt = now;
                        }
                        break;
                    }

                    const name = quest.attributes.progressable_id;
                    const islandX = quest.attributes.configuration?.island_x;
                    const islandY = quest.attributes.configuration?.island_y;
                    const townOnIsland = (islandX != null && islandY != null) ? this._findTownOnIsland(islandX, islandY) : null;

                    if (!townOnIsland) {
                        this.console.log('[AutoQuest] ' + this.t('aq_no_town_on_island_log', { name }));
                    }
                    const challengeTownId = townOnIsland ?? townId;

                    const success = await this._challengeQuest(challengeTownId, name);
                    if (success) {
                        this._challengedThisSession.add(name);
                        slotsAvailable--;
                        const msg = this.t('aq_challenged_log', { name });
                        this.console.log('[AutoQuest] ' + msg);
                        uw.$('#aq_log').text(msg).css('color', '#1a6b2a');
                    }
                    await this.sleep(500);
                }
            }

            this._renderStatus();
        } catch (e) {
            this.console.log('[AutoQuest] ' + this.t('aas_tick_error', { msg: e?.message ?? e }));
        }
    }

    /* Confirmado via captura real de rede:
       model_url: "IslandQuests", action_name: "claimReward",
       arguments: { reward_action: "stash", state: "closed",
       progressable_id: <id> }, town_id, nl_init:true.
       reward_action: "stash" guarda a recompensa pra usar depois,
       em vez de "use" (que usaria na hora). */
    _claimReward = async (townId, progressableId) => {
        const data = {
            model_url: 'IslandQuests',
            action_name: 'claimReward',
            captcha: null,
            arguments: {
                reward_action: 'stash',
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

    /* Confirmado via captura real de rede: o "segundo aceite" (aceitar
       o desafio pra a missao ja decidida comecar a valer) e feito via
       model_url "IslandQuests", action_name "challenge", arguments:
       { challenge: { current_town_id: true }, progressable_name: <nome> }.
       O town_id enviado precisa ser uma cidade sua na MESMA ilha da
       missao - foi confirmado que a UI nativa exige "ir ate a cidade
       da quest" antes de aceitar; aqui isso e resolvido automaticamente
       via _findTownOnIsland, sem precisar de navegacao manual. */
    _challengeQuest = async (townId, progressableName) => {
        const data = {
            model_url: 'IslandQuests',
            action_name: 'challenge',
            captcha: null,
            arguments: {
                challenge: { current_town_id: true },
                progressable_name: progressableName,
            },
            town_id: townId,
            nl_init: true,
        };

        try {
            const res = await this.ajaxPostWithTimeout('frontend_bridge', 'execute', data);
            if (res && !res.error) return true;
            this.console.log('[AutoQuest] ' + this.t('aq_challenge_fail_log', { name: progressableName, reason: res?.error ?? '?' }));
            return false;
        } catch (e) {
            this.console.log('[AutoQuest] ' + this.t('aq_challenge_network_error', { name: progressableName, msg: e?.message ?? e }));
            return false;
        }
    };
};
