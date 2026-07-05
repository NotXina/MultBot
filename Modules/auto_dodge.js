// ══════════════════════════════════════════════════════
//  MODULE: AutoDodge
//  Detecta ataques chegando. Duas camadas de seguranca:
//  1) Agenda setTimeout preciso para ~15s antes do impacto.
//  2) A cada tick (15s), tambem checa diretamente se algum
//     ataque ja esta dentro da janela critica - protege
//     contra o setTimeout ter sido perdido por um reload
//     de pagina (ex: Auto Refresh) no meio do caminho.
//  Envia para QUALQUER cidade na MESMA ILHA, terrestres e
//  navais SEPARADAMENTE, e traz de volta automaticamente
//  depois (cancelCommand). Logs verbosos em toda tentativa.
// ══════════════════════════════════════════════════════
class AutoDodge extends ModernUtil {
    EVACUATE_LEAD_SECONDS = 15;
    RECALL_BUFFER_SECONDS = 20;
    CAPTURE_DELAY_MS = 2500;

    constructor(c, s) {
        super(c, s);
        this._active = false;
        this._intervalId = null;
        this._scheduledEvac = new Map();
        this._evacuated = new Set();
        this._pendingRecalls = new Map();

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
            this.getTitleHtml('dodge_title', 'Auto Dodge', this.toggle, '', this._active) +
            '<div style="padding:5px 10px;font-weight:bold;" title="Envia reforco para qualquer cidade da ilha. Se nenhuma existir, a evacuacao e pulada.">' +
            'Evacua tropas ' + this.EVACUATE_LEAD_SECONDS + 's antes do impacto para uma cidade aleatoria na mesma ilha, com retorno automatico.' +
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
        this._intervalId = setInterval(() => {
            this._tick();
        }, 15000);
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

        for (const entry of this._pendingRecalls.values()) {
            clearTimeout(entry.timeoutId);
        }
        this._pendingRecalls.clear();
        this._evacuated.clear();

        this._updateTitle();
        this.console.log('[AutoDodge] Parado.');
    }

    _updateTitle() {
        const filter = this._active ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '';
        uw.$('#dodge_title').css('filter', filter);
    }

    /* Roda a cada 15s. Faz DUAS coisas:
       1) Para ataques novos com muito tempo pela frente, agenda um
          setTimeout preciso para EVACUATE_LEAD_SECONDS antes do impacto.
       2) Para QUALQUER ataque (novo ou ja agendado antes) cujo tempo
          restante ja esteja dentro da janela critica, evacua NA HORA
          - isso funciona como rede de seguranca caso o setTimeout
          agendado tenha sido perdido (ex: reload de pagina pelo
          Auto Refresh no meio do caminho). */
    _tick() {
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

                // ── REDE DE SEGURANCA: se ja esta dentro da janela critica,
                //    evacua AGORA, nao importa se ja havia um timer agendado
                //    ou nao (protege contra reload que apagou o setTimeout) ──
                if (remaining <= this.EVACUATE_LEAD_SECONDS) {
                    if (this._scheduledEvac.has(townId)) {
                        clearTimeout(this._scheduledEvac.get(townId));
                        this._scheduledEvac.delete(townId);
                    }
                    this._evacuated.add(townId);
                    this.console.log('[AutoDodge] REDE DE SEGURANCA: ' + this._getTownName(townId) + ' esta a ' + remaining + 's do impacto - evacuando imediatamente (tick).');
                    this._evacuateTown(townId, arrival);
                    continue;
                }

                // ── Caso normal: ainda ha tempo, agenda o timer preciso ──
                if (this._scheduledEvac.has(townId)) continue;

                const fireInMs = (remaining - this.EVACUATE_LEAD_SECONDS) * 1000;

                const timeoutId = setTimeout(() => {
                    this._scheduledEvac.delete(townId);
                    if (this._evacuated.has(townId)) return; // ja evacuada pela rede de seguranca de algum tick anterior
                    this._evacuated.add(townId);
                    this._evacuateTown(townId, arrival);
                }, fireInMs);

                this._scheduledEvac.set(townId, timeoutId);

                const townLabel = this._getTownName(townId);
                const secLeft = Math.round(fireInMs / 1000);
                this.console.log('[AutoDodge] Evacuacao agendada: ' + townLabel + ' em ' + secLeft + 's (' + this.EVACUATE_LEAD_SECONDS + 's antes do impacto).');
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

    /* Escolhe aleatoriamente QUALQUER cidade na mesma ilha da cidade
       atacada, de qualquer jogador (usa a colecao global "Town", que
       cacheia todas as cidades carregadas no cliente - nao apenas as
       suas). Retorna null se nao houver nenhuma cidade conhecida na
       mesma ilha. Loga o "dono" (player_id) da cidade escolhida, para
       ajudar a diagnosticar se o envio falha por regra de alianca. */
    _pickRandomTownOnSameIsland(attackedTownId) {
        try {
            const attackedTown = uw.ITowns.towns[attackedTownId];
            if (!attackedTown || !attackedTown.attributes) return null;

            const ix = attackedTown.attributes.island_x;
            const iy = attackedTown.attributes.island_y;

            const collection = uw.MM.getOnlyCollectionByName('Town');
            const allTowns = collection && collection.models ? collection.models : [];
            const candidates = [];

            for (const t of allTowns) {
                if (!t || !t.attributes) continue;

                const tid = t.attributes.id !== undefined ? t.attributes.id : t.id;
                if (tid === undefined || tid === null) continue;
                if (String(tid) === String(attackedTownId)) continue;

                if (t.attributes.island_x === ix && t.attributes.island_y === iy) {
                    candidates.push({ id: tid, player_id: t.attributes.player_id });
                }
            }

            if (candidates.length === 0) return null;
            const randomIndex = Math.floor(Math.random() * candidates.length);
            const chosen = candidates[randomIndex];

            this.console.log('[AutoDodge] Candidatas na mesma ilha: ' + candidates.length + '. Escolhida: #' + chosen.id + ' (player_id: ' + chosen.player_id + ').');

            return chosen.id;
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

    async _evacuateTown(townId, attackArrival) {
        try {
            const town = uw.ITowns.towns[townId];
            if (!town) {
                this.console.log('[AutoDodge] Aviso: cidade #' + townId + ' nao encontrada em ITowns.towns no momento da evacuacao.');
                return;
            }

            const townName = town.getName ? town.getName() : ('#' + townId);
            const safeTownId = this._pickRandomTownOnSameIsland(townId);

            if (!safeTownId) {
                this.console.log('[AutoDodge] Aviso: ' + townName + ' - nenhuma cidade conhecida na mesma ilha. Evacuacao pulada.');
                uw.$('#dodge_log').text('Aviso: ' + townName + ' sem cidade na mesma ilha.').css('color', '#eab308');
                return;
            }

            const safeTownName = this._getTownName(safeTownId);
            const split = this._splitUnitsByType(town);
            const landUnits = split.landUnits;
            const navalUnits = split.navalUnits;
            const hasLand = Object.keys(landUnits).length > 0;
            const hasNaval = Object.keys(navalUnits).length > 0;

            this.console.log('[AutoDodge] Tropas em ' + townName + ' - terrestres: ' + JSON.stringify(landUnits) + ' | navais: ' + JSON.stringify(navalUnits));

            if (!hasLand && !hasNaval) {
                this.console.log('[AutoDodge] ' + townName + ': sem tropas para evacuar.');
                return;
            }

            this.console.log('[AutoDodge] Evacuando ' + townName + ' para ' + safeTownName + '...');

            const excludeIds = new Set();

            if (hasLand) {
                try {
                    const landRes = await this._sendUnits(townId, safeTownId, landUnits, 'terrestre');
                    this.console.log('[AutoDodge] Resposta do servidor (terrestre): ' + JSON.stringify(landRes));

                    await this.sleep(this.CAPTURE_DELAY_MS);
                    const landCommandId = this._findSupportCommandId(townId, safeTownId, excludeIds);

                    if (landCommandId) {
                        excludeIds.add(String(landCommandId));
                        this._scheduleRecall(townId, townName, attackArrival, landCommandId, 'terrestre');
                    } else {
                        this.console.log('[AutoDodge] Aviso: ' + townName + ' - id do comando terrestre nao encontrado. Recall manual necessario.');
                    }
                } catch (e) {
                    const msg = e && e.message ? e.message : e;
                    this.console.log('[AutoDodge] FALHA ao enviar terrestres de ' + townName + ': ' + msg);
                }
            } else {
                this.console.log('[AutoDodge] ' + townName + ': sem tropas terrestres, pulando esse grupo.');
            }

            if (hasNaval) {
                try {
                    const navalRes = await this._sendUnits(townId, safeTownId, navalUnits, 'naval');
                    this.console.log('[AutoDodge] Resposta do servidor (naval): ' + JSON.stringify(navalRes));

                    await this.sleep(this.CAPTURE_DELAY_MS);
                    const navalCommandId = this._findSupportCommandId(townId, safeTownId, excludeIds);

                    if (navalCommandId) {
                        excludeIds.add(String(navalCommandId));
                        this._scheduleRecall(townId, townName, attackArrival, navalCommandId, 'naval');
                    } else {
                        this.console.log('[AutoDodge] Aviso: ' + townName + ' - id do comando naval nao encontrado. Recall manual necessario.');
                    }
                } catch (e) {
                    const msg = e && e.message ? e.message : e;
                    this.console.log('[AutoDodge] FALHA ao enviar navais de ' + townName + ': ' + msg);
                }
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
            this.console.log('[AutoDodge] Erro geral ao evacuar #' + townId + ': ' + msg);
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
                if (String(mv.origin_town_id) !== String(fromTownId)) continue;
                if (String(mv.target_town_id) !== String(toTownId)) continue;

                const id = mv.id ? mv.id : (mv.command_id ? mv.command_id : key);
                if (excluded.has(String(id))) continue;

                return id;
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    _scheduleRecall(townId, townName, attackArrival, commandId, label) {
        const now = Math.floor(Date.now() / 1000);
        const rawSec = (attackArrival - now) + this.RECALL_BUFFER_SECONDS;
        const fireInSec = rawSec > this.RECALL_BUFFER_SECONDS ? rawSec : this.RECALL_BUFFER_SECONDS;
        const fireInMs = fireInSec * 1000;
        const recallKey = townId + ':' + label;

        this.console.log('[AutoDodge] ' + townName + ' (' + label + '): retorno agendado para daqui a ' + fireInSec + 's (comando #' + commandId + ').');

        const timeoutId = setTimeout(() => {
            this._pendingRecalls.delete(recallKey);
            this._recallSupport(townId, townName, commandId, label);
        }, fireInMs);

        this._pendingRecalls.set(recallKey, { timeoutId: timeoutId, commandId: commandId });
    }

    _recallSupport(townId, townName, commandId, label) {
        const data = {
            model_url: 'Commands',
            action_name: 'cancelCommand',
            captcha: null,
            arguments: { id: commandId },
        };

        this.console.log('[AutoDodge] ' + townName + ' (' + label + '): chamando as tropas de volta (comando #' + commandId + ')...');

        uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data, false,
            function (res) {
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
            }.bind(this),
            function (err) {
                this.console.log('[AutoDodge] Erro de rede no recall de ' + townName + ' (' + label + '): ' + err);
            }.bind(this)
        );
    }

    _sendUnits(fromTownId, toTownId, units, label) {
        return this._withTownId(fromTownId, () => {
            return new Promise((resolve, reject) => {
                const data = Object.assign(
                    { id: parseInt(toTownId, 10), type: 'support' },
                    units
                );

                this.console.log('[AutoDodge] Enviando (' + label + ') - payload: ' + JSON.stringify(data));

                uw.gpAjax.ajaxPost('town_info', 'send_units', data, false,
                    function (res) {
                        if (res && res.success !== false) {
                            resolve(res);
                        } else {
                            reject(new Error('Servidor recusou: ' + JSON.stringify(res)));
                        }
                    },
                    function (r, status, txt) {
                        reject(new Error('Erro de rede: ' + txt));
                    }
                );
            });
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

    _getTownName(townId) {
        if (!townId) return String(townId);

        const id = parseInt(townId);
        const ids = String(townId);

        try {
            const towns = uw.ITowns && uw.ITowns.towns ? uw.ITowns.towns : {};
            const t1 = towns[id] ? towns[id] : towns[ids];
            if (t1) return t1.getName() + ' (#' + ids + ')';

            const collection = uw.MM.getOnlyCollectionByName('Town');
            const allTowns = collection && collection.models ? collection.models : [];

            for (const t of allTowns) {
                const tid = t.attributes && t.attributes.id ? t.attributes.id : t.id;
                if (parseInt(tid) === id) {
                    const name = t.attributes && t.attributes.name ? t.attributes.name : '?';
                    return name + ' (#' + ids + ')';
                }
            }

            const wmapTowns = uw.WMap && uw.WMap.towns ? uw.WMap.towns : {};
            const wt = wmapTowns[id] ? wmapTowns[id] : wmapTowns[ids];
            if (wt && wt.name) return wt.name + ' (#' + ids + ')';
        } catch (e) {}

        return '#' + ids;
    }
}
