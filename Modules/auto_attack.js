// ══════════════════════════════════════════════════════
//  MODULE: AutoAttack
//  Monitora uma cidade atacante e, assim que TODAS as
//  quantidades configuradas de uma composicao de unidades
//  estiverem disponiveis, dispara ataques automaticamente
//  para uma ou mais cidades-alvo, com a composicao completa
//  em um unico envio.
//
//  PDCA - correcoes desta rodada:
//  1) O tick agora e verdadeiramente assincrono e aguarda TODOS
//     os planos terminarem de processar antes de considerar o
//     ciclo completo. Combinado com this.createGuardedInterval,
//     isso elimina o risco de dois ciclos rodarem sobre o mesmo
//     plano ao mesmo tempo (o que podia, em teoria, disparar o
//     mesmo ataque duas vezes antes do jogo atualizar a contagem
//     de tropas).
//  2) O envio de ataque usa this.ajaxPostWithTimeout (herdado de
//     MultUtil) - evita Promise pendurada para sempre se a rede
//     travar no meio do envio.
//  3) _getTownName foi removido - usa this.getTownName (herdado
//     de MultUtil), eliminando a duplicacao dessa logica.
//  4) Suporte a envio de HEROI junto com o ataque. Payload real
//     capturado via devtools (POST town_info?action=send_units):
//       {"hoplite":9,"harpy":4,"heroes":"andromeda",
//        "town_id":35715,"id":36896,"type":"attack","nl_init":true}
//     -> o campo e "heroes" (essa e a key usada pelo jogo) e o
//        valor e a KEY interna do heroi (ex: "andromeda"), igual
//        as keys de GameData.units para unidades. town_id/id/type/
//        nl_init ja eram tratados.
//     O heroi e opcional por plano. Nao ha checagem automatica de
//     disponibilidade do heroi na cidade (o jogo nao expõe isso da
//     mesma forma que town.units()) - se o heroi selecionado nao
//     estiver disponivel na hora do disparo, o pior caso e o ataque
//     ser enviado sem o heroi ou a requisicao falhar (fica logado
//     como FALHA e o bot segue para o proximo alvo normalmente).
//     Um mesmo heroi so pode ir em UM envio por ciclo (fisicamente
//     so pode estar em um exercito de cada vez) - por isso ele e
//     anexado apenas ao primeiro alvo pronto do ciclo.
//
//  Nomes de unidade exibidos usam o nome traduzido do proprio
//  GameData.units[id].name.
//
//  Cada unidade da composicao pode ser marcada "Max" - nesse modo,
//  o ataque envia SEMPRE tudo que estiver disponivel daquela
//  unidade no momento do disparo.
//
//  Periodo de descanso (cooldown) por alvo, com jitter de +-10%,
//  persistido em storage (sobrevive a reload).
// ══════════════════════════════════════════════════════
var AutoAttack = class extends MultUtil {
    CHECK_INTERVAL_MS = 20000;
    SEND_DELAY_MS = 800;
    JITTER_PERCENT = 0.10;
    PLANS_LIST_MAX_HEIGHT = 110;

    constructor(c, s) {
        super(c, s);
        this._active = false;
        this._intervalId = null;
        this._plans = this.storage.load('attack_plans', []);
        this._stagingUnits = [];
        this._editingPlanId = null;

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
                                isNaval: !!plan.isNaval,
                                useMax: false
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
            /* MUDANCA DE COMPORTAMENTO: "descanso" agora e o intervalo
               entre UM ataque e o PROXIMO do plano inteiro (nao mais um
               cooldown independente por alvo). Planos antigos tinham
               nextAllowedAt como objeto {targetId: timestamp} - migra
               pra um unico timestamp (nextAttackAt) + um indice de
               rotacao entre os alvos (nextTargetIndex). A checagem por
               "typeof nextAttackAt !== 'number'" garante que isso so
               roda UMA VEZ (na primeira carga depois da mudanca) - sem
               ela, o progresso seria resetado a cada reload da pagina. */
            if (typeof migratedPlan.nextAttackAt !== 'number') {
                if (migratedPlan.nextAllowedAt && typeof migratedPlan.nextAllowedAt === 'object') {
                    this.console.log('[AutoAttack] Plano #' + migratedPlan.id + ': descanso migrado de "por alvo" pra "intervalo do plano inteiro".');
                }
                migratedPlan.nextAttackAt = 0;
                migratedPlan.nextTargetIndex = 0;
                delete migratedPlan.nextAllowedAt;
                changed = true;
            }

            if (Array.isArray(migratedPlan.units)) {
                for (const u of migratedPlan.units) {
                    if (typeof u.useMax !== 'boolean') {
                        u.useMax = false;
                        changed = true;
                    }
                }
            }

            if (typeof migratedPlan.hero === 'undefined') {
                migratedPlan.hero = null;
                changed = true;
            }

            newPlans.push(migratedPlan);
        }

        this._plans = newPlans;

        if (changed) {
            this.storage.save('attack_plans', this._plans);
        }
    }

    _getUnitLabel(unitId) {
        return this.getGameName('unit', unitId);
    }

    _getHeroLabel(heroId) {
        if (!heroId) return '';
        try {
            return this.getGameName('hero', heroId);
        } catch (e) {
            try {
                return uw.GameData.heroes[heroId].name;
            } catch (e2) {
                return heroId;
            }
        }
    }

    _formatUnitEntry(u) {
        const label = this._getUnitLabel(u.unit);
        if (u.useMax) return 'MAX x ' + label;
        return u.quantity + 'x ' + label;
    }

    settings = () => {
        const self = this;
        requestAnimationFrame(function () {
            self._updateTitle();
            self._renderPlans();
            self._renderStagingUnits();
            self._updateAddPlanButtonLabel();
        });

        let html = '';
        html += '<div class="game_border" style="margin-bottom:14px;">';
        html += '<div class="game_border_top"></div><div class="game_border_bottom"></div>';
        html += '<div class="game_border_left"></div><div class="game_border_right"></div>';
        html += '<div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>';
        html += '<div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>';
        html += this.getTitleHtml('attack_title', 'Auto Ataque', this.toggle, '', this._active);

        html += '<div style="padding:4px 10px;font-size:11px;font-weight:bold;">';
        html += 'Ataca automaticamente quando a composicao estiver disponivel. Verifica a cada 20s.';
        html += '</div>';

        html += '<div style="padding:4px 10px;">';

        html += '<div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">';
        html += '<div style="flex:1; min-width:180px;">';
        html += '<label style="font-size:11px;font-weight:bold;">Cidade Atacante</label><br>';
        html += '<select id="attack_origin_select" style="width:100%;padding:3px;">';
        html += this._getTownOptionsHtml();
        html += '</select>';
        html += '</div>';
        html += '<div style="width:140px;">';
        html += '<label style="font-size:11px;font-weight:bold;" title="Espera antes de reatacar o mesmo alvo, +-10% de variacao. 0 = sem espera.">Descanso (min)</label><br>';
        html += '<input type="number" id="attack_rest_minutes" min="0" placeholder="0" style="width:100%;padding:3px;" value="0">';
        html += '</div>';
        html += '</div>';

        html += '<div style="display:flex; gap:10px; align-items:flex-end; margin-top:6px; flex-wrap:wrap;">';
        html += '<div style="flex:1; min-width:180px;">';
        html += '<label style="font-size:11px;font-weight:bold;" title="Opcional. Envia esse heroi junto com o ataque, se ele estiver disponivel na cidade atacante no momento do disparo.">Heroi (opcional)</label><br>';
        html += '<select id="attack_hero_select" style="width:100%;padding:3px;">';
        html += this._getHeroOptionsHtml();
        html += '</select>';
        html += '</div>';
        html += '</div>';

        html += '<div style="display:flex; gap:8px; align-items:flex-end; margin-top:6px; flex-wrap:wrap;">';
        html += '<div style="flex:1; min-width:130px;">';
        html += '<label style="font-size:11px;font-weight:bold;">Unidade</label><br>';
        html += '<select id="attack_unit_select" style="width:100%;padding:3px;">';
        html += this._getUnitOptionsHtml();
        html += '</select>';
        html += '</div>';
        html += '<div style="width:75px;">';
        html += '<label style="font-size:11px;font-weight:bold;">Qtde</label><br>';
        html += '<input type="number" id="attack_qty" min="1" placeholder="100" style="width:100%;padding:3px;">';
        html += '</div>';
        html += '<div style="width:60px;">';
        html += '<label style="font-size:11px;font-weight:bold;" title="Sempre envia TUDO que estiver disponivel dessa unidade no momento do ataque.">&nbsp;</label><br>';
        html += '<label style="font-size:11px;display:flex;align-items:center;gap:3px;cursor:pointer;padding:4px 0;">';
        html += '<input type="checkbox" id="attack_qty_max" onchange="window.multBot.autoAttack.toggleMaxQty()"> Max';
        html += '</label>';
        html += '</div>';
        html += '<div>';
        html += this.getButtonHtml('attack_add_unit_btn', '+ Unidade', this.addUnitToStaging);
        html += '</div>';
        html += '</div>';

        html += '<div id="attack_staging_list" style="font-size:11px; margin-top:4px;"></div>';

        html += '<div style="margin-top:6px;">';
        html += '<label style="font-size:11px;font-weight:bold;">Cidades-alvo (ID, separadas por virgula ou linha)</label>';
        html += '<textarea id="attack_targets" rows="1" style="width:100%;padding:4px;box-sizing:border-box;" placeholder="ex: 12345, 67890"></textarea>';
        html += '</div>';

        html += '<div style="margin-top:6px;">';
        html += this.getButtonHtml('attack_add_plan_btn', '+ Adicionar Plano', this.addPlan);
        html += '</div>';
        html += '</div>';

        html += '<div style="padding:4px 10px 8px;border-top:1px solid rgba(0,0,0,0.15);">';
        html += '<div style="font-weight:bold;font-size:11px;margin:4px 0;">Planos ativos:</div>';
        html += '<div id="attack_plans_list" style="';
        html += 'max-height:' + this.PLANS_LIST_MAX_HEIGHT + 'px;';
        html += 'overflow-y:scroll;';
        html += 'overflow-x:hidden;';
        html += 'border:1px solid #7a5c2a;';
        html += 'border-radius:3px;';
        html += 'background:rgba(255,255,255,0.35);';
        html += 'padding:3px 5px;';
        html += 'box-sizing:border-box;';
        html += '"></div>';
        html += '</div>';

        html += '<div id="attack_log" style="padding:0 10px 6px;font-size:11px;color:#5a3a0a;min-height:14px;"></div>';
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

            let html = '<option value="">Selecione...</option>';
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

            const self = this;
            const items = keys.map(function (key) {
                return { id: key, label: self._getUnitLabel(key), isNaval: !!units[key].is_naval };
            });

            items.sort(function (a, b) {
                return a.label.localeCompare(b.label);
            });

            let html = '<option value="">Selecione...</option>';
            for (const item of items) {
                html += '<option value="' + item.id + '">' + item.label + '</option>';
            }
            return html;
        } catch (e) {
            return '<option value="">Erro ao carregar unidades</option>';
        }
    }

    /* Heroi e opcional - se GameData.heroes nao existir ou tiver um
       formato diferente do esperado, cai num <select> so com "Nenhum"
       (o resto do bot continua funcionando normalmente sem heroi). */
    _getHeroOptionsHtml() {
        try {
            const heroes = uw.GameData.heroes;
            const keys = Object.keys(heroes);

            const self = this;
            const items = keys.map(function (key) {
                return { id: key, label: self._getHeroLabel(key) || key };
            });

            items.sort(function (a, b) {
                return a.label.localeCompare(b.label);
            });

            let html = '<option value="">Nenhum</option>';
            for (const item of items) {
                html += '<option value="' + item.id + '">' + item.label + '</option>';
            }
            return html;
        } catch (e) {
            return '<option value="">Nenhum</option>';
        }
    }

    toggleMaxQty = () => {
        const checked = uw.$('#attack_qty_max').is(':checked');
        const $qty = uw.$('#attack_qty');
        if (checked) {
            $qty.prop('disabled', true).val('');
        } else {
            $qty.prop('disabled', false);
        }
    };

    addUnitToStaging = () => {
        const unit = uw.$('#attack_unit_select').val();
        const useMax = uw.$('#attack_qty_max').is(':checked');
        const qty = parseInt(uw.$('#attack_qty').val(), 10);

        if (!unit) {
            this.console.log('[AutoAttack] Erro: selecione uma unidade antes de adicionar.');
            uw.$('#attack_log').text('Erro: selecione uma unidade.').css('color', '#f87171');
            return;
        }
        if (!useMax && (!qty || qty <= 0)) {
            this.console.log('[AutoAttack] Erro: quantidade invalida.');
            uw.$('#attack_log').text('Erro: informe uma quantidade valida ou marque Max.').css('color', '#f87171');
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
            if (useMax) {
                existing.useMax = true;
                existing.quantity = 0;
            } else if (existing.useMax) {
                existing.useMax = false;
                existing.quantity = qty;
            } else {
                existing.quantity += qty;
            }
        } else {
            this._stagingUnits.push({
                unit: unit,
                quantity: useMax ? 0 : qty,
                isNaval: isNaval,
                useMax: useMax
            });
        }

        uw.$('#attack_qty').val('').prop('disabled', false);
        uw.$('#attack_qty_max').prop('checked', false);
        uw.$('#attack_unit_select').val('');

        this._renderStagingUnits();

        const entryForLog = existing ? existing : this._stagingUnits[this._stagingUnits.length - 1];
        this.console.log('[AutoAttack] Unidade adicionada a composicao: ' + this._formatUnitEntry(entryForLog));
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
            container.html('<span style="color:#7a5c2a;">Nenhuma unidade na composicao ainda.</span>');
            return;
        }

        let html = '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
        for (const u of this._stagingUnits) {
            html += '<span style="background:rgba(0,0,0,0.08);border-radius:3px;padding:2px 6px;display:inline-flex;align-items:center;gap:4px;">';
            html += this._formatUnitEntry(u);
            html += '<span onclick="window.multBot.autoAttack.removeStagingUnit(\'' + u.unit + '\')" style="cursor:pointer;color:#f87171;font-weight:bold;">X</span>';
            html += '</span>';
        }
        html += '</div>';
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
        this._intervalId = this.createGuardedInterval(() => this._tick(), this.CHECK_INTERVAL_MS);
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
        const hero = (uw.$('#attack_hero_select').val() || '').trim() || null;

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
            unitsCopy.push({ unit: u.unit, quantity: u.quantity, isNaval: u.isNaval, useMax: u.useMax });
        }

        const originTown = uw.ITowns.towns[originId];
        const originName = originTown && originTown.getName ? originTown.getName() : ('#' + originId);

        let unitsSummary = '';
        for (let i = 0; i < unitsCopy.length; i++) {
            if (i > 0) unitsSummary += ', ';
            unitsSummary += this._formatUnitEntry(unitsCopy[i]);
        }

        // Modo edicao: atualiza o plano existente NO LUGAR, mantendo o
        // mesmo id e o nextAttackAt/nextTargetIndex (cooldown e rotacao
        // em andamento nao sao resetados so por editar o plano - se o
        // plano ja esta descansando, continua descansando).
        if (this._editingPlanId) {
            const existingPlan = this._plans.find((p) => p.id === this._editingPlanId);
            if (existingPlan) {
                existingPlan.originId = originId;
                existingPlan.units = unitsCopy;
                existingPlan.targets = targets;
                existingPlan.restMinutes = restMinutes;
                existingPlan.hero = hero;
                // nextAttackAt, nextTargetIndex, enabled, id: preservados como estavam

                this.storage.save('attack_plans', this._plans);
                this._renderPlans();

                this._stagingUnits = [];
                this._renderStagingUnits();
                uw.$('#attack_origin_select').val('');
                uw.$('#attack_targets').val('');
                uw.$('#attack_rest_minutes').val('0');
                uw.$('#attack_hero_select').val('');

                this._editingPlanId = null;
                this._updateAddPlanButtonLabel();

                this.console.log('[AutoAttack] Plano atualizado: ' + originName + ' [' + unitsSummary + '] -> ' + targets.length + ' alvo(s).');
                uw.$('#attack_log').text('Plano atualizado com sucesso!').css('color', '#1a6b2a');
                return;
            }
            // O plano que estava sendo editado sumiu (removido em outra aba,
            // por ex) - cai pro fluxo normal de criar um plano novo abaixo.
            this._editingPlanId = null;
            this._updateAddPlanButtonLabel();
        }

        const plan = {
            id: Date.now() + '_' + Math.floor(Math.random() * 10000),
            originId: originId,
            units: unitsCopy,
            targets: targets,
            restMinutes: restMinutes,
            nextAttackAt: 0,
            nextTargetIndex: 0,
            hero: hero,
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
        uw.$('#attack_hero_select').val('');

        const restLabel = restMinutes > 0 ? (', descanso ' + restMinutes + 'min') : '';
        const heroLabel = hero ? (', heroi: ' + this._getHeroLabel(hero)) : '';
        this.console.log('[AutoAttack] Plano adicionado: ' + originName + ' [' + unitsSummary + '] -> ' + targets.length + ' alvo(s)' + restLabel + heroLabel + '.');
        uw.$('#attack_log').text('Plano adicionado com sucesso!').css('color', '#1a6b2a');
    };

    /* Carrega os dados de um plano existente de volta no formulario,
       pra edicao. O botao "+ Adicionar Plano" vira "Salvar Alteracoes"
       enquanto _editingPlanId estiver setado (ver _updateAddPlanButtonLabel). */
    editPlan = (planId) => {
        const plan = this._plans.find((p) => p.id === planId);
        if (!plan) {
            this.console.log('[AutoAttack] Erro: plano nao encontrado pra editar.');
            return;
        }

        this._editingPlanId = planId;

        uw.$('#attack_origin_select').val(plan.originId);
        uw.$('#attack_rest_minutes').val(plan.restMinutes || 0);
        uw.$('#attack_hero_select').val(plan.hero || '');
        uw.$('#attack_targets').val(plan.targets.join(', '));

        this._stagingUnits = plan.units.map((u) => ({ unit: u.unit, quantity: u.quantity, isNaval: u.isNaval, useMax: u.useMax }));
        this._renderStagingUnits();

        this._updateAddPlanButtonLabel();

        const townName = this.getTownName(plan.originId);
        this.console.log('[AutoAttack] Editando plano: ' + townName + '.');
        uw.$('#attack_log').text('Editando plano de ' + townName + ' - altere e clique em "Salvar Alteracoes".').css('color', '#5a3a0a');

        const formEl = document.getElementById('attack_origin_select');
        if (formEl && formEl.scrollIntoView) formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    /* Sai do modo de edicao sem salvar - limpa o formulario e volta o
       botao pro estado normal de "+ Adicionar Plano". */
    cancelEditPlan = () => {
        this._editingPlanId = null;
        this._stagingUnits = [];
        this._renderStagingUnits();
        uw.$('#attack_origin_select').val('');
        uw.$('#attack_targets').val('');
        uw.$('#attack_rest_minutes').val('0');
        uw.$('#attack_hero_select').val('');
        this._updateAddPlanButtonLabel();
        uw.$('#attack_log').text('Edicao cancelada.').css('color', '#5a3a0a');
    };

    /* Troca o texto do botao entre "+ Adicionar Plano" e "Salvar
       Alteracoes" dependendo de _editingPlanId, e mostra/esconde o
       link "Cancelar edicao" ao lado dele. */
    _updateAddPlanButtonLabel() {
        const isEditing = !!this._editingPlanId;
        const label = isEditing ? '💾 Salvar Alteracoes' : '+ Adicionar Plano';
        uw.$('#attack_add_plan_btn .js-caption').html(label + ' <div class="effect js-effect"></div>');

        const $cancel = uw.$('#attack_cancel_edit_link');
        if (isEditing) {
            if ($cancel.length === 0) {
                uw.$('#attack_add_plan_btn').after(
                    '<span id="attack_cancel_edit_link" onclick="window.multBot.autoAttack.cancelEditPlan()" ' +
                    'style="cursor:pointer;color:#7a5c2a;font-size:11px;margin-left:8px;text-decoration:underline;">Cancelar edicao</span>'
                );
            }
        } else {
            $cancel.remove();
        }
    }

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

            const townName = this.getTownName(plan.originId);

            let unitsLabel = '';
            for (let i = 0; i < plan.units.length; i++) {
                if (i > 0) unitsLabel += ', ';
                unitsLabel += this._formatUnitEntry(plan.units[i]);
            }

            if (plan.hero) {
                unitsLabel += ' + heroi ' + this._getHeroLabel(plan.hero);
            }

            let targetsLabel = '';
            for (let i = 0; i < plan.targets.length; i++) {
                if (i > 0) targetsLabel += ', ';
                const isNext = i === (plan.nextTargetIndex || 0);
                targetsLabel += (isNext ? '▶' : '') + this.getTownName(plan.targets[i]);
            }

            let restLabel = (plan.restMinutes && plan.restMinutes > 0) ? (' | descanso ' + plan.restMinutes + 'min') : '';
            if (plan.nextAttackAt && plan.nextAttackAt > Date.now()) {
                const remainMin = Math.ceil((plan.nextAttackAt - Date.now()) / 60000);
                restLabel += ' (proximo em ~' + remainMin + 'min)';
            }

            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 2px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:10px;line-height:1.3;">';
            html += '<div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:6px;" title="' + townName + ' [' + unitsLabel + '] -> ' + targetsLabel + restLabel + '">';
            html += '<b>' + townName + '</b> [' + unitsLabel + '] &rarr; ' + targetsLabel + restLabel;
            html += '</div>';
            html += '<span onclick="window.multBot.autoAttack.editPlan(\'' + plan.id + '\')" style="cursor:pointer;color:#4a90d9;font-weight:bold;flex-shrink:0;padding:0 4px;" title="Editar plano">✏️</span>';
            html += '<span onclick="window.multBot.autoAttack.removePlan(\'' + plan.id + '\')" style="cursor:pointer;color:#f87171;font-weight:bold;flex-shrink:0;padding:0 4px;">X</span>';
            html += '</div>';
        }

        container.html(html);
    }

    /* Tick verdadeiramente assincrono: espera TODOS os planos
       terminarem de processar antes de considerar o ciclo completo.
       Rodando dentro de this.createGuardedInterval, isso garante que
       o proximo disparo do timer so acontece depois que este ciclo
       inteiro (incluindo todos os envios de rede) tiver terminado. */
    async _tick() {
        if (window.__multbot_captcha_active) return;
        if (this._plans.length === 0) return;

        const promises = [];
        for (const plan of this._plans) {
            if (!plan.enabled) continue;
            promises.push(this._checkAndFire(plan));
        }

        await Promise.all(promises);
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
            if (!Array.isArray(plan.targets) || plan.targets.length === 0) {
                return;
            }

            // Descanso agora e do PLANO INTEIRO - enquanto nao passar,
            // nao ataca NENHUM alvo (nao so o ultimo atacado).
            const now = Date.now();
            if (plan.nextAttackAt && plan.nextAttackAt > now) return;

            const town = uw.ITowns.towns[plan.originId];
            if (!town) {
                this.console.log('[AutoAttack] Aviso: cidade #' + plan.originId + ' nao encontrada (nao e sua ou saiu do cache).');
                return;
            }

            const available = town.units();

            let hasMissing = false;
            for (const u of plan.units) {
                const have = available[u.unit] || 0;
                const required = u.useMax ? 1 : u.quantity;
                if (have < required) {
                    hasMissing = true;
                    break;
                }
            }
            if (hasMissing) return;

            const townName = town.getName ? town.getName() : ('#' + plan.originId);

            // Alvo da vez, girando pela lista - cada ataque do plano vai
            // pro PROXIMO alvo, nao sempre o primeiro.
            if (typeof plan.nextTargetIndex !== 'number' || plan.nextTargetIndex >= plan.targets.length) {
                plan.nextTargetIndex = 0;
            }
            const targetId = plan.targets[plan.nextTargetIndex];
            const targetName = this.getTownName(targetId);

            const sendUnits = [];
            for (const u of plan.units) {
                const qtyToSend = u.useMax ? (available[u.unit] || 0) : u.quantity;
                sendUnits.push({ unit: u.unit, quantity: qtyToSend });
            }

            let sendSummary = '';
            for (let i = 0; i < sendUnits.length; i++) {
                if (i > 0) sendSummary += ', ';
                sendSummary += sendUnits[i].quantity + 'x ' + this._getUnitLabel(sendUnits[i].unit);
            }

            const heroForThisSend = plan.hero || null;
            if (heroForThisSend) {
                sendSummary += ' + heroi ' + this._getHeroLabel(heroForThisSend);
            }

            try {
                await this._sendAttack(plan.originId, targetId, sendUnits, heroForThisSend);
                this.console.log('[AutoAttack] OK: ' + townName + ' -> ' + targetName + ': ataque com [' + sendSummary + '] enviado!');
                uw.$('#attack_log').text('OK: ' + townName + ' atacou ' + targetName + ' [' + sendSummary + ']').css('color', '#1a6b2a');
                if (uw.HumanMessage) {
                    uw.HumanMessage.success('MultBot: ' + townName + ' -> ' + targetName + ' (ataque)');
                }

                // Avanca a rotacao pro proximo alvo da lista
                plan.nextTargetIndex = (plan.nextTargetIndex + 1) % plan.targets.length;

                // Descanso do plano inteiro - proximo ataque (a QUALQUER
                // alvo) so depois desse intervalo.
                if (plan.restMinutes && plan.restMinutes > 0) {
                    plan.nextAttackAt = this._computeNextAllowedAt(plan.restMinutes);
                    const remainMin = Math.round((plan.nextAttackAt - Date.now()) / 60000);
                    this.console.log('[AutoAttack] ' + townName + ': proximo ataque desse plano em aproximadamente ' + remainMin + 'min.');
                } else {
                    plan.nextAttackAt = 0;
                }

                this.storage.save('attack_plans', this._plans);
            } catch (e) {
                const msg = e && e.message ? e.message : e;
                this.console.log('[AutoAttack] FALHA ao atacar ' + targetName + ' de ' + townName + ': ' + msg);
                uw.$('#attack_log').text('FALHA ao atacar ' + targetName + ': ' + msg).css('color', '#f87171');
            }
        } catch (e) {
            const msg = e && e.message ? e.message : e;
            this.console.log('[AutoAttack] Erro inesperado no plano #' + plan.originId + ': ' + msg);
        }
    }

    _sendAttack(fromTownId, toTownId, unitsList, heroKey) {
        return this._withTownId(fromTownId, () => {
            const data = {
                id: parseInt(toTownId, 10),
                type: 'attack',
                nl_init: true
            };

            for (const u of unitsList) {
                data[u.unit] = u.quantity;
            }

            if (heroKey) {
                data.heroes = heroKey;
            }

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
