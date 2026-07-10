// ══════════════════════════════════════════════════════
//  MODULE: core.js
//  Shared infrastructure for MultBot (NotXina/MultBot).
//  This file is fetched at runtime by index.js and
//  concatenated with the other modules - it's not the one
//  Tampermonkey manages as a script (that's index.js).
//  Project inspired by the original ModernBot (Sau1707),
//  but fully independent from it: module fetching, icons,
//  and storage no longer depend on that repository.
// ══════════════════════════════════════════════════════

var uw;
if (typeof unsafeWindow == 'undefined') {
	uw = window;
} else {
	uw = unsafeWindow;
}

/* ══════════════════════════════════════════════════════
   i18n: language detection + dictionary
   Runs ONCE when core.js loads (module-level, not per-instance),
   since every module would otherwise redo this detection on its
   own constructor.

   Detection order (first one that resolves wins):
   1) Game.locale, if it exists (most reliable when available)
   2) Grepolis hostname market prefix (e.g. "br147.grepolis.com" -> "br")
      This is the most consistently available signal - it doesn't
      depend on the Game object being ready yet.
   3) document.documentElement.lang
   4) 'en' as final fallback

   MARKET_LANG_MAP covers the market codes Grepolis has historically
   used as subdomain prefixes. Anything not in this map (or not
   matched at all) falls back to 'en'. */
const MULT_MARKET_LANG_MAP = {
	br: 'pt', pt: 'pt',
	de: 'de', at: 'de', ch: 'de',
	us: 'en', en: 'en', uk: 'en', gb: 'en', 'int': 'en',
	fr: 'fr',
	it: 'it',
	es: 'es',
	nl: 'nl',
	pl: 'pl',
	tr: 'tr',
	gr: 'el',
	ru: 'ru',
	se: 'sv',
	no: 'no',
	dk: 'da',
	fi: 'fi',
	cz: 'cs',
	sk: 'sk',
	hu: 'hu',
	ro: 'ro',
	bg: 'bg',
	hr: 'hr',
	rs: 'sr',
	si: 'sl',
	lt: 'lt',
	lv: 'lv',
	ee: 'et',
};

const MULT_LANG = (() => {
	try {
		if (uw.Game && uw.Game.locale) {
			const short = String(uw.Game.locale).toLowerCase().split(/[_-]/)[0];
			if (short) return short;
		}
	} catch (e) {}

	try {
		const host = (typeof location !== 'undefined' ? location.hostname : '') || '';
		const match = host.match(/^([a-z]+?)\d*\.grepolis\.com$/i);
		if (match) {
			const code = match[1].toLowerCase();
			if (MULT_MARKET_LANG_MAP[code]) return MULT_MARKET_LANG_MAP[code];
		}
	} catch (e) {}

	try {
		if (typeof document !== 'undefined' && document.documentElement.lang) {
			const short = document.documentElement.lang.toLowerCase().split(/[_-]/)[0];
			if (short) return short;
		}
	} catch (e) {}

	return 'en';
})();

/* Dictionary. Keys are plain English (also the fallback dict), so
   any key missing from a non-English language just shows the
   English text instead of breaking. Add new languages here as
   {code: {key: value, ...}} - no other file needs to change. */
const MULT_I18N = {
	en: {
		active: 'Active',
		stopped: 'Stopped',
		apply: 'Apply',
		error: 'Error',
		none_found: 'None found',
		tab_status: 'Status',
		tab_farm: 'Farm',
		tab_build: 'Build',
		tab_train: 'Train',
		tab_mix: 'Mix',
		tab_attack: 'Attack',
		tab_mult: 'Mult',
		tab_console: 'Console',
		module_failed: 'Module "{name}" failed to load. Check the console (F12) or the MultBot Console tab.',
		tooltip_build_and_train: 'Building + Training',
		tooltip_build: 'Building',
		tooltip_train: 'Training',
		auto_refresh_label: 'Auto Refresh:',
		status_disabled: 'Disabled',
		status_reloads_every: '✓ Reloads every {min} min (±30s)',
		row_farm: '🌾 Farm',
		row_rural: '🏡 Rural Villages',
		row_build: '🏗 Building',
		row_train: '⚔ Training',
		row_party: '🎉 Festivities',
		row_free_build: '⚡ Free Building',
		row_send_resources: '💰 Resource Sending',
		row_militia: '⚔️ Auto Militia',
		row_colonize_ship: '⚓ Colonize Ship',
		row_attack: '🗡️ Auto Attack',
		row_dodge: '🛡️ Auto Dodge',
		row_ares: '🔥 Ares Sacrifice',
		row_research: '📚 Auto Research',
		level_label: 'Level {n}',
		cities_count: '{n} cities',
		no_city: 'No city',
		label_party: 'party',
		label_theater: 'theater',
		label_triumph: 'triumph',
		mt_title: 'Building Presets',
		mt_buildings_label: 'Buildings',
		mt_buildings_desc: 'Max everything. Barracks→5, Wall→0.',
		mt_colonize_desc: 'Max colonize_ship in all cities.',
		mt_research_label: 'Auto Research',
		mt_research_desc: 'Turns on auto research in all cities.',
		mt_module_not_found: '{name} not found.',
		mt_no_city_found: 'No city found.',
		mt_preset_applied: '✓ Building preset: {count} cities.',
		mt_naval_applied: '✓ Colonize ship set up in {count} cities.',
		mt_research_applied: '✓ Auto Research active in {count} cities.',
		at_settings: 'Settings',
		at_passive: 'Passive',
		at_spell: 'Spell',
		at_title: 'Auto Train',
		click_to_reset: '(click to reset)',
		at_recruiting_log: '{town}: recruiting {count}x {unit} ({endpoint})',
		ab_title: 'Auto Build',
		click_to_toggle: '(click to toggle)',
		ab_presets_tooltip: 'Applies only to the currently active city',
		ab_presets_label: 'Presets (current city):',
		ab_preset_naval: 'Naval Preset',
		ab_preset_land: 'Land Preset',
		ab_naval_applied: 'Naval preset applied to {town}.',
		ab_land_applied: 'Land preset applied to {town}.',
		ab_naval_error: 'Error applying naval preset: {msg}',
		ab_land_error: 'Error applying land preset: {msg}',
		ab_on_log: '{town}: Auto Build On',
		ab_off_log: '{town}: Auto Build Off',
		ab_done_log: '{town}: Auto Build Done',
		ab_build_up_log: '{town}: Build Up {building}',
		ab_build_up_error_log: '✗ {town}: {building} — {error}',
		ab_build_down_log: '{town}: Build Down {building}',
		ab_blocked_log: '{town}: {building} blocked for {min}min (requirements not met) - skipping to the next building in the composition.',
		ab_error_hook_active: 'Native error message interceptor active.',
		ab_error_hook_failed: 'Could not intercept native messages: {msg}',
		ab_native_warning_log: 'Native game warning: "{message}" while trying to build {building} in {town}.',
		ab_observer_error: 'Observer error: {msg}',
		ap_title: 'Auto Party',
		ap_festival: 'Festival',
		ap_procession: 'Procession',
		ap_theater: 'Theater',
		ap_single: 'Single',
		ap_all: 'All',
		ap_none_active: 'No active celebration',
		ap_count_party: '🎉 <b>{n}</b> party(ies)',
		ap_count_theater: '🎭 <b>{n}</b> theater(s)',
		ap_count_triumph: '🏆 <b>{n}</b> triumph(s)',
		af_title: 'Mult Farm',
		af_duration: 'Duration:',
		af_storage: 'Storage:',
		af_gui: 'Gui:',
		ar_title: 'Auto Research',
		ar_desc: 'Automatically researches the next available technologies in all cities. Checks every 30s.',
		ar_started: 'Started.',
		ar_stopped_log: 'Stopped.',
		ar_done_label: 'Done:',
		ar_pending_label: 'Pending:',
		ar_research_started: '{town}: {tech} started',
		ar_subscribe_warning: 'Warning: could not subscribe to the town switch event: {msg}',
		css_title: 'Colonize Ship',
		css_target_label: 'Target (ID or [town]...[/town])',
		css_target_placeholder: 'City ID',
		css_save: 'Save',
		css_none_target: 'No target',
		css_interval_label: 'Interval (min)',
		css_invalid_id: 'Invalid ID.',
		css_target_saved: '✓ Target: {name}',
		css_invalid_interval: 'Invalid interval (minimum 1 minute).',
		css_interval_saved: 'Interval saved: {val} minute(s).',
		css_configure_target: 'Configure the target city before starting.',
		css_game_not_ready: 'Game is not ready. Try again.',
		css_loop_stopped: 'Loop stopped manually.',
		css_loop_started: 'Loop started. Interval: {min} min.',
		css_checking: 'Checking colonize_ships in all cities...',
		css_no_ships_available: 'No colonize_ship available.',
		css_sent_log: '✓ {town}: {count} ship(s) sent.',
		css_send_error: '✗ Error in {town}: {msg}',
		css_cycle_complete: 'Cycle complete. Total: {count} ship(s).',
		css_cycle_error: 'Error in cycle: {msg}',
		css_running: '● Running',
		css_stopped_status: '○ Stopped',
		at_trade_title: 'Auto Trade',
		at_trade_desc: 'Use <code>autoTradeBot</code> in the browser console to trigger manually.',
		at_starting_trade: 'Starting trade for {target} ({troop})',
		at_max_attempts: 'Attempt limit reached — aborting.',
		at_trade_complete: 'Trade complete.',
		at_safety_break: 'Safety break in trade loop.',
		at_send_error: 'Error sending from {town}: {msg}',
		at_transit_trade_error: 'Could not get trades in transit: {msg}',
		artr_trade_error: 'Error trading with rural: {msg}',
		arl_title: 'Auto Rural Level',
		arl_unlock_error: 'Error unlocking rural: {msg}',
		arl_upgrade_error: 'Error upgrading rural: {msg}',
		abc_title: 'Auto Bootcamp',
		abc_only_off: 'Only off',
		abc_off_def: 'Off & Def',
		abc_attack_error: 'Error attacking the training grounds: {msg}',
		abc_use_reward_error: 'Error using the reward: {msg}',
		abc_stash_error: 'Error stashing the reward, trying to use it directly: {msg}',
		ah_auto_label: 'Auto',
		ah_title: 'Auto Hide',
		ah_desc: 'Checks every 5 seconds; if there is more than 15000 iron, stores it in the hideout.',
		ah_error_hide_level: 'Hideout must be at level 10',
		ah_store_error: 'Error storing iron: {msg}',
		ager_title: 'Enchanted Rage',
		ager_desc1: 'An Enchanted version of the normal rage',
		ager_desc2: 'Made for those who try to troll with the autoclick',
		ager_desc3: 'Casts Purification and Rage at the same time',
		aas_title: 'Auto Sacrifice of {god}',
		aas_desc: 'Casts the Sacrifice of {god} as soon as there is {favor} favor accumulated AND at least {troops} own land troops in the selected city (excluding naval, mythical, godsent units and received support), until reaching {fury} fury. Checks every 20s.',
		aas_city_label: 'City',
		aas_select_city: 'Select a city...',
		aas_error_loading_cities: 'Error loading cities',
		aas_no_city_selected_log: 'Error: no city selected.',
		aas_select_city_log: 'Error: select a city.',
		aas_city_saved_log: 'City saved: {name} (#{id})',
		aas_city_saved_status: 'City saved: {name}',
		aas_select_before_start_log: 'Warning: select a city before starting.',
		aas_select_before_start_status: 'Select a city before starting.',
		aas_current_fury: 'Current fury: <b>{fury} / {max}</b>',
		aas_favor_account: ' | {god} favor (account): <b>{favor}</b>',
		aas_city_status: ' | City: <b>{name}</b>',
		aas_own_land_troops: ' | Own land troops: <b style="color:{color};">{count} / {min}</b>',
		aas_not_found: 'not found',
		aas_none_selected: 'none selected',
		aas_max_fury_reached_log: 'Maximum fury ({max}) reached. Stopping automatically.',
		aas_max_fury_reached_status: 'Maximum fury reached! Module stopped.',
		aas_city_not_found_log: 'Warning: city #{id} not found.',
		aas_waiting_reinforcement_log: '{town}: favor available, but only {count} own land troops (minimum {min}). Waiting for reinforcement.',
		aas_casting_log: '{town}: {favor} {god} favor and {count} own land troops available. Casting sacrifice...',
		aas_cast_success_log: '✓ Sacrifice cast! Fury now: {fury}/{max} | Remaining favor: {favor}',
		aas_cast_success_status: '✓ Sacrifice cast! Fury: {fury}/{max}',
		aas_human_message_success: 'MultBot: Sacrifice of {god} cast ({fury}/{max})',
		aas_cast_fail_log: '✗ Failed to cast the sacrifice: {reason}',
		aas_cast_fail_status: '✗ Failed: {reason}',
		aas_tick_error: 'Error in tick: {msg}',
		aas_server_response_log: 'Server response: {res}',
		aas_unknown_reason: 'unknown reason',
		aas_network_error_log: 'Network error: {err}',
		aas_network_error_reason: 'network error',
		aq_title: 'Auto Quest',
		aq_desc: 'Automatically claims island quest rewards as soon as they are ready. When a Good/Evil choice is available, picks whichever side has no cost (resources/troops) - skips the choice if both sides require something. Checks every 20s.',
		aq_ready_count: '{count} quest(s) ready to claim',
		aq_claimed_log: '✓ Claimed: {name}',
		aq_claim_fail_log: '✗ Failed to claim {name}: {reason}',
		aq_claim_network_error: '✗ Network error claiming {name}: {msg}',
		aq_decided_log: '✓ Chose the "{side}" path for: {name}',
		aq_side_good: 'Good',
		aq_side_evil: 'Evil',
		aq_decide_fail_log: '✗ Failed to decide {name}: {reason}',
		aq_decide_network_error: '✗ Network error deciding {name}: {msg}',
		aq_pending_forks: ', {count} choice(s) pending',
		mt_rename_label: 'City Names',
		mt_rename_desc: 'Renames all cities as OCxx-NN (ocean + sequence, ordered by city ID).',
		mt_renamed_log: '✓ {town}: renamed to {name}',
		mt_rename_error: '✗ {town}: rename failed - {msg}',
		mt_rename_complete: '✓ {count} cities renamed.',
	},
	pt: {
		active: 'Ativo',
		stopped: 'Parado',
		apply: 'Aplicar',
		error: 'Erro',
		none_found: 'Nenhuma encontrada',
		tab_status: 'Status',
		tab_farm: 'Fazendas',
		tab_build: 'Construção',
		tab_train: 'Recrutamento',
		tab_mix: 'Mix',
		tab_attack: 'Ataque',
		tab_mult: 'Mult',
		tab_console: 'Console',
		module_failed: 'Módulo "{name}" falhou ao carregar. Veja o console (F12) ou a aba Console do MultBot.',
		tooltip_build_and_train: 'Construção + Recrutamento',
		tooltip_build: 'Construção',
		tooltip_train: 'Recrutamento',
		auto_refresh_label: 'Auto Refresh:',
		status_disabled: 'Desativado',
		status_reloads_every: '✓ Recarrega a cada {min} min (±30s)',
		row_farm: '🌾 Fazenda',
		row_rural: '🏡 Aldeias Rurais',
		row_build: '🏗 Construção',
		row_train: '⚔ Recrutamento',
		row_party: '🎉 Festividades',
		row_free_build: '⚡ Construção Grátis',
		row_send_resources: '💰 Envio de Recursos',
		row_militia: '⚔️ Milícia Auto',
		row_colonize_ship: '⚓ Navio Colonizador',
		row_attack: '🗡️ Auto Ataque',
		row_dodge: '🛡️ Auto Fuga (Dodge)',
		row_ares: '🔥 Sacrifício de Ares',
		row_research: '📚 Auto Pesquisa',
		level_label: 'Nível {n}',
		cities_count: '{n} cidade(s)',
		no_city: 'Nenhuma cidade',
		label_party: 'festa',
		label_theater: 'teatro',
		label_triumph: 'triunfo',
		mt_title: 'Preset de Construções',
		mt_buildings_label: 'Construções',
		mt_buildings_desc: 'Máximo em tudo. Quartel→5, Muro→0.',
		mt_colonize_desc: 'Máximo de colonize_ship em todas.',
		mt_research_label: 'Auto Pesquisa',
		mt_research_desc: 'Liga a pesquisa automática em todas.',
		mt_module_not_found: '{name} não encontrado.',
		mt_no_city_found: 'Nenhuma cidade encontrada.',
		mt_preset_applied: '✓ Preset construções: {count} cidade(s).',
		mt_naval_applied: '✓ Colonize ship configurado em {count} cidade(s).',
		mt_research_applied: '✓ Auto Pesquisa ativo em {count} cidade(s).',
		at_settings: 'Configurações',
		at_passive: 'Passiva',
		at_spell: 'Feitiço',
		at_title: 'Auto Recrutamento',
		click_to_reset: '(clique pra resetar)',
		at_recruiting_log: '{town}: recrutando {count}x {unit} ({endpoint})',
		ab_title: 'Auto Build',
		click_to_toggle: '(clique pra ligar/desligar)',
		ab_presets_tooltip: 'Aplica somente na cidade atualmente ativa',
		ab_presets_label: 'Presets (cidade atual):',
		ab_preset_naval: 'Preset Naval',
		ab_preset_land: 'Preset Terrestre',
		ab_naval_applied: 'Preset Naval aplicado em {town}.',
		ab_land_applied: 'Preset Terrestre aplicado em {town}.',
		ab_naval_error: 'Erro ao aplicar preset naval: {msg}',
		ab_land_error: 'Erro ao aplicar preset terrestre: {msg}',
		ab_on_log: '{town}: Auto Build Ligado',
		ab_off_log: '{town}: Auto Build Desligado',
		ab_done_log: '{town}: Auto Build Concluído',
		ab_build_up_log: '{town}: Construindo {building}',
		ab_build_up_error_log: '✗ {town}: {building} — {error}',
		ab_build_down_log: '{town}: Demolindo {building}',
		ab_blocked_log: '{town}: {building} bloqueado por {min}min (requisitos não atendidos) - pulando para a próxima construção da composição.',
		ab_error_hook_active: 'Interceptador de mensagens nativas de erro ativo.',
		ab_error_hook_failed: 'Não foi possível interceptar mensagens nativas: {msg}',
		ab_native_warning_log: 'Aviso nativo do jogo: "{message}" ao tentar construir {building} em {town}.',
		ab_observer_error: 'Erro no Observer: {msg}',
		ap_title: 'Auto Festa',
		ap_festival: 'Festa',
		ap_procession: 'Desfile',
		ap_theater: 'Teatro',
		ap_single: 'Single',
		ap_all: 'All',
		ap_none_active: 'Nenhuma celebração ativa',
		ap_count_party: '🎉 <b>{n}</b> festa(s)',
		ap_count_theater: '🎭 <b>{n}</b> teatro(s)',
		ap_count_triumph: '🏆 <b>{n}</b> triunfo(s)',
		af_title: 'Mult Farm',
		af_duration: 'Duration:',
		af_storage: 'Storage:',
		af_gui: 'Gui:',
		ar_title: 'Auto Pesquisa',
		ar_desc: 'Pesquisa automaticamente as próximas tecnologias disponíveis em todas as cidades. Verifica a cada 30s.',
		ar_started: 'Iniciado.',
		ar_stopped_log: 'Parado.',
		ar_done_label: 'Concluídas:',
		ar_pending_label: 'Pendentes:',
		ar_research_started: '{town}: {tech} iniciado',
		ar_subscribe_warning: 'Aviso: não foi possível inscrever no evento de troca de cidade: {msg}',
		css_title: 'Navio Colonizador',
		css_target_label: 'Destino (ID ou [town]...[/town])',
		css_target_placeholder: 'ID da cidade',
		css_save: 'Salvar',
		css_none_target: 'Nenhum destino',
		css_interval_label: 'Intervalo (min)',
		css_invalid_id: 'ID inválido.',
		css_target_saved: '✓ Destino: {name}',
		css_invalid_interval: 'Intervalo inválido (mínimo 1 minuto).',
		css_interval_saved: 'Intervalo salvo: {val} minuto(s).',
		css_configure_target: 'Configure a cidade destino antes de iniciar.',
		css_game_not_ready: 'Jogo não está pronto. Tente novamente.',
		css_loop_stopped: 'Loop parado manualmente.',
		css_loop_started: 'Loop iniciado. Intervalo: {min} min.',
		css_checking: 'Verificando colonize_ships em todas as cidades...',
		css_no_ships_available: 'Nenhum colonize_ship disponível.',
		css_sent_log: '✓ {town}: {count} navio(s) enviado(s).',
		css_send_error: '✗ Erro em {town}: {msg}',
		css_cycle_complete: 'Ciclo completo. Total: {count} navio(s).',
		css_cycle_error: 'Erro no ciclo: {msg}',
		css_running: '● Rodando',
		css_stopped_status: '○ Parado',
		at_trade_title: 'Auto Trade',
		at_trade_desc: 'Use <code>autoTradeBot</code> no console do navegador para acionar manualmente.',
		at_starting_trade: 'Iniciando trade para {target} ({troop})',
		at_max_attempts: 'Limite de tentativas atingido — abortando.',
		at_trade_complete: 'Trade concluído.',
		at_safety_break: 'Safety break no loop de trade.',
		at_send_error: 'Erro ao enviar de {town}: {msg}',
		at_transit_trade_error: 'Não foi possível obter trades em trânsito: {msg}',
		artr_trade_error: 'Erro ao comerciar com rural: {msg}',
		arl_title: 'Auto Rural level',
		arl_unlock_error: 'Erro ao desbloquear rural: {msg}',
		arl_upgrade_error: 'Erro ao evoluir rural: {msg}',
		abc_title: 'Auto Bootcamp',
		abc_only_off: 'Só desligar',
		abc_off_def: 'Desligar e Def',
		abc_attack_error: 'Erro ao atacar o campo de treinamento: {msg}',
		abc_use_reward_error: 'Erro ao usar a recompensa: {msg}',
		abc_stash_error: 'Erro ao guardar a recompensa, tentando usar direto: {msg}',
		ah_auto_label: 'Auto',
		ah_title: 'Auto Hide',
		ah_desc: 'Verifica a cada 5 segundos; se tiver mais de 15000 de ferro, guarda no esconderijo.',
		ah_error_hide_level: 'O esconderijo precisa estar no nível 10',
		ah_store_error: 'Erro ao guardar ferro: {msg}',
		ager_title: 'Fúria Encantada',
		ager_desc1: 'Uma versão encantada da fúria normal',
		ager_desc2: 'Feito pra quem tenta trollar com o autoclick',
		ager_desc3: 'Lança Purificação e Fúria ao mesmo tempo',
		aas_title: 'Auto Sacrifício de {god}',
		aas_desc: 'Lança o Sacrifício de {god} assim que houver {favor} de favor acumulado E pelo menos {troops} tropas terrestres próprias na cidade selecionada (excluindo navais, míticas, Enviados Divinos e apoios recebidos), até atingir {fury} de fúria. Verifica a cada 20s.',
		aas_city_label: 'Cidade',
		aas_select_city: 'Selecione uma cidade...',
		aas_error_loading_cities: 'Erro ao carregar cidades',
		aas_no_city_selected_log: 'Erro: nenhuma cidade selecionada.',
		aas_select_city_log: 'Erro: selecione uma cidade.',
		aas_city_saved_log: 'Cidade salva: {name} (#{id})',
		aas_city_saved_status: 'Cidade salva: {name}',
		aas_select_before_start_log: 'Aviso: selecione uma cidade antes de iniciar.',
		aas_select_before_start_status: 'Selecione uma cidade antes de iniciar.',
		aas_current_fury: 'Fúria atual: <b>{fury} / {max}</b>',
		aas_favor_account: ' | Favor de {god} (conta): <b>{favor}</b>',
		aas_city_status: ' | Cidade: <b>{name}</b>',
		aas_own_land_troops: ' | Tropas terrestres próprias: <b style="color:{color};">{count} / {min}</b>',
		aas_not_found: 'não encontrada',
		aas_none_selected: 'nenhuma selecionada',
		aas_max_fury_reached_log: 'Fúria máxima ({max}) atingida. Parando automaticamente.',
		aas_max_fury_reached_status: 'Fúria máxima atingida! Módulo parado.',
		aas_city_not_found_log: 'Aviso: cidade #{id} não encontrada.',
		aas_waiting_reinforcement_log: '{town}: favor disponível, mas apenas {count} tropas terrestres próprias (mínimo {min}). Aguardando reforço.',
		aas_casting_log: '{town}: {favor} de favor de {god} e {count} tropas terrestres próprias disponíveis. Lançando sacrifício...',
		aas_cast_success_log: '✓ Sacrifício lançado! Fúria agora: {fury}/{max} | Favor restante: {favor}',
		aas_cast_success_status: '✓ Sacrifício lançado! Fúria: {fury}/{max}',
		aas_human_message_success: 'MultBot: Sacrifício de {god} lançado ({fury}/{max})',
		aas_cast_fail_log: '✗ Falha ao lançar o sacrifício: {reason}',
		aas_cast_fail_status: '✗ Falha: {reason}',
		aas_tick_error: 'Erro no tick: {msg}',
		aas_server_response_log: 'Resposta do servidor: {res}',
		aas_unknown_reason: 'motivo desconhecido',
		aas_network_error_log: 'Erro de rede: {err}',
		aas_network_error_reason: 'erro de rede',
		aq_title: 'Auto Quest',
		aq_desc: 'Reivindica automaticamente as recompensas de missões de ilha assim que ficam prontas. Quando há escolha entre Bem/Mal, escolhe o lado que não tem custo (recursos/tropas) - se os dois pedirem algo, deixa a decisão pra você. Verifica a cada 20s.',
		aq_ready_count: '{count} missão(ões) pronta(s) pra reivindicar',
		aq_claimed_log: '✓ Reivindicado: {name}',
		aq_claim_fail_log: '✗ Falha ao reivindicar {name}: {reason}',
		aq_claim_network_error: '✗ Erro de rede ao reivindicar {name}: {msg}',
		aq_decided_log: '✓ Escolhido o caminho "{side}" para: {name}',
		aq_side_good: 'Bem',
		aq_side_evil: 'Mal',
		aq_decide_fail_log: '✗ Falha ao decidir {name}: {reason}',
		aq_decide_network_error: '✗ Erro de rede ao decidir {name}: {msg}',
		aq_pending_forks: ', {count} escolha(s) pendente(s)',
		mt_rename_label: 'Nomes das Cidades',
		mt_rename_desc: 'Renomeia todas as cidades como OCxx-NN (oceano + sequência, ordenado por ID da cidade).',
		mt_renamed_log: '✓ {town}: renomeado para {name}',
		mt_rename_error: '✗ {town}: falha ao renomear - {msg}',
		mt_rename_complete: '✓ {count} cidade(s) renomeada(s).',
	},
};

console.log(`[MultBot] i18n: detected language "${MULT_LANG}" (hostname: ${typeof location !== 'undefined' ? location.hostname : 'n/a'})`);

/* Standalone version of the translation helper, usable from ANY file
   in the bundle - not just classes that extend MultUtil (e.g.
   MultBot itself, in multbot.js, does not extend MultUtil). This is
   what this.t() on MultUtil delegates to below.
   vars (optional): {name: 'X'} replaces "{name}" inside the string -
   lets a single translated sentence carry a dynamic value (module
   name, count, etc) without needing one dictionary key per value. */
function multT(key, vars) {
    const dict = MULT_I18N[MULT_LANG] || MULT_I18N.en;
    let text = dict[key] ?? MULT_I18N.en[key] ?? key;
    if (vars) {
        for (const k in vars) {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]);
        }
    }
    return text;
}

var style = document.createElement("style");
style.textContent = `.auto_build_up_arrow{background:url(https://gpit.innogamescdn.com/images/game/academy/up.png) no-repeat -2px -2px;width:18px;height:18px;position:absolute;right:-2px;bottom:12px;transform:scale(.8);cursor:pointer}.auto_build_down_arrow{background:url(https://gpit.innogamescdn.com/images/game/academy/up.png) no-repeat -2px -2px;width:18px;height:18px;position:absolute;right:-2px;bottom:-3px;transform:scale(.8) rotate(180deg);cursor:pointer}.auto_build_box{background:url(https://gpit.innogamescdn.com/images/game/academy/tech_frame.png) no-repeat 0 0;width:58px;height:59px;position:relative;overflow:hidden;display:inline-block;vertical-align:middle}.auto_build_building{position:absolute;top:4px;left:4px;width:50px;height:50px;background:url(https://gpit.innogamescdn.com/images/game/main/buildings_sprite_50x50.png) no-repeat 0 0}.auto_build_lvl{position:absolute;bottom:3px;left:3px;margin:0;font-weight:700;font-size:12px;color:#fff;text-shadow:0 0 2px #000,1px 1px 2px #000,0 2px 2px #000}#buildings_lvl_buttons{padding:5px;max-height:400px;user-select:none}#troops_lvl_buttons{padding:5px;max-height:400px;user-select:none}.progress_bar_auto{position:absolute;z-index:1;height:100%;left:0;top:0;background-image:url(https://gpit.innogamescdn.com/images/game/border/header.png);background-position:0 -1px;filter:brightness(100%) saturate(186%) hue-rotate(241deg)}.mult_bot_settings{z-index:10;position:absolute;top:52px!important;right:116px!important}.console_multbot{width:100%;height:100%;background-color:#000;color:#fff;font-family:monospace;font-size:16px;padding:20px;box-sizing:border-box;overflow-y:scroll;display:flex;flex-direction:column-reverse}#MULT_BOT_content{height:100%;overflow-y:auto;overflow-x:hidden;box-sizing:border-box;padding-right:4px}.console_multbot p{margin:1px}.population_icon_bot{background:url(https://gpit.innogamescdn.com/images/game/autogenerated/layout/layout_095495a.png) no-repeat -697px -647px;width:25px;height:20px;position:absolute;right:2px}.population_icon_bot p{text-align:end;position:absolute;right:30px;padding:0;margin:0;color:#000;font-weight:700}.split_content{width:100%;display:inline-flex;justify-content:space-between}@keyframes rotateForever{from{transform:rotate(0)}to{transform:rotate(360deg)}}.rotate-forever{animation:rotateForever 5s linear infinite;transform-origin:16px 15px;filter:hue-rotate(72deg) saturate(2.5)}.enabled .game_header{filter:brightness(100%) saturate(186%) hue-rotate(241deg)}.auto_build_box .unit_icon50x50{position:absolute!important;top:4px!important;left:4px!important;width:50px!important;height:50px!important;margin:0!important}`;
document.head.appendChild(style);

var MultUtil = class {
    /* CONSTANTS */

    REQUIREMENTS = {
        sword: {},
        archer: { research: 'archer' },
        hoplite: { research: 'hoplite' },
        slinger: { research: 'slinger' },
        catapult: { research: 'catapult' },
        rider: { research: 'rider', building: 'barracks', level: 10 },
        chariot: { research: 'chariot', building: 'barracks', level: 15 },
        big_transporter: { building: 'docks', level: 1 },
        small_transporter: { research: 'small_transporter', building: 'docks', level: 1 },
        bireme: { research: 'bireme', building: 'docks', level: 1 },
        attack_ship: { research: 'attack_ship', building: 'docks', level: 1 },
        trireme: { research: 'trireme', building: 'docks', level: 1 },
        colonize_ship: { research: 'colonize_ship', building: 'docks', level: 10 },
    };

    constructor(console, storage) {
        this.console = console;
        this.storage = storage;
    }

    /* Translation helper, available on every module (all of them
       extend MultUtil). Usage: this.t('active') -> "Active" or
       "Ativo" depending on the detected client language. Falls back
       to English if the key doesn't exist in the detected language,
       and to the key itself if it doesn't exist in English either
       (so a missing translation never breaks rendering - worst case
       you see the raw key instead of a crash). */
    t = (key, vars) => multT(key, vars);

    /* Returns the TRANSLATED name of a unit, building, research,
       god, or HERO, straight from the game's native data (uw.GameData) -
       always matches the client's configured language, no manual
       dictionary. Categories: 'unit', 'building', 'research', 'god', 'hero'.
       Safe fallback to the ID itself if the data doesn't exist.
       Confirmed: uw.GameData.heroes[id].name exists and comes translated
       (e.g. "andromeda" -> "Andromeda"). */
    getGameName = (category, id) => {
        try {
            if (category === 'unit') {
                const d = uw.GameData.units[id];
                if (d && d.name) return d.name;
            } else if (category === 'building') {
                const d = uw.GameData.buildings[id];
                if (d && d.name) return d.name;
            } else if (category === 'research') {
                const d = uw.GameData.researches[id];
                if (d && d.name) return d.name;
            } else if (category === 'god') {
                const gods = uw.GameData.gods;
                const d = gods ? gods[id] : null;
                if (d && d.name) return d.name;
            } else if (category === 'hero') {
                const heroes = uw.GameData.heroes;
                const d = heroes ? heroes[id] : null;
                if (d && d.name) return d.name;
            }
        } catch (e) {}
        return id;
    };

    /* SINGLE SOURCE for "display name of a town from its ID".
       3 sources in order: 1) uw.ITowns.towns (the player's own towns,
       fastest); 2) Backbone Town collection (catches other players'
       towns that already passed through the game's cache, e.g.
       attack/colonization targets); 3) uw.WMap.towns as a last,
       legacy fallback.
       Source 2 was folded in here after it was born duplicated inside
       colonize_ship_sender.js — it resolved names that sources 1 and 3
       couldn't (target towns that aren't the player's own). */
    getTownName = (townId) => {
        if (!townId) return String(townId);

        const id = parseInt(townId);
        const ids = String(townId);

        try {
            const towns = (uw.ITowns && uw.ITowns.towns) ? uw.ITowns.towns : {};
            const t1 = towns[id] ? towns[id] : towns[ids];
            if (t1 && typeof t1.getName === 'function') {
                return t1.getName() + ' (#' + ids + ')';
            }

            const allTowns = uw.MM?.getOnlyCollectionByName('Town')?.models ?? [];
            for (const t of allTowns) {
                const tid = t.attributes?.id ?? t.id;
                if (parseInt(tid) === id) {
                    return (t.attributes?.name ?? '?') + ' (#' + ids + ')';
                }
            }

            const wmapTowns = (uw.WMap && uw.WMap.towns) ? uw.WMap.towns : {};
            const wt = wmapTowns[id] ? wmapTowns[id] : wmapTowns[ids];
            if (wt && wt.name) {
                return wt.name + ' (#' + ids + ')';
            }
        } catch (e) {}

        return '#' + ids;
    };

    /* extraFlag: some game endpoints (e.g. town_info/trade) expect
       `true` in this 4th parameter of the native ajaxPost. Default
       false preserves the behavior of all existing callers. */
    ajaxPostWithTimeout = (endpoint, action, data, timeoutMs = 15000, extraFlag = false) => {
        return new Promise((resolve, reject) => {
            let settled = false;

            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error('Network timeout (' + timeoutMs + 'ms) on ' + endpoint + '/' + action));
            }, timeoutMs);

            uw.gpAjax.ajaxPost(endpoint, action, data, extraFlag,
                (res) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    resolve(res);
                },
                (r, status, txt) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    reject(new Error('Network error: ' + txt));
                }
            );
        });
    };

    /* Equivalent to ajaxPostWithTimeout, but for ajaxGet calls.
       Without this, an ajaxGet call that never calls either the
       success or the error callback (endpoint changed, unexpected
       response, etc) leaves the Promise hanging FOREVER - the await
       never returns, no exception is thrown, and whoever is waiting
       (e.g. auto_farm.js) hangs silently with no error log. */
    ajaxGetWithTimeout = (endpoint, action, data, timeoutMs = 15000) => {
        return new Promise((resolve, reject) => {
            let settled = false;

            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error('Network timeout (' + timeoutMs + 'ms) on ' + endpoint + '/' + action));
            }, timeoutMs);

            uw.gpAjax.ajaxGet(endpoint, action, data, false,
                (res) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    resolve(res);
                },
                (r, status, txt) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    reject(new Error('Network error: ' + txt));
                }
            );
        });
    };

    createGuardedInterval = (fn, intervalMs) => {
        let processing = false;
        return setInterval(async () => {
            if (processing) return;
            processing = true;
            try {
                await fn();
            } catch (e) {
                // errors should already be handled inside fn; this is just a safety net
            } finally {
                processing = false;
            }
        }, intervalMs);
    };

    sleep = (ms, stdDev) => {
        if (typeof stdDev === 'undefined') return new Promise(resolve => setTimeout(resolve, ms));

        const mean = ms;
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);

        num = num * stdDev + mean;
        return new Promise(resolve => setTimeout(resolve, num));
    };

    generateList = () => {
        const townList = uw.MM.getOnlyCollectionByName('Town').models;
        const islandsList = [];
        const polisList = [];

        for (const town of townList) {
            const { island_id, id, on_small_island } = town.attributes;

            if (on_small_island) continue;

            if (!islandsList.includes(island_id)) {
                islandsList.push(island_id);
                polisList.push(id);
            }
        }

        return polisList;
    };

    getButtonHtml(id, text, fn, props) {
        const name = this.constructor.name.charAt(0).toLowerCase() + this.constructor.name.slice(1);
        props = isNaN(parseInt(props)) ? `'${props}'` : props;
        const click = `window.multBot.${name}.${fn.name}(${props || ''})`;

        return `
      <div id="${id}" style="cursor: pointer" class="button_new" onclick="${click}">
        <div class="left"></div>
        <div class="right"></div>
        <div class="caption js-caption"> ${text} <div class="effect js-effect"></div></div>
      </div>`;
    }

    getTitleHtml(id, text, fn, props, enable, desc = '(click to toggle)') {
        const name = this.constructor.name.charAt(0).toLowerCase() + this.constructor.name.slice(1);
        props = isNaN(parseInt(props)) && props ? `"${props}"` : props;
        const click = `window.multBot.${name}.${fn.name}(${props || ''})`;
        const filter = 'brightness(100%) saturate(186%) hue-rotate(241deg)';

        return `
        <div class="game_border_top"></div>
        <div class="game_border_bottom"></div>
        <div class="game_border_left"></div>
        <div class="game_border_right"></div>
        <div class="game_border_corner corner1"></div>
        <div class="game_border_corner corner2"></div>
        <div class="game_border_corner corner3"></div>
        <div class="game_border_corner corner4"></div>
        <div id="${id}" style="cursor: pointer; filter: ${enable ? filter : ''}" class="game_header bold" onclick="${click}">
            ${text}
            <span class="command_count"></span>
            <div style="position: absolute; right: 10px; top: 4px; font-size: 10px;"> ${desc} </div>
        </div>`;
    }

    countPopulation(obj) {
        const data = uw.GameData.units;
        let total = 0;
        for (let key in obj) {
            total += data[key].population * obj[key];
        }
        return total;
    }

    isActive(type) {
        return uw.GameDataPremium.isAdvisorActivated(type);
    }

    createButton = (id, text, fn) => {
        const $button = uw.$('<div>', {
            'id': id,
            'class': 'button_new',
        });

        $button.append(uw.$('<div>', { 'class': 'left' }));
        $button.append(uw.$('<div>', { 'class': 'right' }));
        $button.append(uw.$('<div>', {
            'class': 'caption js-caption',
            'html': `${text} <div class="effect js-effect"></div>`
        }));

        if (fn) uw.$(document).on('click', `#${id}`, fn);

        return $button;
    }

    createTitle = (id, text, fn, desc = '(click to toggle)') => {
        const $div = uw.$('<div>').addClass('game_header bold').attr('id', id).css({
            cursor: 'pointer',
            position: 'relative',
        }).html(text);

        const $span = uw.$('<span>').addClass('command_count');
        const $descDiv = uw.$('<div>').css({
            position: 'absolute',
            right: '10px',
            top: '4px',
            fontSize: '10px'
        }).text(desc);

        $div.append($span).append($descDiv);
        if (fn) uw.$(document).on('click', `#${id}`, fn);

        return uw.$('<div>')
            .append('<div class="game_border_top"></div>')
            .append('<div class="game_border_bottom"></div>')
            .append('<div class="game_border_left"></div>')
            .append('<div class="game_border_right"></div>')
            .append('<div class="game_border_corner corner1"></div>')
            .append('<div class="game_border_corner corner2"></div>')
            .append('<div class="game_border_corner corner3"></div>')
            .append('<div class="game_border_corner corner4"></div>')
            .append($div);
    }

    createActivity = (background) => {
        const $activity_wrap = uw.$('<div class="activity_wrap"></div>');
        const $activity = uw.$('<div class="activity"></div>');
        const $icon = uw.$('<div class="icon"></div>').css({
            "background": background,
            "position": "absolute",
            "top": "-1px",
            "left": "-1px",
        });
        const $count = uw.$('<div class="count js-caption"></div>').text(0);
        $icon.append($count);
        $activity.append($icon);
        $activity_wrap.append($activity);
        return { $activity, $count };
    }

    createPopup = (left, width, height, $content) => {
        const $box = uw.$('<div class="sandy-box js-dropdown-list" id="toolbar_activity_recruits_list"></div>').css({
            "left": `${left}px`,
            "position": "absolute",
            "width": `${width}px`,
            "height": `${height}px`,
            "top": "29px",
            "margin-left": "0px",
            "display": "none",
        });

        const $corner_tl = uw.$('<div class="corner_tl"></div>');
        const $corner_tr = uw.$('<div class="corner_tr"></div>');
        const $corner_bl = uw.$('<div class="corner_bl"></div>');
        const $corner_br = uw.$('<div class="corner_br"></div>');
        const $border_t = uw.$('<div class="border_t"></div>');
        const $border_b = uw.$('<div class="border_b"></div>');
        const $border_l = uw.$('<div class="border_l"></div>');
        const $border_r = uw.$('<div class="border_r"></div>');
        const $middle = uw.$('<div class="middle"></div>').css({
            "left": "10px",
            "right": "20px",
            "top": "14px",
            "bottom": "20px",
        });

        const $middle_content = uw.$('<div class="content js-dropdown-item-list"></div>').append($content);
        $middle.append($middle_content);

        $box.append($corner_tl, $corner_tr, $corner_bl, $corner_br, $border_t, $border_b, $border_l, $border_r, $middle);
        return $box;
    }

};

/* The About class (version check against the original ModernBot
   repo) was removed from here - it was never instantiated by
   multbot.js (dead code) and was the last network call that
   depended on Sau1707's repository. */

var BotConsole = class {
	MAX_ENTRIES = 200;

	constructor() {
		this.string = [];
		this.updateSettings();
	}

	renderSettings = () => {
		setTimeout(() => {
			this.updateSettings();
			let interval = setInterval(() => {
				this.updateSettings();
				if (!uw.$('#mult_console').length) clearInterval(interval);
			}, 1000);
		}, 100);
		return `<div class="console_multbot" id="mult_console"><div>`;
	};

	log = (string) => {
		const date = new Date();
		const time = date.toLocaleTimeString();
		this.string.push(`[${time}] ${string}`);

		if (this.string.length > this.MAX_ENTRIES) {
			this.string.splice(0, this.string.length - this.MAX_ENTRIES);
		}
	};

	updateSettings = () => {
		let console = uw.$('#mult_console');
		this.string.forEach((e, i) => {
			if (uw.$(`#log_id_${i}`).length) return;
			console.prepend(`<p id="log_id_${i}">${e}</p>`);
		});

		const validIds = new Set(this.string.map((_, i) => `log_id_${i}`));
		console.find('p').each(function () {
			if (!validIds.has(this.id)) uw.$(this).remove();
		});
	};
};

var Compressor = class {
	NUMBERS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
	SYMBOLS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-./:;<=>?@[]^_`{|}~';

	ITEMS = {
		academy: 'a',
		barracks: 'b',
		docks: 'd',
		farm: 'f',
		hide: 'h',
		ironer: 'i',
		lumber: 'l',
		main: 'm',
		market: 'k',
		stoner: 'c',
		storage: 's',
		temple: 't',
		wall: 'w',

		sword: 'A',
		archer: 'B',
		hoplite: 'C',
		slinger: 'D',
		rider: 'E',
		chariot: 'F',
		catapult: 'G',
		big_transporter: 'H',
		small_transporter: 'I',
		bireme: 'L',
		demolition_ship: 'M',
		attack_ship: 'N',
		trireme: 'O',
		colonize_ship: 'P',
	};

	constructor() {
		const swap = json => {
			var ret = {};
			for (var key in json) {
				ret[json[key]] = key;
			}
			return ret;
		};

		this.ITEMS_REV = swap(this.ITEMS);
	}

	encode(storage) {
		for (let item in storage) {
			if (typeof storage[item] !== 'object') continue;

			if (item == 'buildings') {
				for (let polis_id in storage[item]) {
					let obj = storage[item][polis_id];
					storage[item][polis_id] = this.encode_building(obj);
				}
			}

			if (item == 'troops') {
				for (let polis_id in storage[item]) {
					let obj = storage[item][polis_id];
					storage[item][polis_id] = this.encode_troops(obj);
				}
			}
		}

		return storage;
	}

	decode(storage) {
		for (let item in storage) {
			if (typeof storage[item] !== 'object') continue;

			if (item == 'buildings') {
				for (let polis_id in storage[item]) {
					let str = storage[item][polis_id];
					storage[item][polis_id] = this.decode_bulding(str);
				}
			}

			if (item === 'troops') {
				for (let polis_id in storage[item]) {
					let str = storage[item][polis_id];
					storage[item][polis_id] = this.decode_troops(str);
				}
			}
		}

		return storage;
	}

	compressNumber(num) {
		let base = this.SYMBOLS.length;
		let digits = [];
		while (num > 0) {
			digits.unshift(this.SYMBOLS[num % base]);
			num = Math.floor(num / base);
		}
		if (digits.length == 1) {
			digits.unshift('0');
		}
		return digits.slice(-2).join('');
	}

	decompressNumber(str) {
		let base = this.SYMBOLS.length;
		let digits = str.split('');
		let num = 0;
		for (let i = 0; i < digits.length; i++) {
			num += this.SYMBOLS.indexOf(digits[i]) * Math.pow(base, digits.length - i - 1);
		}
		return num;
	}

	encode_building(obj) {
		let str = '';
		for (let item in obj) {
			str += this.ITEMS[item] + this.NUMBERS[obj[item]];
		}
		return str;
	}

	decode_bulding(str) {
		let json_str = '{';
		for (let item of str.match(/.{1,2}/g)) {
			json_str += `"${this.ITEMS_REV[item[0]]}"` + ':' + this.NUMBERS.indexOf(item[1]) + ',';
		}
		json_str = json_str.replace(/,$/, '}');
		return JSON.parse(json_str);
	}

	encode_troops(obj) {
		let str = '';
		for (let item in obj) {
			str += this.ITEMS[item] + this.compressNumber(obj[item]);
		}
		return str;
	}

	decode_troops(str) {
		let json_str = '{';
		for (let item of str.match(/.{1,3}/g)) {
			json_str += `"${this.ITEMS_REV[item[0]]}"` + ':' + this.decompressNumber(item.slice(-2)) + ',';
		}
		json_str = json_str.replace(/,$/, '}');
		return JSON.parse(json_str);
	}
};

/* 
    Create a new window
 */

var createGrepoWindow = class {
	constructor({ id, title, size, tabs, start_tab, minimizable = true }) {
		this.minimizable = minimizable;
		this.width = size[0];
		this.height = size[1];
		this.title = title;
		this.id = id;
		this.tabs = tabs;
		this.start_tab = start_tab;

		const createWindowType = (name, title, width, height, minimizable) => {
			function WndHandler(wndhandle) {
				this.wnd = wndhandle;
			}
			Function.prototype.inherits.call(WndHandler, uw.WndHandlerDefault);
			WndHandler.prototype.getDefaultWindowOptions = function () {
				return {
					position: ['center', 'center', 100, 100],
					width: width,
					height: height,
					minimizable: minimizable,
					title: title,
				};
			};
			uw.GPWindowMgr.addWndType(name, `${name}_75624`, WndHandler, 1);
		};

		const getTabById = (id) => {
			return this.tabs.filter((tab) => tab.id === id)[0];
		};

		this.activate = function () {
			createWindowType(this.id, this.title, this.width, this.height, this.minimizable);
			uw.$(
				`<style id="${this.id}_custom_window_style">
                 #${this.id} .tab_icon { left: 23px;}
                 #${this.id} {top: -36px; right: 95px;}
                 #${this.id} .submenu_link {color: #000;}
                 #${this.id} .submenu_link:hover {text-decoration: none;}
                 #${this.id} li { float:left; min-width: 60px; }
                 </style>
                `,
			).appendTo('head');
		};

		this.deactivate = function () {
			if (uw.Layout.wnd.getOpenFirst(uw.GPWindowMgr[`TYPE_${this.id}`])) {
				uw.Layout.wnd.getOpenFirst(uw.GPWindowMgr[`TYPE_${this.id}`]).close();
			}
			uw.$(`#${this.id}_custom_window_style`).remove();
		};

		this.openWindow = function () {
			let wn = uw.Layout.wnd.getOpenFirst(uw.GPWindowMgr[`TYPE_${this.id}`]);

			if (wn) {
				if (wn.isMinimized()) {
					wn.maximizeWindow();
				}
				return;
			}

			let content = `<ul id="${this.id}" class="menu_inner"></ul><div id="${this.id}_content"> </div>`;
			uw.Layout.wnd.Create(uw.GPWindowMgr[`TYPE_${this.id}`]).setContent(content);
			this.tabs.forEach((e) => {
				let html = `
                    <li><a id="${e.id}" class="submenu_link" href="#"><span class="left"><span class="right"><span class="middle">
                    <span class="tab_label"> ${e.title} </span>
                    </span></span></span></a></li>
                `;
				uw.$(html).appendTo(`#${this.id}`);
			});

			let tabs = '';
			this.tabs.forEach((e) => {
				tabs += `#${this.id} #${e.id}, `;
			});
			tabs = tabs.slice(0, -2);
			let self = this;
			uw.$(tabs).click(function () {
				self.renderTab(this.id);
			});
			this.renderTab(this.tabs[this.start_tab].id);
		};

		this.closeWindow = function () {
			uw.Layout.wnd.getOpenFirst(uw.GPWindowMgr[`TYPE_${this.id}`]).close();
		};

		this.renderTab = function (id) {
			let tab = getTabById(id);
			uw.$(`#${this.id}_content`).html(getTabById(id).render());
			uw.$(`#${this.id} .active`).removeClass('active');
			uw.$(`#${id}`).addClass('active');
			getTabById(id).afterRender ? getTabById(id).afterRender() : '';
		};
	}
};

var MultStorage = class extends Compressor {
	constructor() {
		super();
		this.check_done = 0;

		uw.$.Observer(uw.GameEvents.window.open).subscribe((e, i) => {
			if (!i.attributes) return;
			if (i.attributes.window_type != 'notes') return;
			setTimeout(this.addButton, 100);
		});
		uw.$.Observer(uw.GameEvents.window.tab.rendered).subscribe((e, i) => {
			const { attributes } = i.window_model;
			if (!attributes) return;
			if (attributes.window_type !== 'notes') return;
			requestAnimationFrame(this.addButton);
		});
	}

	getStorage = () => {
		const worldId = uw.Game.world_id;
		const newKey = `${worldId}_multBot`;
		let savedValue = localStorage.getItem(newKey);

		/* Automatic, one-time migration: if the new key still has
		   nothing but the old key (_modernBot, from before the class
		   rename) has data, copy it to the new key. The old key is NOT
		   deleted - it stays there as an inert backup, just in case.
		   Without this, everyone would lose their saved attack
		   plans/presets/etc as soon as this update went live. */
		if (savedValue === null || savedValue === undefined) {
			const legacyKey = `${worldId}_modernBot`;
			const legacyValue = localStorage.getItem(legacyKey);
			if (legacyValue !== null && legacyValue !== undefined) {
				savedValue = legacyValue;
				try {
					localStorage.setItem(newKey, legacyValue);
					console.log('[MultBot] Settings migrated from ' + legacyKey + ' to ' + newKey + '.');
				} catch (e) {}
			}
		}

		let storage = {};

		if (savedValue !== null && savedValue !== undefined) {
			try {
				storage = JSON.parse(savedValue);
			} catch (error) {
				console.error(`Error parsing localStorage data: ${error}`);
			}
		}

		return storage;
	};

	saveStorage = storage => {
		try {
			const worldId = uw.Game.world_id;
			localStorage.setItem(`${worldId}_multBot`, JSON.stringify(storage));
			this.lastUpdateTime = Date.now();
			return true;
		} catch (error) {
			console.error(`Error saving data to localStorage: ${error}`);
			return false;
		}
	};

	save = (key, content) => {
		const storage = this.getStorage();
		storage[key] = content;
		return this.saveStorage(storage);
	};

	load = (key, defaultValue = null) => {
		const storage = this.getStorage();
		const savedValue = storage[key];
		return savedValue !== undefined ? savedValue : defaultValue;
	};

	saveSettingsNote = note_id => {
		const storage = JSON.stringify(this.encode(this.getStorage()));
		const data = {
			model_url: `PlayerNote/${note_id}`,
			action_name: 'save',
			arguments: {
				id: note_id,
				text: storage,
			},
		};
		uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data);
		return storage;
	};

	addButton = () => {
		this.check_done += 1;
		if (uw.$('#mult_storage_load').length) return;

		const mult_settings_load = uw.$('<div/>', {
			class: 'button_new',
			id: 'mult_storage_load',
			style: 'position: absolute; bottom: 5px; left: 6px; ',
			onclick: 'multBot.storage.loadSettings()',
			html: '<div class="left"></div><div class="right"></div><div class="caption js-caption"> Load <div class="effect js-effect"></div></div>',
		});

		const mult_settings_save = uw.$('<div/>', {
			class: 'button_new',
			id: 'mult_storage_save',
			style: 'position: absolute; bottom: 5px; left: 75px; ',
			onclick: 'multBot.storage.saveSettings()',
			html: '<div class="left"></div><div class="right"></div><div class="caption js-caption"> Save <div class="effect js-effect"></div></div>',
		});

		const box = uw.$('.notes_container');
		if (box.length) {
			uw.$('.notes_container').append(mult_settings_load, mult_settings_save);
		} else {
			if (this.check_done > 10) {
				this.check_done = 0;
				return;
			}
			setTimeout(this.addButton, 100);
		}
	};

	saveSettings = () => {
		uw.ConfirmationWindowFactory.openSimpleConfirmation(
			'MultStorage',
			'This operation will overwrite the current note with the local settings of the MultBot',
			() => {
				const note = this.getActiveNote();
				if (!note) return;
				const content = this.saveSettingsNote(note.id);
				uw.$('.preview_box').text(content);
			},
			() => {}
		);
	};

	loadSettings = () => {
		uw.ConfirmationWindowFactory.openSimpleConfirmation(
			'MultStorage',
			'This operation will load the settings of the current note and overwrite the local settings',
			() => {
				const note = this.getActiveNote();
				const { text } = note.attributes;
				let decoded;
				try {
					decoded = this.decode(JSON.parse(text));
				} catch {
					uw.HumanMessage.error("This note don't contains the settings");
					return;
				}

				this.saveStorage(decoded);
				location.reload();
			},
			() => {}
		);
	};

	getActiveNote() {
		const noteClass = uw.$('.tab.selected').attr('class');
		if (!noteClass) return null;
		const noteX = noteClass.match(/note(\d+)/)[1];
		const note_index = parseInt(noteX) - 1;

		const collection = uw.MM.getOnlyCollectionByName('PlayerNote');
		if (!collection) return null;
		let { models } = collection;

		return models[note_index];
	}
};

window.__multbot_captcha_active = false;
