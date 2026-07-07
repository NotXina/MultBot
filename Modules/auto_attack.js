// ══════════════════════════════════════════════════════
//  MODULE: AutoAttack
//  Monitora uma cidade atacante e, assim que TODAS as
//  quantidades configuradas de uma composicao de unidades
//  estiverem disponiveis, dispara ataques automaticamente
//  para uma ou mais cidades-alvo, com a composicao completa
//  em um unico envio. Reutiliza o mesmo padrao de envio
//  (send_units) ja validado no AutoDodge.
//
//  A lista de planos ativos fica dentro de um container com
//  altura MAXIMA fixa (max-height) e overflow-y:auto - isso
//  garante que, independente de quantos planos existam (1 ou
//  100), a area nunca cresce além do limite: surge uma barra
//  de rolagem propria. A janela do bot nunca precisa aumentar
//  por causa da quantidade de planos.
//
//  Periodo de descanso (cooldown) por alvo, com jitter
//  aleatorio de +-10%. Depois de atacar um alvo, ele fica
//  "de molho" pelo tempo configurado antes de ser atacado de
//  novo pelo mesmo plano - da tempo do armazem inimigo encher.
//  Descanso = 0 significa sem espera (comportamento antigo).
//
//  Planos salvos ANTES da versao com multiplas unidades usavam
//  o formato antigo (plan.unit + plan.quantity, no singular).
//  Ao carregar, migramos automaticamente qualquer plano nesse
//  formato para o novo (plan.units, array), e tambem garantimos
//  que plan.restMinutes e plan.nextAllowedAt existam.
// ══════════════════════════════════════════════════════
class AutoAttack extends ModernUtil {
    CHECK_INTERVAL_MS = 20000;
    SEND_DELAY_MS = 800;
    JITTER_PERCENT = 0.10;
    // Altura maxima da lista de planos, em pixels. Nunca cresce
    // além disso - o que passar vira rolagem interna.
    PLANS_LIST_MAX_HEIGHT = 140;

    constructor(c, s) {
        super(c, s);
        this._active = false;
        this._intervalId = null;
        this._plans = this.storage.load('attack_plans', []);
        this._stagingUnits = [];

        this._migrateOldPlans();

        if (this.storage.load('attack_active', false)) {
            setTimeout(() => {
                this.start();
            }, 2000);
        }
    }

    _migrateOldPlans() {
        let changed = false;
        const newPlans = [];

        for (const plan of this._plans) {
            let migratedPlan = plan;

            if (!Array.isArray(plan.units)) {
                if (plan.unit) {
                    changed = true;
                    migratedPlan = {
                        id: plan.id,
                        originId: plan.originId,
                        units: [
                            {
                                unit: plan.unit,
                                quantity: plan.quantity,
                                isNaval: !!plan.isNaval
                            }
                        ],
                        targets: plan.targets || [],
                        enabled: plan.enabled !== false
                    };
                    this.console.log('[AutoAttack] Plano antigo migrado: cidade #' + plan.originId + ' (' + plan.unit + ' x' + plan.quantity + ').');
                } else {
                    changed = true;
                    this.console.log('[AutoAttack] Aviso: plano invalido removido (sem unidades definidas).');
                    continue;
                }
            }

            if (typeof migratedPlan.restMinutes !== 'number') {
                migratedPlan.restMinutes = 0;
                changed = true;
            }
            if (!migratedPlan.nextAllowedAt || typeof migratedPlan.nextAllowedAt !== 'object') {
                migratedPlan.nextAllowedAt = {};
                changed = true;
            }

            newPlans.push(migratedPlan);
        }

        this._plans = newPlans;

        if (changed) {
            this.storage.save('attack_plans', this._plans);
        }
    }

    settings = () => {
        const self = this;
        requestAnimationFrame(function () {
            self._updateTitle();
            self._renderPlans();
            self._renderStagingUnits();
        });

        let html = '';
        html += '<div class="game_border" style="margin-bottom:20px;">';
        html += '<div class="game_border_top"></div><div class="game_border_bottom"></div>';
        html += '<div class="game_border_left"></div><div class="game_border_right"></div>';
        html += '<div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>';
        html += '<div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>';
        html += this.getTitleHtml('attack_title', 'Auto Ataque', this.toggle, '', this._active);
        html += '<div style="padding:5px 10px;font-weight:bold;">';
        html += 'Ataca automaticamente assim que TODA a composicao configurada estiver disponivel na cidade. Verifica a cada 20s.';
        html += '</div>';

        html += '<div style="padding:8px 10px; border-top:1px solid rgba(0,0,0,0.1);">';

        html += '<div>';
        html += '<label style="font-size:11px;font-weight:bold;">Cidade Atacante</label><br>';
        html += '<select id="attack_origin_select" style="width:220px;padding:3px;">';
        html += this._getTownOptionsHtml();
        html += '</select>';
        html += '</div>';

        html += '<div style="margin-top:8px;font-weight:bold;font-size:12px;">Composicao do ataque</div>';
        html += '<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; margin-top:4px;">';

        html += '<div>';
        html += '<label style="font-size:11px;font-weight:bold;">Unidade</label><br>';
        html += '<select id="attack_unit_select" style="width:160px;padding:3px;">';
        html += this._getUnitOptionsHtml();
        html += '</select>';
        html += '</div>';

        html += '<div>';
        html += '<label style="font-size:11px;font-weight:bold;">Quantidade</label><br>';
        html += '<input type="number" id="attack_qty" min="1" placeholder="ex: 100" style="width:80px;padding:3px;">';
        html += '</div>';

        html += '<div>';
        html += this.getButtonHtml('attack_add_unit_btn', '+ Add Unidade', this.addUnitToStaging);
        html += '</div>';

        html += '</div>';

        html += '<div id="attack_staging_list" style="padding:6px 0;font-size:11px;"></div>';

        html += '<div style="margin-top:6px;">';
        html += '<label style="font-size:11px;font-weight:bold;">Cidades-alvo (uma por linha, ou separadas por virgula)</label><br>';
        html += '<textarea id="attack_targets" rows="2" style="width:100%;padding:4px;" placeholder="ex: 12345, 67890"></textarea>';
        html += '</div>';

        html += '<div style="margin-top:6px;">';
        html += '<label style="font-size:11px;font-weight:bold;" title="Tempo de espera antes de atacar o mesmo alvo de novo, para o armazem encher. 0 = sem espera. Variacao aleatoria de +-10% e aplicada.">Descanso por alvo (minutos)</label><br>';
        html += '<input type="number" id="attack_rest_minutes" min="0" placeholder="ex: 60 (0 = sem espera)" style="width:180px;padding:3px;" value="0">';
        html += '</div>';

        html += '<div style="margin-top:6px;">';
        html += this.getButtonHtml('attack_add_plan_btn', '+ Adicionar Plano', this.addPlan);
        html += '</div>';
        html += '</div>';

        html += '<div style="padding:8px 10px; border-top:1px solid rgba(0,0,0,0.1);">';
        html += '<div style="font-weight:bold;font-size:12px;margin-bottom:4px;">Planos ativos:</div>';
        // Container com altura MAXIMA fixa. overflow-y:auto cria a
        // barra de rolagem automaticamente assim que o conteudo
        // ultrapassar PLANS_LIST_MAX_HEIGHT - nao importa quantos
        // planos existam, essa div NUNCA cresce além disso.
        html += '<div id="attack_plans_list" style="';
        html += 'max-height:' + this.PLANS_LIST_MAX_HEIGHT + 'px;';
        html += 'overflow-y:auto;';
        html += 'overflow-x:hidden;';
        html += 'border:1px solid rgba(0,0,0,0.15);';
        html += 'border-radius:3px;';
        html += 'background:rgba(0,0,0,0.03);';
        html += 'padding:2px 4px;';
        html += '"></div>';
        html += '</div>';

        html += '<div id="attack_log" style="padding:2px 10px 8px;font-size:11px;color:#5a3a0a;min-height:16px;"></div>';
        html += '</div>';

        return html;
    };

    _getTownOptionsHtml() {
        try {
            const towns = uw.ITowns.towns;
            const keys = Object.keys(towns);

            keys.sort(function (a, b) {
                const nameA = towns[a].getName ? towns[a].getName() : '';
                const nameB = towns[b].getName ? towns[b].getName() : '';
                return nameA.localeCompare(nameB);
            });

            let html = '<option value="">Selecione uma cidade...</option>';
            for (const id of keys) {
                const t = towns[id];
                const name = t.getName ? t.getName() : ('#' + id);
                html += '<option value="' + id + '">' + name + ' (#' + id + ')</option>';
            }
            return html;
        } catch (e) {
            return '<option value="">Erro ao carregar cidades</option>';
        }
    }

    _getUnitOptionsHtml() {
        try {
            const units = uw.GameData.units;
            const keys = Object.keys(units).filter(function (u) {
                return u !== 'militia';
            });

            let html = '<option value="">Selecione...</option>';
            for (const key of keys) {
                const isNaval = units[key].is_naval ? true : false;
                const label = key + (isNaval ? ' (naval)' : ' (terrestre)');
                html += '<option value="' + key + '">' + label + '</option>';
            }
            return html;
        } catch (e) {
            return '<option value="">Erro ao carregar unidades</option>';
        }
    }

    addUnitToStaging = () => {
        const unit = uw.$('#attack_unit_select').val();
        const qty = parseInt(uw.$('#attack_qty').val(), 10);

        if (!unit) {
            this.console.log('[AutoAttack] Erro: selecione uma unidade antes de adicionar.');
            uw.$('#attack_log').text('Erro: selecione uma unidade.').css('color', '#f87171');
            return;
        }
        if (!qty || qty <= 0) {
            this.console.log('[AutoAttack] Erro: quantidade invalida.');
            uw.$('#attack_log').text('Erro: informe uma quantidade valida.').css('color', '#f87171');
            return;
        }

        const unitData = uw.GameData.units[unit];
        const isNaval = unitData && unitData.is_naval ? true : false;

        let existing = null;
        for (const u of this._stagingUnits) {
            if (u.unit === unit) {
                existing = u;
                break;
            }
        }

        if (existing) {
            existing.quantity += qty;
        } else {
            this._stagingUnits.push({ unit: unit, quantity: qty, isNaval: isNaval });
        }

        uw.$('#attack_qty').val('');
        uw.$('#attack_unit_select').val('');

        this._renderStagingUnits();
        this.console.log('[AutoAttack] Unidade adicionada a composicao: ' + qty + 'x ' + unit);
    };

    removeStagingUnit = (unit) => {
        this._stagingUnits = this._stagingUnits.filter(function (u) {
            return u.unit !== unit;
        });
        this._renderStagingUnits();
    };

    _renderStagingUnits() {
        const container = uw.$('#attack_staging_list');
        if (!container.length) return;

        if (this._stagingUnits.length === 0) {
            container.html('<span style="color:#7a5c2a;">Nenhuma unidade adicionada ainda a esta composicao.</span>');
            return;
        }

        let html = '<div style="font-weight:bold;margin-bottom:4px;">Composicao atual:</div>';
        for (const u of this._stagingUnits) {
            const typeLabel = u.isNaval ? 'naval' : 'terrestre';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 4px;">';
            html += '<span>' + u.quantity + 'x ' + u.unit + ' (' + typeLabel + ')</span>';
            html += '<span onclick="window.modernBot.autoAttack.removeStagingUnit(\'' + u.unit + '\')" style="cursor:pointer;color:#f87171;font-weight:bold;padding:0 6px;">X</span>';
            html += '</div>';
        }
        container.html(html);
    }

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
        this.storage.save('attack_active', true);
        this._updateTitle();
        this.console.log('[AutoAttack] Iniciado. Monitorando planos de ataque...');
        this._tick();
        this._intervalId = setInterval(() => {
            this._tick();
        }, this.CHECK_INTERVAL_MS);
    }

    stop() {
        this._active = false;
        this.storage.save('attack_active', false);
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
        this._updateTitle();
        this.console.log('[AutoAttack] Parado.');
    }

    _updateTitle() {
        const filter = this._active ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '';
        uw.$('#attack_title').css('filter', filter);
    }

    addPlan = () => {
        const originId = (uw.$('#attack_origin_select').val() || '').trim();
        const targetsRaw = (uw.$('#attack_targets').val() || '').trim();
        const restMinutesRaw = parseInt(uw.$('#attack_rest_minutes').val(), 10);
        const restMinutes = (!isNaN(restMinutesRaw) && restMinutesRaw > 0) ? restMinutesRaw : 0;

        if (!originId) {
            this.console.log('[AutoAttack] Erro: nenhuma cidade atacante selecionada.');
            uw.$('#attack_log').text('Erro: selecione uma cidade atacante.').css('color', '#f87171');
            return;
        }
        if (this._stagingUnits.length === 0) {
            this.console.log('[AutoAttack] Erro: adicione ao menos uma unidade a composicao.');
            uw.$('#attack_log').text('Erro: adicione ao menos uma unidade.').css('color', '#f87171');
            return;
        }

        const rawTargets = targetsRaw.split(/[\n,]+/);
        const targets = [];
        for (const t of rawTargets) {
            const trimmed = t.trim();
            if (/^\d+$/.test(trimmed)) targets.push(trimmed);
        }

        if (targets.length === 0) {
            this.console.log('[AutoAttack] Erro: nenhuma cidade-alvo valida informada.');
            uw.$('#attack_log').text('Erro: informe pelo menos uma cidade-alvo valida.').css('color', '#f87171');
            return;
        }

        const unitsCopy = [];
        for (const u of this._stagingUnits) {
            unitsCopy.push({ unit: u.unit, quantity: u.quantity, isNaval: u.isNaval });
        }

        const plan = {
            id: Date.now() + '_' + Math.floor(Math.random() * 10000),
            originId: originId,
            units: unitsCopy,
            targets: targets,
            restMinutes: restMinutes,
            nextAllowedAt: {},
            enabled: true
        };

        this._plans.push(plan);
        this.storage.save('attack_plans', this._plans);
        this._renderPlans();

        this._stagingUnits = [];
        this._renderStagingUnits();
        uw.$('#attack_origin_select').val('');
        uw.$('#attack_targets').val('');
        uw.$('#attack_rest_minutes').val('0');

        const originTown = uw.ITowns.towns[originId];
        const originName = originTown && originTown.getName ? originTown.getName() : ('#' + originId);

        let unitsSummary = '';
        for (let i = 0; i < plan.units.length; i++) {
            if (i > 0) unitsSummary += ', ';
            unitsSummary += plan.units[i].quantity + 'x ' + plan.units[i].unit;
        }

        const restLabel = restMinutes > 0 ? (', descanso ' + restMinutes + 'min') : '';
        this.console.log('[AutoAttack] Plano adicionado: ' + originName + ' [' + unitsSummary + '] -> ' + targets.length + ' alvo(s)' + restLabel + '.');
        uw.$('#attack_log').text('Plano adicionado com sucesso!').css('color', '#1a6b2a');
    };

    removePlan = (planId) => {
        this._plans = this._plans.filter(function (p) {
            return p.id !== planId;
        });
        this.storage.save('attack_plans', this._plans);
        this._renderPlans();
        this.console.log('[AutoAttack] Plano removido.');
    };

    _renderPlans() {
        const container = uw.$('#attack_plans_list');
        if (!container.length) return;

        if (this._plans.length === 0) {
            container.html('<span style="font-size:11px;color:#7a5c2a;">Nenhum plano configurado.</span>');
            return;
        }

        let html = '';

        for (const plan of this._plans) {
            if (!Array.isArray(plan.units)) continue;

            const townName = this._getTownName(plan.originId);

            let unitsLabel = '';
            for (let i = 0; i < plan.units.length; i++) {
                if (i > 0) unitsLabel += ', ';
                unitsLabel += plan.units[i].quantity + 'x ' + plan.units[i].unit;
            }

            let targetsLabel = '';
            for (let i = 0; i < plan.targets.length; i++) {
                if (i > 0) targetsLabel += ', ';
                targetsLabel += this._getTownName(plan.targets[i]);

                const nextAt = plan.nextAllowedAt ? plan.nextAllowedAt[plan.targets[i]] : null;
                if (nextAt && nextAt > Date.now()) {
                    const remainMin = Math.ceil((nextAt - Date.now()) / 60000);
                    targetsLabel += ' (descansando ' + remainMin + 'min)';
                }
            }

            const restLabel = (plan.restMinutes && plan.restMinutes > 0) ? (' | descanso: ' + plan.restMinutes + 'min') : '';

            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 6px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:11px;">';
            html += '<div style="max-width:75%;">' + '<b>' + townName + '</b> [' + unitsLabel + '] &rarr; ' + targetsLabel + restLabel + '</div>';
            html += '<div class="button_new" onclick="window.modernBot.autoAttack.removePlan(\'' + plan.id + '\')" style="cursor:pointer;margin:0;padding:0 6px;flex-shrink:0;">';
            html += '<div class="left"></div><div class="right"></div>';
            html += '<div class="caption js-caption">Remover<div class="effect js-effect"></div></div>';
            html += '</div>';
            html += '</div>';
        }

        container.html(html);
    }

    _tick() {
        if (window.__multbot_captcha_active) return;
        if (this._plans.length === 0) return;

        for (const plan of this._plans) {
            if (!plan.enabled) continue;
            this._checkAndFire(plan);
        }
    }

    _computeNextAllowedAt(restMinutes) {
        const baseMs = restMinutes * 60 * 1000;
        const jitterRange = baseMs * this.JITTER_PERCENT;
        const jitter = (Math.random() * 2 - 1) * jitterRange;
        return Date.now() + baseMs + jitter;
    }

    async _checkAndFire(plan) {
        try {
            if (!Array.isArray(plan.units) || plan.units.length === 0) {
                this.console.log('[AutoAttack] Aviso: plano da cidade #' + plan.originId + ' sem composicao valida, ignorado.');
                return;
            }

            const town = uw.ITowns.towns[plan.originId];
            if (!town) {
                this.console.log('[AutoAttack] Aviso: cidade #' + plan.originId + ' nao encontrada (nao e sua ou saiu do cache).');
                return;
            }

            const available = town.units();

            let hasMissing = false;
            for (const u of plan.units) {
                const have = available[u.unit] || 0;
                if (have < u.quantity) {
                    hasMissing = true;
                    break;
                }
            }
            if (hasMissing) return;

            if (!plan.nextAllowedAt) plan.nextAllowedAt = {};

            const now = Date.now();

            const readyTargets = [];
            for (const targetId of plan.targets) {
                const nextAt = plan.nextAllowedAt[targetId];
                if (nextAt && nextAt > now) continue;
                readyTargets.push(targetId);
            }

            if (readyTargets.length === 0) {
                return;
            }

            const townName = town.getName ? town.getName() : ('#' + plan.originId);

            let unitsSummary = '';
            for (let i = 0; i < plan.units.length; i++) {
                if (i > 0) unitsSummary += ', ';
                unitsSummary += plan.units[i].quantity + 'x ' + plan.units[i].unit;
            }

            this.console.log('[AutoAttack] ' + townName + ': composicao completa disponivel [' + unitsSummary + ']. Disparando ataques em ' + readyTargets.length + ' alvo(s) prontos...');

            const remaining = {};
            for (const u of plan.units) {
                remaining[u.unit] = available[u.unit] || 0;
            }

            for (const targetId of readyTargets) {
                let stillEnough = true;
                for (const u of plan.units) {
                    if (remaining[u.unit] < u.quantity) {
                        stillEnough = false;
                        break;
                    }
                }
                if (!stillEnough) {
                    this.console.log('[AutoAttack] ' + townName + ': composicao insuficiente para continuar aos proximos alvos.');
                    break;
                }

                const targetName = this._getTownName(targetId);
                try {
                    await this._sendAttack(plan.originId, targetId, plan.units);
                    this.console.log('[AutoAttack] OK: ' + townName + ' -> ' + targetName + ': ataque com [' + unitsSummary + '] enviado!');
                    uw.$('#attack_log').text('OK: ' + townName + ' atacou ' + targetName + ' [' + unitsSummary + ']').css('color', '#1a6b2a');
                    if (uw.HumanMessage) {
                        uw.HumanMessage.success('MultBot: ' + townName + ' -> ' + targetName + ' (ataque)');
                    }

                    for (const u of plan.units) {
                        remaining[u.unit] -= u.quantity;
                    }

                    if (plan.restMinutes && plan.restMinutes > 0) {
                        const nextAllowed = this._computeNextAllowedAt(plan.restMinutes);
                        plan.nextAllowedAt[targetId] = nextAllowed;
                        this.storage.save('attack_plans', this._plans);

                        const remainMin = Math.round((nextAllowed - Date.now()) / 60000);
                        this.console.log('[AutoAttack] ' + targetName + ' entrando em descanso por aproximadamente ' + remainMin + 'min.');
                    }
                } catch (e) {
                    const msg = e && e.message ? e.message : e;
                    this.console.log('[AutoAttack] FALHA ao atacar ' + targetName + ' de ' + townName + ': ' + msg);
                    uw.$('#attack_log').text('Falha ao atacar ' + targetName + ': ' + msg).css('color', '#f87171');
                }

                await this.sleep(this.SEND_DELAY_MS);
            }
        } catch (e) {
            const msg = e && e.message ? e.message : e;
            this.console.log('[AutoAttack] Erro ao processar plano da cidade #' + plan.originId + ': ' + msg);
        }
    }

    _sendAttack(fromTownId, toTownId, unitsList) {
        return this._withTownId(fromTownId, () => {
            return new Promise((resolve, reject) => {
                const data = {
                    id: parseInt(toTownId, 10),
                    type: 'attack',
                    nl_init: true
                };

                for (const u of unitsList) {
                    data[u.unit] = u.quantity;
                }

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
            const towns = (uw.ITowns && uw.ITowns.towns) ? uw.ITowns.towns : {};
            const t1 = towns[id] ? towns[id] : towns[ids];
            if (t1 && typeof t1.getName === 'function') {
                return t1.getName() + ' (#' + ids + ')';
            }

            const wmapTowns = (uw.WMap && uw.WMap.towns) ? uw.WMap.towns : {};
            const wt = wmapTowns[id] ? wmapTowns[id] : wmapTowns[ids];
            if (wt && wt.name) {
                return wt.name + ' (#' + ids + ')';
            }
        } catch (e) {}

        return '#' + ids;
    }
}
