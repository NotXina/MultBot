// ══════════════════════════════════════════════════════
//  MODULE: AutoDodge
//  Detecta ataques chegando e agenda a evacuação das tropas
//  para exatamente ~15s antes do impacto — enviando para uma
//  cidade ALEATÓRIA sua na MESMA ILHA, terrestres e navais
//  SEPARADAMENTE — e traz de volta automaticamente depois
//  (cancelCommand).
// ══════════════════════════════════════════════════════
class AutoDodge extends ModernUtil {
    // Quantos segundos ANTES do impacto a evacuação deve disparar
    EVACUATE_LEAD_SECONDS = 15;
    // Quanto tempo depois do impacto esperar antes de tentar o recall,
    // dando margem de segurança pro servidor processar o ataque
    RECALL_BUFFER_SECONDS = 20;
    // Quanto esperar após cada envio antes de procurar o ID do comando
    // criado (dá tempo do MovementsUnits ser atualizado no client)
    CAPTURE_DELAY_MS = 2500;

    constructor(c, s) {
        super(c, s);
        this._active     = false;
        this._intervalId = null;
        this._scheduledEvac  = new Map(); // townId -> timeoutId (evacuação agendada, ainda não disparou)
        this._evacuated       = new Set(); // townId -> já evacuado nesta onda (evita reagendar/reenviar)
        this._pendingRecalls = new Map(); // "townId:land"/"townId:naval" -> { timeoutId, commandId }

        if (this.storage.load('dodge_active', false)) {
            setTimeout(() => this.start(), 2000);
        }
    }

    settings = () => {
        requestAnimationFrame(() => {
            this._updateTitle();
        });
        return `
        <div class="game_border" style="margin-bottom:20px;">
            <div class="game_border_top"></div><div class="game_border_bottom"></div>
            <div class="game_border_left"></div><div class="game_border_right"></div>
            <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>
            <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>
            ${this.getTitleHtml('dodge_title', 'Auto Fuga (Dodge)', this.toggle, '', this._active)}
            <div style="padding:5px 10px;font-weight:bold;">
                Ao detectar um ataque chegando, agenda a evacuação para
                ${this.EVACUATE_LEAD_SECONDS}s antes do impacto — envia
                terrestres e navais SEPARADAMENTE para uma cidade sua
                escolhida aleatoriamente na MESMA ILHA. Traz de volta
                automaticamente após o impacto. Verifica a cada 15s.
            </div>
            <div style="padding:2px 10px 8px;font-size:11px;color:#5a3a0a;">
                Se não houver outra cidade sua na mesma ilha, a evacuação
                daquela cidade é pulada (sem enviar para longe).
            </div>
            <div id="dodge_log" style="padding:2px 10px 8px;font-size:11px;color:#5a3a0a;min-height:16px;"></div>
        </div>`;
    };

    toggle = () => {
        if (this._active) this.stop();
        else this.start();
    };

    start() {
        if (this._active) return;
        this._active = true;
        this.storage.save('dodge_active', true);
        this._updateTitle();
        this.console.log('[AutoDodge] Iniciado. Monitorando ataques...');
        this._tick();
        this._intervalId = setInterval(() => this._tick(), 15000);
    }

    stop() {
        this._active = false;
        this.storage.save('dodge_active', false);
        if (this._intervalId) { clearInterval(this._intervalId); this._intervalId = null; }

        // Cancela evacuações agendadas que ainda não dispararam
        for (const timeoutId of this._scheduledEvac.values()) clearTimeout(timeoutId);
        this._scheduledEvac.clear();

        // Cancela só os TIMERS locais de recall — não cancela o apoio no
        // servidor. Se um recall já estava agendado, a tropa continua em
        // apoio até você trazer manualmente ou reiniciar o módulo.
        for (const { timeoutId } of this._pendingRecalls.values()) clearTimeout(timeoutId);
        this._pendingRecalls.clear();
        this._evacuated.clear();

        this._updateTitle();
        this.console.log('[AutoDodge] Parado.');
    }

    _updateTitle() {
        uw.$('#dodge_title').css('filter', this._active
            ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    }

    /* Só DESCOBRE ataques e AGENDA a evacuação — não evacua na hora. */
    _tick() {
        if (window.__multbot_captcha_active) return;

        try {
            const attacks = this._getIncomingAttacks();
            const now     = Math.floor(Date.now() / 1000);

            const byTown = new Map(); // townId -> maior "arrival" entre os ataques daquela cidade
            for (const atk of attacks) {
                const townId  = String(atk.target_town_id);
                const arrival = atk.arrival_at ?? atk.time_of_arrival ?? 0;
                if (!arrival) continue;
                if (!byTown.has(townId) || arrival > byTown.get(townId)) {
                    byTown.set(townId, arrival);
                }
            }

            // Cancela agendamentos de cidades que não têm mais ataque incoming
            const attackedTowns = new Set(byTown.keys());
            for (const townId of this._scheduledEvac.keys()) {
                if (!attackedTowns.has(townId)) {
                    clearTimeout(this._scheduledEvac.get(townId));
                    this._scheduledEvac.delete(townId);
                }
            }
            for (const townId of this._evacuated) {
                if (!attackedTowns.has(townId)) this._evacuated.delete(townId);
            }

            for (const [townId, arrival] of byTown) {
                if (this._scheduledEvac.has(townId)) continue; // já agendado
                if (this._evacuated.has(townId)) continue;     // já evacuado nesta onda

                const remaining = arrival - now;
                const fireInMs  = Math.max(0, (remaining - this.EVACUATE_LEAD_SECONDS) * 1000);

                const timeoutId = setTimeout(() => {
                    this._scheduledEvac.delete(townId);
                    this._evacuated.add(townId);
                    this._evacuateTown(townId, arrival);
                }, fireInMs);

                this._scheduledEvac.set(townId, timeoutId);
                this.console.log(`[AutoDodge] Evacuação agendada: ${this._getTownName(townId)} em ${Math.round(fireInMs / 1000)}s (${this.EVACUATE_LEAD_SECONDS}s antes do impacto).`);
            }
        } catch (e) {
            this.console.log('[AutoDodge] Erro: ' + e?.message);
        }
    }

    _getIncomingAttacks() {
        try {
            const models = uw.MM.getModels().MovementsUnits;
            if (!models) return [];
            const attacks = [];
            for (const key in models) {
                const mv = models[key].attributes;
                if ((mv.type === 'attack' || mv.type === 'attack_with_spy')
                    && uw.ITowns?.towns?.[mv.target_town_id]) {
                    attacks.push(mv);
                }
            }
            return attacks;
        } catch (e) { return []; }
    }

    /* Escolhe aleatoriamente uma cidade PRÓPRIA na mesma ilha da cidade
       atacada (excluindo ela mesma). Retorna null se não houver nenhuma. */
    _pickRandomTownOnSameIsland(attackedTownId) {
        try {
            const attackedTown = uw.ITowns.towns[attackedTownId];
            if
