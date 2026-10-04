# MultBot

Fork aprimorado do [ModernBot](https://github.com/Sau1707/ModernBot) para Grepolis, com automações modulares, painel de status e interface em português/inglês.

## Instalação

1. Instale o [Tampermonkey](https://www.tampermonkey.net/).
2. Crie um userscript com o conteúdo de `index.js` ou instale pela URL:

   ```text
   https://raw.githubusercontent.com/NotXina/MultBot/main/index.js
   ```

O `index.js` aguarda o jogo ficar pronto, baixa os módulos e monta o bundle no navegador. Cada download tem timeout e novas tentativas; uma falha em módulo opcional não impede os demais de iniciar.

> Use automações de acordo com as regras do servidor em que você joga.

## Funcionalidades

| Área | Módulo | Descrição |
|---|---|---|
| Status | `status.js` | Estado dos módulos, Sleeper e recarga automática configurável |
| Farm | `auto_farm.js` | Coleta recursos das aldeias rurais |
| Farm | `auto_rural_level.js` | Desbloqueia e evolui aldeias rurais |
| Farm | `auto_rural_trade.js` | Troca recursos com aldeias rurais |
| Farm | `auto_send_resources.js` | Balanceia recursos ou envia excedentes para uma cidade fixa |
| Build | `auto_build.js` | Constrói/demole até a composição definida e oferece presets |
| Build | `auto_gratis.js` | Aciona construções grátis |
| Train | `auto_train.js` | Recruta unidades terrestres, navais e míticas |
| Train | `auto_research.js` | Pesquisa tecnologias disponíveis em todas as cidades |
| Defesa | `auto_militia.js` | Agenda a milícia antes do primeiro ataque detectado |
| Defesa | `auto_dodge.js` | Evacua tropas antes de uma onda e retorna após o último ataque |
| Ataque | `auto_attack.js` | Executa planos com composição, alvos rotativos, descanso e herói opcional |
| Ataque | `sniper.js` | Agenda ataques/apoios para um horário exato de chegada |
| Feitiços | `auto_spells.js` | Terremoto, Felicidade, Sacrifício de Ares e Festival da Caridade |
| Mix | `auto_bootcamp.js` | Ataca o campo de treinamento e utiliza recompensas |
| Mix | `auto_party.js` | Inicia festas, desfiles e teatros |
| Mix | `auto_hide.js` | Armazena prata/ferro no esconderijo |
| Mix | `auto_quest.js` | Decide, aceita e coleta missões de ilha |
| Mix | `discord_alert.js` | Envia alerta de ataque para um webhook HTTPS do Discord |
| Mult | `mult_tools.js` | Presets em massa e renomeação de cidades |
| Mult | `colonize_ship_sender.js` | Envia navios colonizadores em apoio para um destino |
| Outros | `anti_rage.js` | Automação do poder Fúria/Purificação |
| Outros | `auto_trade.js` | Rotina auxiliar de comércio |

## Melhorias de confiabilidade

- Módulos isolados durante a inicialização: uma falha opcional não derruba todo o bot.
- Requisições AJAX com timeout e intervals protegidos contra sobreposição.
- `town_id` explícito nos envios de tropas, sem alterar globalmente a cidade ativa do jogo.
- Auto Dodge considera o primeiro e o último ataque da onda e persiste retornos pendentes.
- Auto Milícia reage via Backbone e mantém polling como fallback.
- Envios de recursos são sequenciais para reduzir risco de sobrecarregar o mesmo armazém.
- Alertas do Discord evitam notificações simultâneas duplicadas e ocultam o webhook na interface.
- Detecção de desafios anti-bot pausa os módulos que possuem guard de segurança.
- Console limitado a 200 entradas, com renderização segura de texto.
- Traduções `en` e `pt` validadas automaticamente.

## Desenvolvimento e validação

Não há dependências externas. Com Node.js instalado:

```bash
npm test
```

A validação verifica:

- sintaxe do `index.js` e do bundle concatenado;
- existência, ordem e duplicidade dos módulos do manifesto;
- arquivos de módulo órfãos;
- paridade e cobertura das traduções em inglês e português;
- ausência da antiga troca global de `Game.townId` nos módulos de envio;
- comportamento da onda/recall defensivo, reagendamento/retry da milícia, restauração do Auto Ocultar e payloads de envio.

## Estrutura

```text
MultBot/
├── index.js                 # userscript instalado no Tampermonkey
├── package.json             # comandos de validação, sem dependências
├── scripts/
│   ├── behavior-test.js
│   └── validate.js
└── Modules/
    ├── core.js              # i18n, storage, console e utilitários
    ├── anti_rage.js
    ├── auto_attack.js
    ├── auto_bootcamp.js
    ├── auto_build.js
    ├── auto_dodge.js
    ├── auto_farm.js
    ├── auto_gratis.js
    ├── auto_hide.js
    ├── auto_militia.js
    ├── auto_party.js
    ├── auto_quest.js
    ├── auto_research.js
    ├── auto_rural_level.js
    ├── auto_rural_trade.js
    ├── auto_send_resources.js
    ├── auto_spells.js
    ├── auto_trade.js
    ├── auto_train.js
    ├── colonize_ship_sender.js
    ├── discord_alert.js
    ├── mult_tools.js
    ├── sniper.js
    ├── status.js
    └── multbot.js           # composição da interface e bootstrap
```

## Créditos

- [Sau1707/ModernBot](https://github.com/Sau1707/ModernBot) — projeto-base.
- [Noct](https://grepo-soft.workers.dev) — referência de endpoints e padrões do Grepolis.
