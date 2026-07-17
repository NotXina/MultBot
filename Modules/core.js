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
var __MultBotI18N = {};

__MultBotI18N.marketLangMap = {
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

__MultBotI18N.lang = (() => {
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
			if (__MultBotI18N.marketLangMap[code]) return __MultBotI18N.marketLangMap[code];
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
__MultBotI18N.dict = {
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
		sleeper_label: 'Sleeper:',
		sleeper_to: 'to',
		sleeper_desc: 'While active, pauses ALL other modules during this daily window - except Auto Militia and Auto Dodge, which keep running for defense.',
		sleeper_invalid: 'Set both a start and end time.',
		sleeper_enabled_log: 'Enabled: {start} - {end} (pauses everything except Militia and Dodge).',
		sleeper_disabled_log: 'Disabled.',
		sleeper_disable: 'Disable',
		sleeper_active_now: '😴 Sleeping now - other modules paused',
		sleeper_scheduled: '⏰ Scheduled (not active right now)',
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
		mt_colonize_label: 'Colonize Ships',
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
		artr_title: 'Auto Trade resources',
		artr_click_to_stop: '(click to stop)',
		artr_iron: 'Iron',
		artr_stone: 'Stone',
		artr_wood: 'Wood',
		artr_loop_error: 'Error in trade loop: {msg}',
		arl_title: 'Auto Rural Level',
		arl_unlock_error: 'Error unlocking rural: {msg}',
		arl_upgrade_error: 'Error upgrading rural: {msg}',
		arl_unlocked_log: 'Island {island}: unlocked {name}',
		arl_upgraded_log: 'Island {island}: upgraded {name}',
		arl_main_error: 'Error in main loop: {msg}',
		arl_unlock_fail_log: 'Failed to unlock {name} (island {island}): {reason}',
		arl_upgrade_fail_log: 'Failed to upgrade {name} (island {island}): {reason}',
		abc_title: 'Auto Bootcamp',
		abc_only_off: 'Only off',
		abc_off_def: 'Off & Def',
		abc_attack_error: 'Error attacking the training grounds: {msg}',
		abc_use_reward_error: 'Error using the reward: {msg}',
		abc_stash_error: 'Error stashing the reward, trying to use it directly: {msg}',
		abc_main_error: 'Error in main loop: {msg}',
		ah_auto_label: 'Auto',
		ah_title: 'Auto Hide',
		ah_desc: 'Applies to all cities with a level 10 hideout. Checks every 5 seconds; if a city has more than 15000 iron, stores {amount} in the hideout.',
		ah_error_hide_level: 'Hideout must be at level 10',
		ah_store_error: 'Error storing iron: {msg}',
		ah_eligible_count: '{count} eligible cit(ies) (hideout level 10)',
		ah_stored_log: '✓ {town}: {amount} iron stored',
		am_title: 'Auto Militia',
		am_desc: 'Activates militia ~8s before impact in towns under attack.',
		am_started_log: 'Started. Monitoring attacks...',
		am_stopped_log: 'Stopped.',
		am_scheduled_log: 'Scheduled: {town} in {sec}s',
		am_tick_error: 'Error: {msg}',
		am_activating_log: 'Activating militia in {town}...',
		am_activated_log: '✓ Militia activated in {town}',
		am_activate_fail_log: '✗ Failed in {town}: {reason}',
		am_activate_exception_log: 'Exception/timeout in #{id}: {msg}',
		ad_title: 'Auto Dodge',
		ad_tooltip: 'Sends reinforcement to any known town on the island. If none exist in the cache, the evacuation is skipped.',
		ad_desc: 'Evacuates troops {sec}s before impact to a random town on the same island, with automatic return.',
		ad_started_log: 'Started. Monitoring attacks...',
		ad_stopped_log: 'Stopped.',
		ad_island_scraper_active_log: 'Island learning active (watching windows opened on the map).',
		ad_learned_towns_log: 'Learned {n} new town(s) in the island cache.',
		ad_safety_evac_log: 'Safety net: {town} is {sec}s from impact - evacuating immediately.',
		ad_evac_scheduled_log: 'Evacuation scheduled: {from} -> {to} in {sec}s ({lead}s before impact).',
		ad_evac_scheduled_no_island_log: 'Warning: {town} scheduled in {sec}s, but NO known town on the same island yet.',
		ad_tick_error: 'Error in tick: {msg}',
		ad_find_island_error: 'Error looking for a town on the same island: {msg}',
		ad_evac_no_island_log: 'Warning: {town} - no known town on the same island. Evacuation skipped.',
		ad_evac_no_island_status: 'Warning: {town} has no town on the same island.',
		ad_no_troops_log: '{town}: no troops to evacuate.',
		ad_evacuating_log: 'Evacuating {town} to {safe}...',
		ad_no_land_troops_log: '{town}: no land troops, skipping this group.',
		ad_no_naval_troops_log: '{town}: no naval troops, skipping this group.',
		ad_evacuated_log: '{town} evacuated to {safe}!',
		ad_evacuate_error: 'Error evacuating #{id}: {msg}',
		ad_group_response_log: 'Server response ({label}): {res}',
		ad_command_found_log: '{town} ({label}): commandId found: #{id}',
		ad_command_not_found_log: 'Warning: {town} ({label}) - command id not found. Manual recall needed.',
		ad_command_not_found_status: 'Warning: {town} ({label}) - automatic recall unavailable.',
		ad_send_group_fail_log: 'FAILED to send {label} from {town}: {msg}',
		ad_recall_scheduled_log: '{town} ({label}): return scheduled for {sec}s from now (command #{id}).',
		ad_reconcile_start_log: 'Reconciling {n} pending recall(s) after load...',
		ad_reconcile_fire_now_log: 'Recall for {town} ({label}) should have already fired - firing now.',
		ad_reconcile_reschedule_log: 'Recall for {town} ({label}) rescheduled for {sec}s from now.',
		ad_reconcile_error: 'Error reconciling pending recalls: {msg}',
		ad_recall_calling_log: '{town} ({label}): calling troops back (command #{id})...',
		ad_recall_response_log: 'Recall response ({label}): {res}',
		ad_recall_success_log: '{town} ({label}): troops returning!',
		ad_recall_fail_log: 'Failed to recall {town} ({label}): {res}',
		ad_recall_fail_status: 'Recall failed for {town} ({label}). Bring back manually.',
		ad_recall_network_error: 'Error recalling {town} ({label}): {msg}',
		aat_title: 'Auto Attack',
		aat_desc: 'Attacks automatically once the composition is available. Checks every 20s.',
		aat_origin_label: 'Attacking City',
		aat_rest_tooltip: 'Wait before re-attacking the same target, +-10% variation. 0 = no wait.',
		aat_rest_label: 'Rest (min)',
		aat_hero_tooltip: 'Optional. Sends this hero along with the attack, if it is available in the attacking city at the moment of firing.',
		aat_hero_label: 'Hero (optional)',
		aat_unit_label: 'Unit',
		aat_qty_label: 'Qty',
		aat_max_tooltip: 'Always sends ALL available units of this type at the moment of the attack.',
		aat_max_label: 'Max',
		aat_add_unit_btn: '+ Unit',
		aat_targets_label: 'Target cities (ID, comma or line separated)',
		aat_targets_placeholder: 'e.g.: 12345, 67890',
		aat_add_plan_btn: '+ Add Plan',
		aat_active_plans_label: 'Active plans:',
		aat_select_placeholder: 'Select...',
		aat_towns_load_error: 'Error loading towns',
		aat_units_load_error: 'Error loading units',
		aat_naval_tag: ' (naval)',
		aat_land_tag: ' (land)',
		aat_hero_none: 'None',
		aat_max_entry: 'MAX x {label}',
		aat_qty_entry: '{qty}x {label}',
		aat_old_plan_migrated_log: 'Old plan migrated: town #{id} ({unit} x{qty}).',
		aat_invalid_plan_removed_log: 'Warning: invalid plan removed (no units defined).',
		aat_rest_migrated_log: 'Plan #{id}: rest migrated from "per target" to "whole plan interval".',
		aat_select_unit_first_log: 'Error: select a unit before adding.',
		aat_select_unit_first_status: 'Error: select a unit.',
		aat_invalid_qty_log: 'Error: invalid quantity.',
		aat_invalid_qty_status: 'Error: enter a valid quantity or check Max.',
		aat_unit_added_log: 'Unit added to composition: {entry}',
		aat_no_staging_units: 'No units in the composition yet.',
		aat_started_log: 'Started. Monitoring attack plans...',
		aat_stopped_log: 'Stopped.',
		aat_no_origin_log: 'Error: no attacking city selected.',
		aat_no_origin_status: 'Error: select an attacking city.',
		aat_no_units_in_plan_log: 'Error: add at least one unit to the composition.',
		aat_no_units_in_plan_status: 'Error: add at least one unit.',
		aat_no_targets_log: 'Error: no valid target city informed.',
		aat_no_targets_status: 'Error: enter at least one valid target city.',
		aat_plan_updated_log: 'Plan updated: {origin} [{units}] -> {count} target(s).',
		aat_plan_updated_status: 'Plan updated successfully!',
		aat_plan_not_found_log: 'Error: plan not found to edit.',
		aat_editing_plan_log: 'Editing plan: {town}.',
		aat_editing_plan_status: 'Editing plan for {town} - make changes and click "Save Changes".',
		aat_edit_cancelled_status: 'Edit cancelled.',
		aat_save_changes_btn: '💾 Save Changes',
		aat_cancel_edit_link: 'Cancel edit',
		aat_edit_tooltip: 'Edit plan',
		aat_no_plans_configured: 'No plan configured.',
		aat_plan_removed_log: 'Plan removed.',
		aat_rest_suffix: ', rest {min}min',
		aat_hero_suffix: ', hero: {name}',
		aat_plan_added_log: 'Plan added: {origin} [{units}] -> {count} target(s){rest}{hero}.',
		aat_plan_added_status: 'Plan added successfully!',
		aat_rest_display: ' | rest {min}min',
		aat_next_label: ' (next in ~{min}min)',
		aat_hero_display: ' + hero {name}',
		aat_plan_invalid_composition_log: 'Warning: plan for town #{id} has no valid composition, skipped.',
		aat_town_not_found_log: 'Warning: town #{id} not found (not yours or fell out of cache).',
		aat_attack_ok_log: 'OK: {from} -> {to}: attack with [{comp}] sent!',
		aat_attack_ok_status: 'OK: {from} attacked {to} [{comp}]',
		aat_next_attack_log: '{town}: next attack from this plan in approximately {min}min.',
		aat_attack_fail_log: 'FAILED to attack {to} from {from}: {msg}',
		aat_attack_fail_status: 'FAILED to attack {to}: {msg}',
		aat_unexpected_error_log: 'Unexpected error in plan #{id}: {msg}',
		asr_title: 'Auto Resource Sending',
		asr_desc: 'Sends resources from idle towns to the least developed town (with storage room).',
		asr_desc2: 'Sender: any town with an available market and some resource above 50% of storage (does not need to be idle). Target: lowest sum of building levels, with a 5% storage room margin.',
		asr_check_every_label: 'Check every',
		asr_save: 'Save',
		asr_min_unit: 'min',
		asr_mode_auto: 'Automatic',
		asr_mode_manual: 'Manual (90%)',
		asr_manual_target_label: 'Target town (sends when any town reaches 90% storage)',
		asr_target_current: '✓ Current target: {name}',
		asr_no_target_configured: 'No target configured.',
		asr_started_log: 'Started. Interval: {min} min.',
		asr_stopped_log: 'Stopped.',
		asr_mode_changed_log: 'Mode changed to: {mode}',
		asr_invalid_interval_status: 'Invalid interval (minimum 1 min).',
		asr_interval_saved_status: '✓ Interval saved: {val} min.',
		asr_interval_changed_log: 'Interval changed to {val} min.',
		asr_select_town_status: 'Select a town.',
		asr_manual_target_saved_log: 'Manual target saved: {name}',
		asr_select_placeholder: 'Select...',
		asr_towns_load_error: 'Error loading towns',
		asr_checking_log: 'Checking towns...',
		asr_targets_log: 'Targets (least developed first, with storage room): {names}',
		asr_no_senders_log: 'No eligible town to send from.',
		asr_cycle_complete_log: '✓ Resources sent from {count} town(s) to {targets} target(s)',
		asr_cycle_exception_log: 'Exception in cycle: {msg}',
		asr_manual_no_target_log: 'Manual mode: no target town configured yet.',
		asr_manual_no_target_status: 'Configure a target town in manual mode.',
		asr_manual_target_missing_log: 'Manual mode: target town #{id} not found (fell out of cache or is no longer yours).',
		asr_manual_target_missing_status: 'Target town not found.',
		asr_manual_no_senders_log: 'Manual mode: no town at 90%+ storage right now.',
		asr_manual_sending_log: 'Manual mode: {count} town(s) at 90%+ storage, sending to {target}...',
		asr_manual_complete_log: '✓ Resources sent from {count} town(s) → {target}',
		asr_manual_none_sent_log: 'No transfer completed (target has no room or senders have no excess).',
		asr_send_log: '{from} → {to}: {wood}🪵 {stone}🪨 {iron}⚙',
		asr_send_trade_error_log: '✗ Trade error: {err}',
		asr_send_exception_log: 'Exception: {msg}',
		sniper_title: '🎯 Sniper',
		sniper_desc: 'Open a native attack/support window, choose troops and target as usual, then use the panel that appears inside that window to schedule the SEND so it ARRIVES at an exact time you choose.',
		sniper_background_warning: '⚠ For precision, keep the game tab in the foreground close to the scheduled time - browsers delay timers in background tabs.',
		sniper_cfg_tol_attack_label: 'Attack tolerance:',
		sniper_cfg_tol_attack_tip: 'How many seconds early is accepted for an attack (it will never retry to arrive late - only earlier than desired).',
		sniper_cfg_tol_support_label: 'Support tolerance:',
		sniper_cfg_tol_support_tip: 'How many seconds late is accepted for support (it will never retry to arrive early - only later than desired).',
		sniper_cfg_early_margin_label: 'Safety margin:',
		sniper_cfg_early_margin_tip: 'How much earlier than the calculated time the send fires, to cover network/lag delay between the local click and the server registering it. 3000ms = 3s is a safe default; raise it if you notice sends consistently arriving late, lower it if they consistently arrive very early.',
		sniper_panel_title: 'Sniper - schedule arrival',
		sniper_schedule_btn: 'Schedule',
		sniper_missing_datetime: 'Set a date and time.',
		sniper_invalid_datetime: 'Invalid date/time.',
		sniper_no_duration_found: 'Could not find the travel duration on this window.',
		sniper_duration_parse_error: 'Could not read the duration ({raw}).',
		sniper_too_late: 'Too late - travel takes {duration}, that arrival time already passed.',
		sniper_no_units_found: 'No troops detected in this window.',
		sniper_scheduled_ok: '✓ Scheduled! Arrival: {time}',
		sniper_scheduled_log: 'Scheduled -> {target} ({type}): {comp}. Send at {send}, arrival at {arrival}.',
		sniper_schedule_error: 'Error scheduling: {msg}',
		sniper_inject_error: 'Error injecting panel: {msg}',
		sniper_read_composition_error: 'Error reading troop composition: {msg}',
		sniper_fired_ok: 'Sent to {target}!',
		sniper_fired_fail: 'Failed to send to {target}: {reason}',
		sniper_cancelled_log: 'Scheduled snipe cancelled.',
		sniper_status_pending: '⏳ Pending',
		sniper_status_firing: '🚀 Firing...',
		sniper_status_sent: '✓ Sent',
		sniper_status_failed: '✗ Failed',
		sniper_type_attack: 'Attack',
		sniper_type_support: 'Support',
		sniper_row_arrival: 'Arrival: {time}',
		sniper_none_scheduled: 'No snipes scheduled.',
		sniper_network_comp_label: 'Network compensation:',
		sniper_network_comp_hint: 'fires slightly earlier to offset request travel time to the server',
		sniper_network_comp_saved_log: 'Network compensation set to {ms}ms.',
		sniper_cancel_tooltip: 'Cancel this schedule',
		sniper_closest_title: 'Your 5 closest cities to this target',
		sniper_distance_units: '{dist} units',
		sniper_no_closest_found: 'Could not determine distances (target not cached yet).',
		sniper_refresh_btn: 'Refresh',
		sniper_closest_hint: 'If empty, click the "Information" tab once first, then hit Refresh.',
		sniper_timing_debug_log: '⏱ Local timer delta: {localDelta}ms (negative = fired early) | Request round-trip: {roundTrip}ms',
		sniper_cancel_error: 'Error cancelling command: {msg}',
		sniper_no_command_found: '(could not verify the resulting command, but the send appears to have gone through)',
		sniper_attempt_log: 'Attempt {attempt}/{max} for {target}: landed {diff}s off target',
		sniper_fired_ok_precise: '✓ Sent to {target} — landed within {diff}s of target!',
		sniper_fired_ok_imprecise: '⚠ Sent to {target} after {attempts} attempt(s) — best result was {diff}s off target ({reason}).',
		sniper_fired_ok_no_retry_troops: '⚠ Sent to {target} ({diff}s off target) — not retrying: the same troops are not available yet to resend (cancelling does not return them instantly).',
		sniper_waiting_troops_log: '⏳ Cancelled — waiting for the troops to come back home before resending to {target}...',
		sniper_troops_not_back_error: 'The troops did not return in time to resend before the desired arrival (the previous send was already cancelled).',
		sniper_reason_max_attempts: 'ran out of attempts',
		sniper_reason_not_cancelable: 'send window already closed, could not cancel to retry',
		sniper_reason_no_time_for_retry: 'not enough time left to wait for troops to return and resend',
		sniper_reason_late_no_retry: 'arrived after the desired time - the window already passed, retrying cannot fix it',
		da_title: '🔔 Discord Alert',
		da_desc: 'Sends a Discord webhook notification as soon as an incoming attack is detected. Checks every 15s.',
		da_webhook_label: 'Webhook URL:',
		da_test_btn: 'Test',
		da_webhook_saved: '✓ Webhook saved.',
		da_webhook_cleared: 'Webhook cleared.',
		da_no_webhook: 'Set a webhook URL first.',
		da_sending_test: 'Sending test message...',
		da_test_title: 'MultBot Test',
		da_test_desc: 'If you see this, the webhook is working!',
		da_test_ok: '✓ Test message sent successfully.',
		da_test_fail: '✗ Failed (HTTP {status}).',
		da_test_fail_log: 'Test failed (HTTP {status}): {body}',
		da_test_error: '✗ Network error sending test.',
		da_test_error_log: 'Network error sending test: {msg}',
		da_tick_error: 'Error checking attacks: {msg}',
		da_alert_title: 'Incoming Attack!',
		da_alert_desc: '**{town}** is under attack.',
		da_field_arrival: 'Arrival',
		da_field_remaining: 'Time left',
		da_field_origin: 'Origin',
		da_field_type: 'Type',
		da_type_spy: 'Attack + Spy',
		da_type_normal: 'Attack',
		da_unknown: 'Unknown',
		da_resolve_name_error: 'Error resolving attacker name: {msg}',
		da_resolve_name_no_match: 'Response received but no player name found (keys: {keys})',
		da_brand_name: '🤖 MultBot',
		da_brand_footer: 'MultBot • Attack Alert',
		da_field_enemy: 'Enemy',
		da_field_defender: 'Defender',
		da_field_player: 'Player',
		da_field_city: 'City',
		da_alert_sent_log: '✓ Alert sent: {town}',
		da_alert_fail_log: '✗ Failed to send alert for {town} (HTTP {status})',
		da_alert_error_log: 'Error sending alert: {msg}',
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
		aq_desc: 'Automatically claims island quest rewards as soon as they are ready. When a Good/Evil choice is available, picks the "bear effect" (wait-only) side if there is one, and accepts the challenge to start it. Checks every 20s.',
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
		aq_accepted_count: '{count}/{max} quests accepted',
		aq_max_accepted_log: '⚠ {max}/{max} quests accepted already - waiting for a slot to open before accepting more.',
		mt_rename_label: 'City Names',
		mt_rename_desc: 'Renames all cities as OCxx-NN (ocean + sequence, ordered by city ID).',
		mt_renamed_log: '✓ {town}: renamed to {name}',
		mt_rename_error: '✗ {town}: rename failed - {msg}',
		mt_rename_complete: '✓ {count} cities renamed.',
		aq_challenged_log: '✓ Challenge accepted for: {name}',
		aq_challenge_fail_log: '✗ Failed to accept challenge {name}: {reason}',
		aq_challenge_network_error: '✗ Network error accepting challenge {name}: {msg}',
		aq_no_town_on_island_log: '⚠ No town of yours on the island of {name}, using current town as fallback.',
		atc_title: 'Timed Commands',
		atc_desc: 'Schedules attacks/support to arrive at a specific time. Travel time is calculated automatically from distance and unit speed.',
		atc_type_label: 'Type',
		atc_type_attack: 'Attack',
		atc_type_support: 'Support',
		atc_origin_label: 'Origin city',
		atc_target_label: 'Target (ID or [town]...[/town])',
		atc_arrival_label: 'Desired arrival',
		atc_add_plan: '+ Add Plan',
		atc_no_origin: 'Select an origin city.',
		atc_no_target: 'Enter a valid target.',
		atc_no_units: 'Add at least one unit.',
		atc_no_arrival: 'Set the desired arrival date/time.',
		atc_arrival_past: 'Arrival time must be in the future.',
		atc_travel_calc_error: 'Could not calculate travel time: {msg}',
		atc_send_too_late: 'Send time already in the past by the time travel was calculated ({sec}s) - the slowest unit may be too slow for this distance/deadline.',
		atc_plan_added: '✓ Plan added: sends at {time} to arrive at {arrival} ({unit} is the slowest, travel {travel}).',
		atc_no_plans: 'No scheduled plans.',
		atc_sending_now: 'Sending {type} from {origin} to {target} (scheduled to arrive {arrival})...',
		atc_sent_ok: '✓ Sent! {type} from {origin} to {target}.',
		atc_sent_fail: '✗ Failed to send {type} from {origin} to {target}: {reason}',
		atc_removed: 'Plan removed.',
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
		sleeper_label: 'Sleeper:',
		sleeper_to: 'até',
		sleeper_desc: 'Enquanto ativo, pausa TODOS os outros módulos durante essa janela diária - exceto Auto Milícia e Auto Fuga, que continuam rodando pra defesa.',
		sleeper_invalid: 'Defina um horário de início e de fim.',
		sleeper_enabled_log: 'Ativado: {start} - {end} (pausa tudo, exceto Milícia e Fuga).',
		sleeper_disabled_log: 'Desativado.',
		sleeper_disable: 'Desativar',
		sleeper_active_now: '😴 Dormindo agora - outros módulos pausados',
		sleeper_scheduled: '⏰ Agendado (não ativo no momento)',
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
		mt_colonize_label: 'Navios Colonizadores',
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
		artr_title: 'Auto Comércio de Recursos',
		artr_click_to_stop: '(clique pra parar)',
		artr_iron: 'Ferro',
		artr_stone: 'Pedra',
		artr_wood: 'Madeira',
		artr_loop_error: 'Erro no ciclo de comércio: {msg}',
		arl_title: 'Auto Rural level',
		arl_unlock_error: 'Erro ao desbloquear rural: {msg}',
		arl_upgrade_error: 'Erro ao evoluir rural: {msg}',
		arl_unlocked_log: 'Ilha {island}: {name} desbloqueado',
		arl_upgraded_log: 'Ilha {island}: {name} evoluído',
		arl_main_error: 'Erro no ciclo principal: {msg}',
		arl_unlock_fail_log: 'Falha ao desbloquear {name} (ilha {island}): {reason}',
		arl_upgrade_fail_log: 'Falha ao evoluir {name} (ilha {island}): {reason}',
		abc_title: 'Auto Bootcamp',
		abc_only_off: 'Só desligar',
		abc_off_def: 'Desligar e Def',
		abc_attack_error: 'Erro ao atacar o campo de treinamento: {msg}',
		abc_use_reward_error: 'Erro ao usar a recompensa: {msg}',
		abc_stash_error: 'Erro ao guardar a recompensa, tentando usar direto: {msg}',
		abc_main_error: 'Erro no ciclo principal: {msg}',
		ah_auto_label: 'Auto',
		ah_title: 'Auto Hide',
		ah_desc: 'Aplica em todas as cidades com esconderijo nível 10. Verifica a cada 5 segundos; se a cidade tiver mais de 15000 de ferro, guarda {amount} no esconderijo.',
		ah_error_hide_level: 'O esconderijo precisa estar no nível 10',
		ah_store_error: 'Erro ao guardar ferro: {msg}',
		ah_eligible_count: '{count} cidade(s) elegível(is) (esconderijo nível 10)',
		ah_stored_log: '✓ {town}: {amount} de ferro guardado',
		am_title: 'Auto Milícia',
		am_desc: 'Ativa milícia ~8s antes do impacto em cidades sob ataque.',
		am_started_log: 'Iniciado. Monitorando ataques...',
		am_stopped_log: 'Parado.',
		am_scheduled_log: 'Agendado: {town} em {sec}s',
		am_tick_error: 'Erro: {msg}',
		am_activating_log: 'Ativando milícia em {town}...',
		am_activated_log: '✓ Milícia ativada em {town}',
		am_activate_fail_log: '✗ Falha em {town}: {reason}',
		am_activate_exception_log: 'Exceção/timeout em #{id}: {msg}',
		ad_title: 'Auto Fuga (Dodge)',
		ad_tooltip: 'Envia reforço para qualquer cidade conhecida da ilha. Se nenhuma existir no cache, a evacuação é pulada.',
		ad_desc: 'Evacua tropas {sec}s antes do impacto para uma cidade aleatória na mesma ilha, com retorno automático.',
		ad_started_log: 'Iniciado. Monitorando ataques...',
		ad_stopped_log: 'Parado.',
		ad_island_scraper_active_log: 'Aprendizado de ilhas ativo (observando janelas abertas no mapa).',
		ad_learned_towns_log: 'Aprendidas {n} cidade(s) nova(s) no cache de ilhas.',
		ad_safety_evac_log: 'Rede de segurança: {town} está a {sec}s do impacto - evacuando imediatamente.',
		ad_evac_scheduled_log: 'Evacuação agendada: {from} -> {to} em {sec}s ({lead}s antes do impacto).',
		ad_evac_scheduled_no_island_log: 'Aviso: {town} agendada em {sec}s, mas SEM cidade conhecida na mesma ilha ainda.',
		ad_tick_error: 'Erro no tick: {msg}',
		ad_find_island_error: 'Erro ao procurar cidade na mesma ilha: {msg}',
		ad_evac_no_island_log: 'Aviso: {town} - nenhuma cidade conhecida na mesma ilha. Evacuação pulada.',
		ad_evac_no_island_status: 'Aviso: {town} sem cidade na mesma ilha.',
		ad_no_troops_log: '{town}: sem tropas para evacuar.',
		ad_evacuating_log: 'Evacuando {town} para {safe}...',
		ad_no_land_troops_log: '{town}: sem tropas terrestres, pulando esse grupo.',
		ad_no_naval_troops_log: '{town}: sem tropas navais, pulando esse grupo.',
		ad_evacuated_log: '{town} evacuada para {safe}!',
		ad_evacuate_error: 'Erro ao evacuar #{id}: {msg}',
		ad_group_response_log: 'Resposta do servidor ({label}): {res}',
		ad_command_found_log: '{town} ({label}): commandId encontrado: #{id}',
		ad_command_not_found_log: 'Aviso: {town} ({label}) - id do comando não encontrado. Recall manual necessário.',
		ad_command_not_found_status: 'Aviso: {town} ({label}) - recall automático indisponível.',
		ad_send_group_fail_log: 'FALHA ao enviar {label} de {town}: {msg}',
		ad_recall_scheduled_log: '{town} ({label}): retorno agendado para daqui a {sec}s (comando #{id}).',
		ad_reconcile_start_log: 'Reconciliando {n} recall(s) pendente(s) após carregamento...',
		ad_reconcile_fire_now_log: 'Recall de {town} ({label}) já deveria ter disparado - disparando agora.',
		ad_reconcile_reschedule_log: 'Recall de {town} ({label}) reagendado para daqui a {sec}s.',
		ad_reconcile_error: 'Erro ao reconciliar recalls pendentes: {msg}',
		ad_recall_calling_log: '{town} ({label}): chamando as tropas de volta (comando #{id})...',
		ad_recall_response_log: 'Resposta do recall ({label}): {res}',
		ad_recall_success_log: '{town} ({label}): tropas retornando!',
		ad_recall_fail_log: 'Falha ao chamar de volta {town} ({label}): {res}',
		ad_recall_fail_status: 'Falha no recall de {town} ({label}). Traga manualmente.',
		ad_recall_network_error: 'Erro no recall de {town} ({label}): {msg}',
		aat_title: 'Auto Ataque',
		aat_desc: 'Ataca automaticamente quando a composição estiver disponível. Verifica a cada 20s.',
		aat_origin_label: 'Cidade Atacante',
		aat_rest_tooltip: 'Espera antes de reatacar o mesmo alvo, +-10% de variação. 0 = sem espera.',
		aat_rest_label: 'Descanso (min)',
		aat_hero_tooltip: 'Opcional. Envia esse herói junto com o ataque, se ele estiver disponível na cidade atacante no momento do disparo.',
		aat_hero_label: 'Herói (opcional)',
		aat_unit_label: 'Unidade',
		aat_qty_label: 'Qtde',
		aat_max_tooltip: 'Sempre envia TUDO que estiver disponível dessa unidade no momento do ataque.',
		aat_max_label: 'Max',
		aat_add_unit_btn: '+ Unidade',
		aat_targets_label: 'Cidades-alvo (ID, separadas por vírgula ou linha)',
		aat_targets_placeholder: 'ex: 12345, 67890',
		aat_add_plan_btn: '+ Adicionar Plano',
		aat_active_plans_label: 'Planos ativos:',
		aat_select_placeholder: 'Selecione...',
		aat_towns_load_error: 'Erro ao carregar cidades',
		aat_units_load_error: 'Erro ao carregar unidades',
		aat_naval_tag: ' (naval)',
		aat_land_tag: ' (terra)',
		aat_hero_none: 'Nenhum',
		aat_max_entry: 'MAX x {label}',
		aat_qty_entry: '{qty}x {label}',
		aat_old_plan_migrated_log: 'Plano antigo migrado: cidade #{id} ({unit} x{qty}).',
		aat_invalid_plan_removed_log: 'Aviso: plano inválido removido (sem unidades definidas).',
		aat_rest_migrated_log: 'Plano #{id}: descanso migrado de "por alvo" pra "intervalo do plano inteiro".',
		aat_select_unit_first_log: 'Erro: selecione uma unidade antes de adicionar.',
		aat_select_unit_first_status: 'Erro: selecione uma unidade.',
		aat_invalid_qty_log: 'Erro: quantidade inválida.',
		aat_invalid_qty_status: 'Erro: informe uma quantidade válida ou marque Max.',
		aat_unit_added_log: 'Unidade adicionada à composição: {entry}',
		aat_no_staging_units: 'Nenhuma unidade na composição ainda.',
		aat_started_log: 'Iniciado. Monitorando planos de ataque...',
		aat_stopped_log: 'Parado.',
		aat_no_origin_log: 'Erro: nenhuma cidade atacante selecionada.',
		aat_no_origin_status: 'Erro: selecione uma cidade atacante.',
		aat_no_units_in_plan_log: 'Erro: adicione ao menos uma unidade à composição.',
		aat_no_units_in_plan_status: 'Erro: adicione ao menos uma unidade.',
		aat_no_targets_log: 'Erro: nenhuma cidade-alvo válida informada.',
		aat_no_targets_status: 'Erro: informe pelo menos uma cidade-alvo válida.',
		aat_plan_updated_log: 'Plano atualizado: {origin} [{units}] -> {count} alvo(s).',
		aat_plan_updated_status: 'Plano atualizado com sucesso!',
		aat_plan_not_found_log: 'Erro: plano não encontrado pra editar.',
		aat_editing_plan_log: 'Editando plano: {town}.',
		aat_editing_plan_status: 'Editando plano de {town} - altere e clique em "Salvar Alterações".',
		aat_edit_cancelled_status: 'Edição cancelada.',
		aat_save_changes_btn: '💾 Salvar Alterações',
		aat_cancel_edit_link: 'Cancelar edição',
		aat_edit_tooltip: 'Editar plano',
		aat_no_plans_configured: 'Nenhum plano configurado.',
		aat_plan_removed_log: 'Plano removido.',
		aat_rest_suffix: ', descanso {min}min',
		aat_hero_suffix: ', herói: {name}',
		aat_plan_added_log: 'Plano adicionado: {origin} [{units}] -> {count} alvo(s){rest}{hero}.',
		aat_plan_added_status: 'Plano adicionado com sucesso!',
		aat_rest_display: ' | descanso {min}min',
		aat_next_label: ' (próximo em ~{min}min)',
		aat_hero_display: ' + herói {name}',
		aat_plan_invalid_composition_log: 'Aviso: plano da cidade #{id} sem composição válida, ignorado.',
		aat_town_not_found_log: 'Aviso: cidade #{id} não encontrada (não é sua ou saiu do cache).',
		aat_attack_ok_log: 'OK: {from} -> {to}: ataque com [{comp}] enviado!',
		aat_attack_ok_status: 'OK: {from} atacou {to} [{comp}]',
		aat_next_attack_log: '{town}: próximo ataque desse plano em aproximadamente {min}min.',
		aat_attack_fail_log: 'FALHA ao atacar {to} de {from}: {msg}',
		aat_attack_fail_status: 'FALHA ao atacar {to}: {msg}',
		aat_unexpected_error_log: 'Erro inesperado no plano #{id}: {msg}',
		asr_title: 'Auto Envio de Recursos',
		asr_desc: 'Envia recursos de cidades ociosas para a cidade menos desenvolvida (com espaço no armazém).',
		asr_desc2: 'Remetente: qualquer cidade com mercado disponível e algum recurso acima de 50% do storage (não precisa estar ociosa). Destino: menor soma de níveis de construção, com margem de 5% de espaço livre no armazém.',
		asr_check_every_label: 'Verificar a cada',
		asr_save: 'Salvar',
		asr_min_unit: 'min',
		asr_mode_auto: 'Automático',
		asr_mode_manual: 'Manual (90%)',
		asr_manual_target_label: 'Cidade Destino (envia quando alguma cidade atingir 90% de armazém)',
		asr_target_current: '✓ Destino atual: {name}',
		asr_no_target_configured: 'Nenhum destino configurado.',
		asr_started_log: 'Iniciado. Intervalo: {min} min.',
		asr_stopped_log: 'Parado.',
		asr_mode_changed_log: 'Modo alterado para: {mode}',
		asr_invalid_interval_status: 'Intervalo inválido (mínimo 1 min).',
		asr_interval_saved_status: '✓ Intervalo salvo: {val} min.',
		asr_interval_changed_log: 'Intervalo alterado para {val} min.',
		asr_select_town_status: 'Selecione uma cidade.',
		asr_manual_target_saved_log: 'Destino manual salvo: {name}',
		asr_select_placeholder: 'Selecione...',
		asr_towns_load_error: 'Erro ao carregar cidades',
		asr_checking_log: 'Verificando cidades...',
		asr_targets_log: 'Destinos (menos desenvolvidas primeiro, com espaço no armazém): {names}',
		asr_no_senders_log: 'Nenhuma cidade elegível para envio.',
		asr_cycle_complete_log: '✓ Recursos enviados de {count} cidade(s) para {targets} destino(s)',
		asr_cycle_exception_log: 'Exceção no ciclo: {msg}',
		asr_manual_no_target_log: 'Modo manual: nenhuma cidade destino configurada ainda.',
		asr_manual_no_target_status: 'Configure uma cidade destino no modo manual.',
		asr_manual_target_missing_log: 'Modo manual: cidade destino #{id} não encontrada (saiu do cache ou não é mais sua).',
		asr_manual_target_missing_status: 'Cidade destino não encontrada.',
		asr_manual_no_senders_log: 'Modo manual: nenhuma cidade em 90%+ de armazém no momento.',
		asr_manual_sending_log: 'Modo manual: {count} cidade(s) em 90%+ de armazém, enviando para {target}...',
		asr_manual_complete_log: '✓ Recursos enviados de {count} cidade(s) → {target}',
		asr_manual_none_sent_log: 'Nenhum envio concluído (destino sem espaço ou remetentes sem excedente).',
		asr_send_log: '{from} → {to}: {wood}🪵 {stone}🪨 {iron}⚙',
		asr_send_trade_error_log: '✗ Erro trade: {err}',
		asr_send_exception_log: 'Exceção: {msg}',
		sniper_title: '🎯 Sniper',
		sniper_desc: 'Abra uma janela nativa de ataque/apoio, escolha tropas e alvo normalmente, depois use o painel que aparece dentro dessa janela pra agendar o ENVIO de forma que ele CHEGUE num horário exato escolhido por você.',
		sniper_background_warning: '⚠ Pra precisão, deixe a aba do jogo em primeiro plano perto do horário agendado - navegadores atrasam timers em abas em segundo plano.',
		sniper_cfg_tol_attack_label: 'Tolerância ataque:',
		sniper_cfg_tol_attack_tip: 'Quantos segundos ADIANTADO são aceitos num ataque (nunca tenta de novo pra chegar atrasado - só mais cedo que o desejado).',
		sniper_cfg_tol_support_label: 'Tolerância apoio:',
		sniper_cfg_tol_support_tip: 'Quantos segundos ATRASADO são aceitos num apoio (nunca tenta de novo pra chegar adiantado - só mais tarde que o desejado).',
		sniper_cfg_early_margin_label: 'Margem de segurança:',
		sniper_cfg_early_margin_tip: 'Quanto antes do horário calculado o envio dispara, pra cobrir atraso de rede entre o clique local e o servidor registrar de verdade. 3000ms = 3s é um padrão seguro; aumente se perceber que os envios chegam atrasados com frequência, diminua se chegarem muito adiantados.',
		sniper_panel_title: 'Sniper - agendar chegada',
		sniper_schedule_btn: 'Agendar',
		sniper_missing_datetime: 'Defina uma data e hora.',
		sniper_invalid_datetime: 'Data/hora inválida.',
		sniper_no_duration_found: 'Não achei a duração da viagem nessa janela.',
		sniper_duration_parse_error: 'Não consegui ler a duração ({raw}).',
		sniper_too_late: 'Tarde demais - a viagem leva {duration}, esse horário de chegada já passou.',
		sniper_no_units_found: 'Nenhuma tropa detectada nessa janela.',
		sniper_scheduled_ok: '✓ Agendado! Chegada: {time}',
		sniper_scheduled_log: 'Agendado -> {target} ({type}): {comp}. Envio às {send}, chegada às {arrival}.',
		sniper_schedule_error: 'Erro ao agendar: {msg}',
		sniper_inject_error: 'Erro ao injetar painel: {msg}',
		sniper_read_composition_error: 'Erro ao ler composição de tropas: {msg}',
		sniper_fired_ok: 'Enviado para {target}!',
		sniper_fired_fail: 'Falha ao enviar para {target}: {reason}',
		sniper_cancelled_log: 'Agendamento cancelado.',
		sniper_status_pending: '⏳ Pendente',
		sniper_status_firing: '🚀 Disparando...',
		sniper_status_sent: '✓ Enviado',
		sniper_status_failed: '✗ Falhou',
		sniper_type_attack: 'Ataque',
		sniper_type_support: 'Apoio',
		sniper_row_arrival: 'Chegada: {time}',
		sniper_none_scheduled: 'Nenhum agendamento pendente.',
		sniper_network_comp_label: 'Compensação de rede:',
		sniper_network_comp_hint: 'dispara um pouco antes pra compensar o tempo da requisição até o servidor',
		sniper_network_comp_saved_log: 'Compensação de rede ajustada pra {ms}ms.',
		sniper_cancel_tooltip: 'Cancelar esse agendamento',
		sniper_closest_title: 'Suas 5 cidades mais próximas desse alvo',
		sniper_distance_units: '{dist} unidades',
		sniper_no_closest_found: 'Não consegui calcular distâncias (alvo ainda não carregado no cache).',
		sniper_refresh_btn: 'Atualizar',
		sniper_closest_hint: 'Se estiver vazio, clica na aba "Informação" uma vez primeiro, depois clica em Atualizar.',
		sniper_timing_debug_log: '⏱ Diferença do timer local: {localDelta}ms (negativo = disparou antes) | Ida-e-volta da requisição: {roundTrip}ms',
		sniper_cancel_error: 'Erro ao cancelar comando: {msg}',
		sniper_no_command_found: '(não consegui confirmar o comando resultante, mas o envio parece ter passado)',
		sniper_attempt_log: 'Tentativa {attempt}/{max} pra {target}: caiu {diff}s fora do alvo',
		sniper_fired_ok_precise: '✓ Enviado pra {target} — caiu dentro de {diff}s do alvo!',
		sniper_fired_ok_imprecise: '⚠ Enviado pra {target} depois de {attempts} tentativa(s) — melhor resultado foi {diff}s fora do alvo ({reason}).',
		sniper_fired_ok_no_retry_troops: '⚠ Enviado pra {target} ({diff}s fora do alvo) — não vou tentar de novo: as mesmas tropas ainda não estão disponíveis pra reenviar (cancelar não devolve elas na hora).',
		sniper_waiting_troops_log: '⏳ Cancelado — aguardando as tropas voltarem pra casa antes de reenviar pra {target}...',
		sniper_troops_not_back_error: 'As tropas não voltaram a tempo de reenviar antes do horário desejado (o envio anterior já foi cancelado).',
		sniper_reason_max_attempts: 'acabaram as tentativas',
		sniper_reason_not_cancelable: 'janela de cancelamento já fechou, não deu pra cancelar pra tentar de novo',
		sniper_reason_no_time_for_retry: 'não sobrou tempo suficiente pra esperar as tropas voltarem e reenviar',
		sniper_reason_late_no_retry: 'chegou depois do horário desejado - a janela já passou, tentar de novo não resolve',
		da_title: '🔔 Discord Alert',
		da_desc: 'Manda um aviso via webhook do Discord assim que um ataque a caminho é detectado. Verifica a cada 15s.',
		da_webhook_label: 'URL do Webhook:',
		da_test_btn: 'Testar',
		da_webhook_saved: '✓ Webhook salvo.',
		da_webhook_cleared: 'Webhook removido.',
		da_no_webhook: 'Configure uma URL de webhook primeiro.',
		da_sending_test: 'Enviando mensagem de teste...',
		da_test_title: 'Teste do MultBot',
		da_test_desc: 'Se você está vendo isso, o webhook está funcionando!',
		da_test_ok: '✓ Mensagem de teste enviada com sucesso.',
		da_test_fail: '✗ Falhou (HTTP {status}).',
		da_test_fail_log: 'Teste falhou (HTTP {status}): {body}',
		da_test_error: '✗ Erro de rede ao enviar teste.',
		da_test_error_log: 'Erro de rede ao enviar teste: {msg}',
		da_tick_error: 'Erro ao verificar ataques: {msg}',
		da_alert_title: 'Ataque a Caminho!',
		da_alert_desc: '**{town}** está sendo atacada.',
		da_field_arrival: 'Chegada',
		da_field_remaining: 'Tempo restante',
		da_field_origin: 'Origem',
		da_field_type: 'Tipo',
		da_type_spy: 'Ataque + Espião',
		da_type_normal: 'Ataque',
		da_unknown: 'Desconhecido',
		da_resolve_name_error: 'Erro ao resolver nome do atacante: {msg}',
		da_resolve_name_no_match: 'Resposta recebida mas nenhum nome de jogador encontrado (chaves: {keys})',
		da_brand_name: '🤖 MultBot',
		da_brand_footer: 'MultBot • Aviso de Ataque',
		da_field_enemy: 'Inimigo',
		da_field_defender: 'Defensor',
		da_field_player: 'Jogador',
		da_field_city: 'Cidade',
		da_alert_sent_log: '✓ Aviso enviado: {town}',
		da_alert_fail_log: '✗ Falha ao enviar aviso de {town} (HTTP {status})',
		da_alert_error_log: 'Erro ao enviar aviso: {msg}',
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
		aq_desc: 'Reivindica automaticamente as recompensas de missões de ilha assim que ficam prontas. Quando há escolha entre Bem/Mal, escolhe o lado "suportar efeito" (só espera) quando existir, e aceita o desafio pra ela começar. Verifica a cada 20s.',
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
		aq_accepted_count: '{count}/{max} missões aceitas',
		aq_max_accepted_log: '⚠ {max}/{max} missões já aceitas - aguardando abrir vaga antes de aceitar mais.',
		mt_rename_label: 'Nomes das Cidades',
		mt_rename_desc: 'Renomeia todas as cidades como OCxx-NN (oceano + sequência, ordenado por ID da cidade).',
		mt_renamed_log: '✓ {town}: renomeado para {name}',
		mt_rename_error: '✗ {town}: falha ao renomear - {msg}',
		mt_rename_complete: '✓ {count} cidade(s) renomeada(s).',
		aq_challenged_log: '✓ Desafio aceito para: {name}',
		aq_challenge_fail_log: '✗ Falha ao aceitar desafio {name}: {reason}',
		aq_challenge_network_error: '✗ Erro de rede ao aceitar desafio {name}: {msg}',
		aq_no_town_on_island_log: '⚠ Nenhuma cidade sua na ilha de {name}, usando cidade atual como alternativa.',
		atc_title: 'Comandos Programados',
		atc_desc: 'Agenda ataques/apoios pra chegar num horário específico. O tempo de viagem é calculado automaticamente pela distância e velocidade das unidades.',
		atc_type_label: 'Tipo',
		atc_type_attack: 'Ataque',
		atc_type_support: 'Apoio',
		atc_origin_label: 'Cidade de origem',
		atc_target_label: 'Alvo (ID ou [town]...[/town])',
		atc_arrival_label: 'Chegada desejada',
		atc_add_plan: '+ Adicionar Plano',
		atc_no_origin: 'Selecione uma cidade de origem.',
		atc_no_target: 'Informe um alvo válido.',
		atc_no_units: 'Adicione pelo menos uma unidade.',
		atc_no_arrival: 'Defina a data/hora de chegada desejada.',
		atc_arrival_past: 'O horário de chegada precisa ser no futuro.',
		atc_travel_calc_error: 'Não foi possível calcular o tempo de viagem: {msg}',
		atc_send_too_late: 'O horário de envio já ficou no passado depois de calcular a viagem ({sec}s) - a unidade mais lenta pode ser lenta demais pra essa distância/prazo.',
		atc_plan_added: '✓ Plano adicionado: envia às {time} pra chegar às {arrival} ({unit} é a mais lenta, viagem de {travel}).',
		atc_no_plans: 'Nenhum plano agendado.',
		atc_sending_now: 'Enviando {type} de {origin} pra {target} (agendado pra chegar {arrival})...',
		atc_sent_ok: '✓ Enviado! {type} de {origin} pra {target}.',
		atc_sent_fail: '✗ Falha ao enviar {type} de {origin} pra {target}: {reason}',
		atc_removed: 'Plano removido.',
	},
};

console.log(`[MultBot] i18n: detected language "${__MultBotI18N.lang}" (hostname: ${typeof location !== 'undefined' ? location.hostname : 'n/a'})`);

/* Standalone version of the translation helper, usable from ANY file
   in the bundle - not just classes that extend MultUtil (e.g.
   MultBot itself, in multbot.js, does not extend MultUtil). This is
   what this.t() on MultUtil delegates to below.
   vars (optional): {name: 'X'} replaces "{name}" inside the string -
   lets a single translated sentence carry a dynamic value (module
   name, count, etc) without needing one dictionary key per value. */
__MultBotI18N.t = function(key, vars) {
    const dict = __MultBotI18N.dict[__MultBotI18N.lang] || __MultBotI18N.dict.en;
    let text = dict[key] ?? __MultBotI18N.dict.en[key] ?? key;
    if (vars) {
        for (const k in vars) {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]);
        }
    }
    return text;
};

/* Alias solto, so pra nao precisar reescrever os lugares que ja
   chamam multT(...) diretamente (ex: multbot.js, nos titulos das
   abas). A funcao de verdade agora vive em __MultBotI18N.t. */
var multT = function(key, vars) {
    return __MultBotI18N.t(key, vars);
};

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

    /* Detecta mensagens nativas do jogo (banners de erro / campo
       "error" das respostas ajax) que significam "sem recursos" ou
       "sem espaco/capacidade" (populacao, limite de unidades, fila
       cheia por falta de espaco de armazem, etc) - casos ESPERADOS
       que acontecem o tempo todo enquanto os recursos ainda nao
       acumularam, e que NAO devem gerar log/notificacao repetida a
       cada tentativa (isso so gera flood sem trazer informacao nova).
       Baseado nas mensagens nativas confirmadas em capturas reais do
       jogo: "Nao ha recursos suficientes." e "Voce nao pode recrutar
       mais do que N <unidade>.". Qualquer outra mensagem (timeout de
       rede, requisitos de construcao nao atendidos, erro de sessao,
       etc) NAO cai aqui e continua sendo logada normalmente, pois
       essas sim sao acionaveis/uteis de ver no console. */
    isResourceOrCapacityMessage = message => {
        if (!message) return false;
        const msg = String(message);
        return /recursos\s+suficientes/i.test(msg)
            || /n[aã]o\s+pode\s+(recrutar|construir)\s+mais/i.test(msg)
            || /espa[çc]o/i.test(msg)
            || /popula[çc][aã]o/i.test(msg);
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
       (e.g. auto_farm.js) hangs silently with no error log.
       extraFlag: same meaning as in ajaxPostWithTimeout - some
       endpoints expect `true` in this 4th parameter. Default false
       preserves the behavior of all existing callers. */
    ajaxGetWithTimeout = (endpoint, action, data, timeoutMs = 15000, extraFlag = false) => {
        return new Promise((resolve, reject) => {
            let settled = false;

            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error('Network timeout (' + timeoutMs + 'ms) on ' + endpoint + '/' + action));
            }, timeoutMs);

            uw.gpAjax.ajaxGet(endpoint, action, data, extraFlag,
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

    /* Verifica se o Sleeper (configurado na aba Status) esta ativo
       agora. Janela definida por horario de inicio/fim (HH:MM),
       recorrente todo dia. Lida com janelas que cruzam a meia-noite
       (ex: 23:00 - 07:00). */
    isSleeping() {
        try {
            const enabled = this.storage.load('sleeper_enabled', false);
            if (!enabled) return false;

            const start = this.storage.load('sleeper_start', '00:00');
            const end = this.storage.load('sleeper_end', '00:00');
            if (start === end) return false; // janela vazia = nunca dorme

            const now = new Date();
            const nowMinutes = now.getHours() * 60 + now.getMinutes();

            const [startH, startM] = start.split(':').map(Number);
            const [endH, endM] = end.split(':').map(Number);
            const startMinutes = startH * 60 + startM;
            const endMinutes = endH * 60 + endM;

            if (startMinutes < endMinutes) {
                return nowMinutes >= startMinutes && nowMinutes < endMinutes;
            }
            return nowMinutes >= startMinutes || nowMinutes < endMinutes; // cruza meia-noite
        } catch (e) {
            return false; // erro -> nao bloqueia por seguranca
        }
    }

    /* respectSleep=true (padrao): o callback e pulado enquanto o
       Sleeper estiver ativo - todo modulo que ja usa
       createGuardedInterval ganha isso automaticamente, sem
       precisar mudar nada no proprio modulo. Modulos criticos de
       defesa (AutoMilitia, AutoDodge) passam respectSleep=false
       explicitamente pra continuar rodando mesmo durante o sono. */
    createGuardedInterval = (fn, intervalMs, respectSleep = true) => {
        let processing = false;
        return setInterval(async () => {
            if (processing) return;
            if (respectSleep && this.isSleeping()) return;
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

    /* PDCA: o id do popup era fixo ("toolbar_activity_recruits_list"),
       copiado do template original. Esse id segue o padrao nativo
       que o proprio jogo usa pros seus popups de atividade (recrutas,
       movimentos, mensagens, etc) - ha risco real de colidir com um
       elemento nativo do jogo com o MESMO id, fazendo o clique no
       nosso popup (ex: ON/OFF do AutoFarm) acionar sem querer o
       handler nativo do jogo pra abrir a janela de recrutas de
       verdade. Agora cada chamador passa um id proprio, unico. */
    createPopup = (id, left, width, height, $content) => {
        // FIX (diagnosticado ao vivo via elementFromPoint): o popup nao
        // tinha z-index nenhum, entao ficava pintado ATRAS do mapa do
        // jogo (#index_map_image) - existia no DOM, opacity:1,
        // visibility:visible, mas invisivel pro usuario porque o mapa
        // desenhava por cima. Antes isso ficava mascarado pelo bug do
        // id duplicado (ver acima) que abria a janela nativa de
        // recrutas por engano, dando a falsa impressao de que "algo
        // abria" ao clicar. z-index alto o suficiente pra ficar acima
        // do mapa, mas sem exagerar (evita cobrir modais/dialogos
        // nativos do jogo que devem ficar por cima de tudo).
        const $box = uw.$('<div class="sandy-box js-dropdown-list"></div>').attr('id', id).css({
            "left": `${left}px`,
            "position": "absolute",
            "width": `${width}px`,
            "height": `${height}px`,
            "top": "29px",
            "margin-left": "0px",
            "display": "none",
            "z-index": 500,
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

		/* FIX: essa era a unica chamada do projeto que ainda disparava
		   uw.gpAjax.ajaxPost direto, sem timeout nem callback de erro -
		   MultStorage extends Compressor (nao MultUtil), entao nao tem
		   acesso a ajaxPostWithTimeout. Replica aqui o mesmo padrao
		   settled+timeout usado la, em vez de reestruturar a heranca de
		   classes so por causa desse unico ponto. Sem isso, uma falha de
		   rede (endpoint fora do ar, nota nao encontrada, etc) passava
		   batido e o jogador achava que salvou quando na verdade nao. */
		let settled = false;
		const timeoutMs = 15000;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			console.error('[MultStorage] Timeout (' + timeoutMs + 'ms) ao salvar nota de configuracoes.');
		}, timeoutMs);

		uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data, false,
			(res) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				if (res && res.error) {
					console.error('[MultStorage] Falha ao salvar nota de configuracoes: ' + res.error);
				}
			},
			(r, status, txt) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				console.error('[MultStorage] Erro de rede ao salvar nota de configuracoes: ' + txt);
			}
		);

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
		// FIX: sem essa checagem, uma aba selecionada sem o padrao "noteN" na
		// classe (ex: layout do jogo mudou, ou nenhuma nota selecionada de
		// verdade) fazia o .match() retornar null e o [1] seguinte explodia
		// com TypeError, em vez de simplesmente reportar "nenhuma nota ativa".
		const match = noteClass.match(/note(\d+)/);
		if (!match) return null;
		const note_index = parseInt(match[1]) - 1;

		const collection = uw.MM.getOnlyCollectionByName('PlayerNote');
		if (!collection) return null;
		let { models } = collection;

		return models[note_index];
	}
};

window.__multbot_captcha_active = false;
