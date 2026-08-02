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
//    "claimReward", arguments: { reward_action: "stash",
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
        this._ticking = false; // FIX #4: protecao contra re-entrancia
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

    /* FIX #1 + #3: Usa uma chave composta (island_x:island_y:nome_base)
       para rastrear o que ja foi decidido nesta sessao. Isso garante
       que o mesmo "TearOffThePast" em ilhas DIFERENTES seja processado
       individualmente, enquanto a mesma missao na mesma ilha nao
       seja re-enviada.

       FIX #3: O Set agora guarda a chave composta correta, nao o
       progressable_id do modelo escolhido (que inclua sufixo). */
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
                // Chave de desduplicacao: nome_base:ilha_x:ilha_y
                const ix = m.attributes?.configuration?.island_x ?? '?';
                const iy = m.attributes?.configuration?.island_y ?? '?';

                if (name.endsWith(GOOD_SUFFIX)) {
                    const base = name.slice(0, -GOOD_SUFFIX.length);
                    const key = base + ':' + ix + ':' + iy;
                    if (!groups[key]) groups[key] = { base, ix, iy };
                    groups[key].good = m;
                } else if (name.endsWith(EVIL_SUFFIX)) {
                    const base = name.slice(0, -EVIL_SUFFIX.length);
                    const key = base + ':' + ix + ':' + iy;
                    if (!groups[key]) groups[key] = { base, ix, iy };
                    groups[key].evil = m;
                }
            }

            const result = [];
            for (const key in groups) {
                const g = groups[key];
                if (!g.good || !g.evil) continue;

                const goodIsBearEffect = g.good.attributes?.static_data?.challenge_type === 'bear_effect';
                const evilIsBearEffect = g.evil.attributes?.static_data?.challenge_type === 'bear_effect';

                let chosen, decision;
                if (goodIsBearEffect) { chosen = g.good; decision = 'good'; }
                else if (evilIsBearEffect) { chosen = g.evil; decision = 'evil'; }
                else continue; // nenhum dos dois lados e "suportar efeito" - fica de fora

                // FIX #3: chave de sessao usa nome_base:ilha, nao progressable_id com sufixo
                if (this._decidedThisSession.has(key)) continue;

                // O nome enviado no "decide" e o nome BASE (sem sufixo Good/Evil)
                // confirmado via captura: progressable_name nao inclui sufixo
                result.push({ sessionKey: key, name: g.base, decision });
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

    /* FIX #2: _getChallengeableQuests agora retorna tanto o
       progressable_id (para exibir no log) quanto o progressable_name
       (nome base, sem sufixo, para enviar na chamada de challenge).

       Tipos de desafio que o bot aceita automaticamente:
       - bear_effect ("Suportar efeito") - so precisa esperar
       - wait_time ("Aguarde ate que o tempo expire") - so conta tempo
       Os demais (spend_resources, collect_units) continuam sendo
       pulados de proposito. */
    _getChallengeableQuests() {
        try {
            const collection = uw.MM.getOnlyCollectionByName('IslandQuest');
            const models = collection?.models ?? [];
            const viable = models.filter(m => m.attributes?.state === 'viable');

            const CHALLENGEABLE_TYPES = new Set(['bear_effect', 'wait_time']);

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

            return viable
                .filter((m) => {
                    const a = m.attributes;
                    if (!CHALLENGEABLE_TYPES.has(a?.static_data?.challenge_type)) return false;
                    if (stillForked.has(a.progressable_id)) return false;
                    return true;
                })
                .map((m) => {
                    const a = m.attributes;
                    const fullId = a.progressable_id;
                    // FIX #2: extrai nome base para enviar como progressable_name no challenge
                    // Se tem sufixo Good/Evil, remove; caso contrario usa o proprio id como nome
                    let baseName = fullId;
                    if (fullId.endsWith(GOOD_SUFFIX)) baseName = fullId.slice(0, -GOOD_SUFFIX.length);
                    else if (fullId.endsWith(EVIL_SUFFIX)) baseName = fullId.slice(0, -EVIL_SUFFIX.length);

                    // FIX #1: chave de sessao inclui coordenadas de ilha para separar por ilha
                    const ix = a.configuration?.island_x ?? '?';
                    const iy = a.configuration?.island_y ?? '?';
                    const sessionKey = baseName + ':' + ix + ':' + iy;

                    return {
                        model: m,
                        displayId: fullId,
                        progressableName: baseName, // nome correto pro campo progressable_name
                        sessionKey,
                        islandX: a.configuration?.island_x,
                        islandY: a.configuration?.island_y,
                    };
                })
                .filter(q => !this._challengedThisSession.has(q.sessionKey));
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
        // FIX #4: protecao de re-entrancia - se o tick anterior ainda
        // esta rodando (muitas missoes + sleeps), ignora este ciclo.
        if (window.__multbot_captcha_active) return;
        if (this._ticking) return;
        this._ticking = true;

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

                await this.sleep(500);
            }

            // 2. Decide bifurcacoes pendentes que tenham um lado de graca
            //    (tempo/espera) - escolhe Bem ou Mal, o que for de graca.
            const forks = this._getUndecidedFreeForks();
            for (const fork of forks) {
                // FIX #3: passa fork.name (nome base) e usa fork.sessionKey pra controle
                const success = await this._decideQuest(townId, fork.name, fork.decision);
                if (success) {
                    this._decidedThisSession.add(fork.sessionKey);
                    const side = this.t(fork.decision === 'good' ? 'aq_side_good' : 'aq_side_evil');
                    const msg = this.t('aq_decided_log', { name: fork.name, side });
                    this.console.log('[AutoQuest] ' + msg);
                    uw.$('#aq_log').text(msg).css('color', '#1a6b2a');
                }
                await this.sleep(500);
            }

            // 3. Aceita (challenge) as missoes "suportar efeito" / "aguardar tempo"
            //    que ja estao decididas e prontas pra comecar.
            //    RESPEITA o limite do jogo de 3 missoes aceitas ao mesmo tempo.
            let slotsAvailable = this.MAX_ACCEPTED_QUESTS - this._getAcceptedQuestCount();

            const now = Date.now();
            const shouldLogFull = (now - this._lastFullLogAt) > 180000;

            if (slotsAvailable <= 0) {
                if (shouldLogFull) {
                    this.console.log('[AutoQuest] ' + this.t('aq_max_accepted_log', { max: this.MAX_ACCEPTED_QUESTS }));
                    this._lastFullLogAt = now;
                }
            } else {
                const challengeable = this._getChallengeableQuests();
                for (const quest of challengeable) {
                    if (slotsAvailable <= 0) {
                        if (shouldLogFull) {
                            this.console.log('[AutoQuest] ' + this.t('aq_max_accepted_log', { max: this.MAX_ACCEPTED_QUESTS }));
                            this._lastFullLogAt = now;
                        }
                        break;
                    }

                    const islandX = quest.islandX;
                    const islandY = quest.islandY;
                    const townOnIsland = (islandX != null && islandY != null)
                        ? this._findTownOnIsland(islandX, islandY)
                        : null;

                    if (!townOnIsland) {
                        this.console.log('[AutoQuest] ' + this.t('aq_no_town_on_island_log', { name: quest.displayId }));
                    }
                    const challengeTownId = townOnIsland ?? townId;

                    // FIX #2: usa quest.progressableName (nome base, sem sufixo)
                    const success = await this._challengeQuest(challengeTownId, quest.progressableName);
                    if (success) {
                        // FIX #1: chave de sessao inclui ilha
                        this._challengedThisSession.add(quest.sessionKey);
                        slotsAvailable--;
                        const msg = this.t('aq_challenged_log', { name: quest.displayId });
                        this.console.log('[AutoQuest] ' + msg);
                        uw.$('#aq_log').text(msg).css('color', '#1a6b2a');
                    }
                    await this.sleep(500);
                }
            }

            this._renderStatus();
        } catch (e) {
            this.console.log('[AutoQuest] ' + this.t('aas_tick_error', { msg: e?.message ?? e }));
        } finally {
            // FIX #4: libera o lock independente de erro ou sucesso
            this._ticking = false;
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
       progressable_name: <nome_base_sem_sufixo> }.
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
       { challenge: { current_town_id: true }, progressable_name: <nome_base> }.
       FIX #2: o campo e progressable_name (nome base, sem sufixo
       Good/Evil), nao progressable_id. */
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

    // FIX #1+3: Sets movidos para fora do constructor - inicializados aqui
    // como class fields pra garantir que sao criados uma unica vez por instancia
    _decidedThisSession = new Set();
    _challengedThisSession = new Set();
};
