// ══════════════════════════════════════════════════════
//  MODULE: AutoDodge
//  Detecta ataques chegando e agenda a evacuacao das tropas
//  para exatamente ~15s antes do impacto - enviando para
//  QUALQUER cidade na MESMA ILHA (cacheada em uw.ITowns.towns
//  + aprendizado passivo de ilhas), terrestres e navais
//  SEPARADAMENTE - e traz de volta automaticamente depois
//  (cancelCommand).
//
//  PDCA - correcoes desta rodada:
//  1) CRITICO: recalls pendentes agora sao PERSISTIDOS no storage
//     (dodge_pending_recalls). Antes, se a pagina recarregasse
//     (ex: Auto Refresh) entre a evacuacao e o recall, o setTimeout
//     em memoria era perdido e as tropas ficavam em apoio para
//     sempre. Agora, no carregamento do modulo, qualquer recall
//     pendente e reconciliado: se ja deveria ter disparado, dispara
//     na hora; senao, reagenda o tempo restante.
//  2) Chamadas de rede (envio de tropas, cancelCommand) usam
//     this.ajaxPostWithTimeout (herdado de MultUtil) - evita
//     Promise pendurada para sempre se a rede travar.
//  3) O tick principal roda via this.createGuardedInterval - evita
//     dois ciclos rodando ao mesmo tempo sobre o mesmo estado.
//  4) _getTownName foi removido - usa this.getTownName (herdado de
//     MultUtil), eliminando a duplicacao dessa logica.
// ══════════════════════════════════════════════════════
var AutoDodge = class extends MultUtil {
    EVACUATE_LEAD_SECONDS = 15;
    RECALL_BUFFER_SECONDS = 20;
    CAPTURE_DELAY_MS = 2500;
    ISLAND_SCRAPE_DELAY_MS = 400;

    constructor(c, s) {
        super(c, s);
        this._active = false;
        this._intervalId = null;
        this._scheduledEvac = new Map();
        this._evacuated = new Set();
        this._pendingRecalls = new Map();
        this._islandScraperObserver = null;

        this._islandCache = this.storage.load('dodge_island_cache', {});

        // Reconciliacao de recalls pendentes acontece SEMPRE, mesmo
        // que o modulo esteja desativado - se ha uma tropa em apoio
        // esperando para ser chamada de volta, isso deve acontecer
        // independente do estado do toggle.
        this._reconcilePendingRecalls();

        if (this.storage.load('dodge_active', false)) {
            setTimeout(() => {
                this.start();
            }, 2000);
        }
    }

    settings = () => {
        requestAnimationFrame(() => {
            this._updateTitle();
        });
        return (
            '<div class="game_border" style="margin-bottom:20px;">' +
            '<div class="game_border_top"></div><div class="game_border_bottom"></div>' +
            '<div class="game_border_left"></div><div class="game_border_right"></div>' +
            '<div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>' +
            '<div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>' +
            this.getTitleHtml('dodge_title', 'Auto Fuga (Dodge)', this.toggle, '', this._active) +
            '<div style="padding:5px 10px;font-weight:bold;" title="Envia reforco para qualquer cidade conhecida da ilha. Se nenhuma existir no cache, a evacuacao e pulada.">' +
            'Evacua tropas ' + this.EVACUATE_LEAD_SECONDS + 's antes do impacto para uma cidade aleatoria na mesma ilha, com retorno automatico.' +
            '</div>' +
            '<div id="dodge_log" style="padding:2px 10px 8px;font-size:11px;color:#5a3a0a;min-height:16px;"></div>' +
            '</div>'
        );
    };

    toggle = () => {
        if (this._active) {
            this.stop();
        } else {
            this.start();
        }
    };

    start() {
        if (this._active) return;
        this._active = true;
        this.storage.save('dodge_active', true);
        this._updateTitle();
        this.console.log('[AutoDodge] Iniciado. Monitorando ataques...');
        this._tick();
        this._intervalId = this.createGuardedInterval(() => this._tick(), 15000);
        this._setupIslandScraper();
    }

    stop() {
        this._active = false;
        this.storage.save('dodge_active', false);

        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }

        for (const timeoutId of this._scheduledEvac.values()) {
            clearTimeout(timeoutId);
        }
        this._scheduledEvac.clear();

        // IMPORTANTE: so cancelamos os TIMERS locais aqui. Os recalls
        // persistidos no storage NAO sao apagados - eles continuam
        // validos e serao reconciliados/disparados na proxima vez que
        // o modulo for carregado (constructor), mesmo que o usuario
        // reative o toggle depois.
        for (const entry of this._pendingRecalls.values()) {
            clearTimeout(entry.timeoutId);
        }
        this._pendingRecalls.clear();
        this._evacuated.clear();

        this._teardownIslandScraper();

        this._updateTitle();
        this.console.log('[AutoDodge] Parado.');
    }

    _updateTitle() {
        const filter = this._active ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '';
        uw.$('#dodge_title').css('filter', filter);
    }

    _setupIslandScraper() {
        if (this._islandScraperObserver) return;

        this._islandScraperObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (!node || node.nodeType !== 1) continue;

                    let links = [];
                    try {
                        if (node.matches && node.matches('a.gp_town_link')) {
                            links = [node];
                        } else if (node.querySelectorAll) {
                            links = Array.from(node.querySelectorAll('a.gp_town_link'));
                        }
                    } catch (e) { continue; }

                    if (links.length > 0) {
                        setTimeout(() => this._harvestTownLinks(links), this.ISLAND_SCRAPE_DELAY_MS);
                    }
                }
            }
        });

        this._islandScraperObserver.observe(document.body, { childList: true, subtree: true });
        this.console.log('[AutoDodge] Aprendizado de ilhas ativo (observando janelas abertas no mapa).');
    }

    _teardownIslandScraper() {
        if (this._islandScraperObserver) {
            this._islandScraperObserver.disconnect();
            this._islandScraperObserver = null;
        }
    }

    _harvestTownLinks(links) {
        let added = 0;

        for (const el of links) {
            try {
                const href = el.getAttribute('href') || '';
                const match = href.match(/#([A-Za-z0-9+/=]{8,})/);
                if (!match) continue;

                const decoded = JSON.parse(atob(match[1]));
                if (decoded.tp !== 'town') continue;
                if (!decoded.id || decoded.ix === undefined || decoded.iy === undefined) continue;

                const key = decoded.ix + ',' + decoded.iy;
                if (!this._islandCache[key]) this._islandCache[key] = {};

                const idStr = String(decoded.id);
                if (!this._islandCache[key][idStr]) {
                    this._islandCache[key][idStr] = { id: decoded.id, name: decoded.name || ('#' + decoded.id) };
                    added++;
                }
            } catch (e) {
                // link nao decodificavel, ignora
            }
        }

        if (added > 0) {
            this.storage.save('dodge_island_cache', this._islandCache);
            this.console.log('[AutoDodge] Aprendidas ' + added + ' cidade(s) nova(s) no cache de ilhas.');
        }
    }

    /* Tick assincrono - roda dentro do createGuardedInterval, entao
       nunca sobrepoe outro ciclo em andamento. */
    async _tick() {
        if (window.__multbot_captcha_active) return;

        try {
            const attacks = this._getIncomingAttacks();
            const now = Math.floor(Date.now() / 1000);
            const byTown = new Map();

            for (const atk of attacks) {
                const townId = String(atk.target_town_id);
                const arrival = atk.arrival_at ? atk.arrival_at : (atk.time_of_arrival ? atk.time_of_arrival : 0);
                if (!arrival) continue;

                if (!byTown.has(townId) || arrival > byTown.get(townId)) {
                    byTown.set(townId, arrival);
                }
            }

            const attackedTowns = new Set(byTown.keys());

            for (const townId of this._scheduledEvac.keys()) {
                if (!attackedTowns.has(townId)) {
                    clearTimeout(this._scheduledEvac.get(townId));
                    this._scheduledEvac.delete(townId);
                }
            }

            for (const townId of this._evacuated) {
                if (!attackedTowns.has(townId)) {
                    this._evacuated.delete(townId);
                }
            }

            for (const entry of byTown) {
                const townId = entry[0];
                const arrival = entry[1];

                if (this._evacuated.has(townId)) continue;

                const remaining = arrival - now;
                const townLabel = this.getTownName(townId);

                if (remaining <= this.EVACUATE_LEAD_SECONDS) {
                    if (this._scheduledEvac.has(townId)) {
                        clearTimeout(this._scheduledEvac.get(townId));
                        this._scheduledEvac.delete(townId);
                    }
                    this._evacuated.add(townId);

                    const safeTownId = this._pickRandomTownOnSameIsland(townId);
                    this.console.log('[AutoDodge] Rede de seguranca: ' + townLabel + ' esta a ' + remaining + 's do impacto - evacuando imediatamente.');
                    this._evacuateTown(townId, arrival, safeTownId);
                    continue;
                }

                if (this._scheduledEvac.has(townId)) continue;

                const safeTownId = this._pickRandomTownOnSameIsland(townId);
                const fireInMs = (remaining - this.EVACUATE_LEAD_SECONDS) * 1000;

                const timeoutId = setTimeout(() => {
                    this._scheduledEvac.delete(townId);
                    if (this._evacuated.has(townId)) return;
                    this._evacuated.add(townId);
                    this._evacuateTown(townId, arrival, safeTownId);
                }, fireInMs);

                this._scheduledEvac.set(townId, timeoutId);

                const secLeft = Math.round(fireInMs / 1000);
                if (safeTownId) {
                    const safeTownLabel = this.getTownName(safeTownId);
                    this.console.log('[AutoDodge] Evacuacao agendada: ' + townLabel + ' -> ' + safeTownLabel + ' em ' + secLeft + 's (' + this.EVACUATE_LEAD_SECONDS + 's antes do impacto).');
                } else {
                    this.console.log('[AutoDodge] Aviso: ' + townLabel + ' agendada em ' + secLeft + 's, mas SEM cidade conhecida na mesma ilha ainda.');
                }
            }
        } catch (e) {
            const msg = e && e.message ? e.message : e;
            this.console.log('[AutoDodge] Erro no tick: ' + msg);
        }
    }

    _getIncomingAttacks() {
        try {
            const models = uw.MM.getModels().MovementsUnits;
            if (!models) return [];

            const attacks = [];
            for (const key in models) {
                const mv = models[key].attributes;
                if (!mv) continue;
                const isAttack = mv.type === 'attack' || mv.type === 'attack_with_spy';
                const targetExists = uw.ITowns && uw.ITowns.towns && uw.ITowns.towns[mv.target_town_id];
                if (isAttack && targetExists) {
                    attacks.push(mv);
                }
            }
            return attacks;
        } catch (e) {
            return [];
        }
    }

    _pickRandomTownOnSameIsland(attackedTownId) {
        try {
            const attackedTown = uw.ITowns.towns[attackedTownId];
            if (!attackedTown || typeof attackedTown.getIslandCoordinateX !== 'function') return null;

            const ix = attackedTown.getIslandCoordinateX();
            const iy = attackedTown.getIslandCoordinateY();
            const candidates = [];

            const townsObj = uw.ITowns.towns;
            for (const townId in townsObj) {
                if (String(townId) === String(attackedTownId)) continue;

                const t = townsObj[townId];
                if (!t || typeof t.getIslandCoordinateX !== 'function') continue;

                if (t.getIslandCoordinateX() === ix && t.getIslandCoordinateY() === iy) {
                    if (!candidates.includes(String(townId))) candidates.push(String(townId));
                }
            }

            const cacheKey = ix + ',' + iy;
            const cached = this._islandCache[cacheKey];
            if (cached) {
                for (const idStr in cached) {
                    if (idStr === String(attackedTownId)) continue;
                    if (!candidates.includes(idStr)) candidates.push(idStr);
                }
            }

            if (candidates.length === 0) return null;
            const randomIndex = Math.floor(Math.random() * candidates.length);
            return candidates[randomIndex];
        } catch (e) {
            const msg = e && e.message ? e.message : e;
            this.console.log('[AutoDodge] Erro ao procurar cidade na mesma ilha: ' + msg);
            return null;
        }
    }

    _splitUnitsByType(town) {
        const all = Object.assign({}, town.units());
        delete all.militia;

        const landUnits = {};
        const navalUnits = {};

        for (const unit of Object.keys(all)) {
            const count = all[unit];
            if (!count || count <= 0) continue;

            const unitData = uw.GameData.units[unit];
            const isNaval = unitData && unitData.is_naval ? true : false;

            if (isNaval) {
                navalUnits[unit] = count;
            } else {
                landUnits[unit] = count;
            }
        }

        return { landUnits: landUnits, navalUnits: navalUnits };
    }

    async _evacuateTown(townId, attackArrival, safeTownId) {
        try {
            const town = uw.ITowns.towns[townId];
            if (!town) return;

            const townName = town.getName ? town.getName() : ('#' + townId);

            if (!safeTownId) {
                safeTownId = this._pickRandomTownOnSameIsland(townId);
            }

            if (!safeTownId) {
                this.console.log('[AutoDodge] Aviso: ' + townName + ' - nenhuma cidade conhecida na mesma ilha. Evacuacao pulada.');
                uw.$('#dodge_log').text('Aviso: ' + townName + ' sem cidade na mesma ilha.').css('color', '#eab308');
                return;
            }

            const safeTownName = this.getTownName(safeTownId);
            const split = this._splitUnitsByType(town);
            const landUnits = split.landUnits;
            const navalUnits = split.navalUnits;
            const hasLand = Object.keys(landUnits).length > 0;
            const hasNaval = Object.keys(navalUnits).length > 0;

            if (!hasLand && !hasNaval) {
                this.console.log('[AutoDodge] ' + townName + ': sem tropas para evacuar.');
                return;
            }

            this.console.log('[AutoDodge] Evacuando ' + townName + ' para ' + safeTownName + '...');

            const excludeIds = new Set();

            if (hasLand) {
                await this._evacuateGroup(townId, safeTownId, landUnits, 'terrestre', townName, attackArrival, excludeIds);
            } else {
                this.console.log('[AutoDodge] ' + townName + ': sem tropas terrestres, pulando esse grupo.');
            }

            if (hasNaval) {
                await this._evacuateGroup(townId, safeTownId, navalUnits, 'naval', townName, attackArrival, excludeIds);
            } else {
                this.console.log('[AutoDodge] ' + townName + ': sem tropas navais, pulando esse grupo.');
            }

            const finalMsg = townName + ' evacuada para ' + safeTownName + '!';
            this.console.log('[AutoDodge] ' + finalMsg);
            uw.$('#dodge_log').text(finalMsg).css('color', '#1a6b2a');

            if (uw.HumanMessage) {
                uw.HumanMessage.success('MultBot: ' + townName + ' -> ' + safeTownName);
            }
        } catch (e) {
            const msg = e && e.message ? e.message : e;
            this.console.log('[AutoDodge] Erro ao evacuar #' + townId + ': ' + msg);
        }
    }

    async _evacuateGroup(fromTownId, toTownId, units, label, townName, attackArrival, excludeIds) {
        try {
            const result = await this._sendUnits(fromTownId, toTownId, units);
            this.console.log('[AutoDodge] Resposta do servidor (' + label + '): ' + JSON.stringify(result));

            await this.sleep(this.CAPTURE_DELAY_MS);
            const commandId = this._findSupportCommandId(fromTownId, toTownId, excludeIds);

            if (commandId) {
                this.console.log('[AutoDodge] ' + townName + ' (' + label + '): commandId encontrado: #' + commandId);
                excludeIds.add(String(commandId));
                this._scheduleRecall(fromTownId, townName, attackArrival, commandId, label);
            } else {
                this.console.log('[AutoDodge] Aviso: ' + townName + ' (' + label + ') - id do comando nao encontrado. Recall manual necessario.');
                uw.$('#dodge_log').text('Aviso: ' + townName + ' (' + label + ') - recall automatico indisponivel.').css('color', '#eab308');
            }
        } catch (e) {
            const msg = e && e.message ? e.message : e;
            this.console.log('[AutoDodge] FALHA ao enviar ' + label + ' de ' + townName + ': ' + msg);
        }
    }

    _findSupportCommandId(fromTownId, toTownId, excludeIds) {
        const excluded = excludeIds ? excludeIds : new Set();
        try {
            const models = uw.MM.getModels().MovementsUnits;
            if (!models) return null;

            for (const key in models) {
                const mv = models[key].attributes;
                if (!mv) continue;
                if (mv.type !== 'support') continue;
                if (String(mv.home_town_id) !== String(fromTownId)) continue;
                if (String(mv.target_town_id) !== String(toTownId)) continue;

                const cmdId = mv.command_id;
                if (!cmdId) continue;
                if (excluded.has(String(cmdId))) continue;

                return cmdId;
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    /* Agenda o recall E PERSISTE a informacao no storage. Se a pagina
       recarregar antes do timer disparar, o constructor do modulo (via
       _reconcilePendingRecalls) vai encontrar essa entrada persistida
       e cuidar dela - seja disparando na hora (se ja passou do prazo)
       ou reagendando o tempo restante. */
    _scheduleRecall(townId, townName, attackArrival, commandId, label) {
        const now = Math.floor(Date.now() / 1000);
        const rawSec = (attackArrival - now) + this.RECALL_BUFFER_SECONDS;
        const fireInSec = rawSec > this.RECALL_BUFFER_SECONDS ? rawSec : this.RECALL_BUFFER_SECONDS;
        const fireInMs = fireInSec * 1000;
        const recallKey = townId + ':' + label;
        const dueAt = Date.now() + fireInMs;

        this.console.log('[AutoDodge] ' + townName + ' (' + label + '): retorno agendado para daqui a ' + fireInSec + 's (comando #' + commandId + ').');

        this._savePendingRecall(recallKey, { townId: townId, townName: townName, commandId: commandId, label: label, dueAt: dueAt });

        const timeoutId = setTimeout(() => {
            this._pendingRecalls.delete(recallKey);
            this._removePendingRecall(recallKey);
            this._recallSupport(townId, townName, commandId, label);
        }, fireInMs);

        this._pendingRecalls.set(recallKey, { timeoutId: timeoutId, commandId: commandId });
    }

    _loadPendingRecallsStore() {
        return this.storage.load('dodge_pending_recalls', {});
    }

    _savePendingRecall(recallKey, entry) {
        const store = this._loadPendingRecallsStore();
        store[recallKey] = entry;
        this.storage.save('dodge_pending_recalls', store);
    }

    _removePendingRecall(recallKey) {
        const store = this._loadPendingRecallsStore();
        if (store[recallKey]) {
            delete store[recallKey];
            this.storage.save('dodge_pending_recalls', store);
        }
    }

    /* Roda no constructor, SEMPRE (independente do toggle ativo/inativo).
       Le os recalls persistidos no storage e garante que nenhum foi
       perdido por causa de um reload no meio do caminho: os que ja
       deveriam ter disparado, disparam agora; os que ainda tem tempo,
       sao reagendados com o tempo restante. */
    _reconcilePendingRecalls() {
        try {
            const store = this._loadPendingRecallsStore();
            const keys = Object.keys(store);
            if (keys.length === 0) return;

            this.console.log('[AutoDodge] Reconciliando ' + keys.length + ' recall(s) pendente(s) apos carregamento...');

            for (const recallKey of keys) {
                const entry = store[recallKey];
                if (!entry || !entry.commandId) {
                    this._removePendingRecall(recallKey);
                    continue;
                }

                const remaining = entry.dueAt - Date.now();

                if (remaining <= 0) {
                    this.console.log('[AutoDodge] Recall de ' + entry.townName + ' (' + entry.label + ') ja deveria ter disparado - disparando agora.');
                    this._removePendingRecall(recallKey);
                    this._recallSupport(entry.townId, entry.townName, entry.commandId, entry.label);
                } else {
                    this.console.log('[AutoDodge] Recall de ' + entry.townName + ' (' + entry.label + ') reagendado para daqui a ' + Math.round(remaining / 1000) + 's.');
                    const timeoutId = setTimeout(() => {
                        this._pendingRecalls.delete(recallKey);
                        this._removePendingRecall(recallKey);
                        this._recallSupport(entry.townId, entry.townName, entry.commandId, entry.label);
                    }, remaining);
                    this._pendingRecalls.set(recallKey, { timeoutId: timeoutId, commandId: entry.commandId });
                }
            }
        } catch (e) {
            const msg = e && e.message ? e.message : e;
            this.console.log('[AutoDodge] Erro ao reconciliar recalls pendentes: ' + msg);
        }
    }

    _recallSupport(townId, townName, commandId, label) {
        const data = {
            model_url: 'Commands',
            action_name: 'cancelCommand',
            captcha: null,
            arguments: { id: commandId },
        };

        this.console.log('[AutoDodge] ' + townName + ' (' + label + '): chamando as tropas de volta (comando #' + commandId + ')...');

        this.ajaxPostWithTimeout('frontend_bridge', 'execute', data, 15000)
            .then((res) => {
                this.console.log('[AutoDodge] Resposta do recall (' + label + '): ' + JSON.stringify(res));
                if (res && !res.error) {
                    const msg = townName + ' (' + label + '): tropas retornando!';
                    this.console.log('[AutoDodge] ' + msg);
                    uw.$('#dodge_log').text(msg).css('color', '#1a6b2a');
                    if (uw.HumanMessage) {
                        uw.HumanMessage.success('MultBot: ' + townName + ' (' + label + ') - retornando!');
                    }
                } else {
                    this.console.log('[AutoDodge] Falha ao chamar de volta ' + townName + ' (' + label + '): ' + JSON.stringify(res));
                    uw.$('#dodge_log').text('Falha no recall de ' + townName + ' (' + label + '). Traga manualmente.').css('color', '#f87171');
                }
            })
            .catch((err) => {
                this.console.log('[AutoDodge] Erro no recall de ' + townName + ' (' + label + '): ' + (err && err.message ? err.message : err));
            });
    }

    _sendUnits(fromTownId, toTownId, units) {
        return this._withTownId(fromTownId, () => {
            const data = Object.assign(
                { id: parseInt(toTownId, 10), type: 'support' },
                units
            );
            return this.ajaxPostWithTimeout('town_info', 'send_units', data, 15000);
        });
    }

    async _withTownId(townId, fn) {
        const orig = uw.Game.townId;
        const origStr = uw.Game.town_id;
        uw.Game.townId = parseInt(townId, 10);
        uw.Game.town_id = parseInt(townId, 10);

        try {
            const result = await fn();
            return result;
        } finally {
            uw.Game.townId = orig;
            uw.Game.town_id = origStr;
        }
    }
};
