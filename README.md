# MultBot

Fork aprimorado do [ModernBot](https://github.com/Sau1707/ModernBot) para Grepolis, com módulos adicionais e melhorias de performance.

## Instalação

1. Instale o [Tampermonkey](https://www.tampermonkey.net/)
2. Crie um novo script e cole o conteúdo de `index.js`, ou adicione via URL:
   ```
   https://raw.githubusercontent.com/NotXina/MultBot/main/index.js
   ```

---

## Módulos originais (ModernBot)

| Módulo | Aba | Descrição |
|--------|-----|-----------|
| AutoFarm | Farm | Coleta recursos das aldeias rurais automaticamente |
| AutoRuralLevel | Farm | Sobe o nível das aldeias rurais com pontos de batalha |
| AutoRuralTrade | Farm | Troca recursos com aldeias rurais |
| AutoBuild | Build | Constrói edifícios automaticamente (tick a cada 5s) |
| AutoGratis | Build | Clica no botão "Grátis" de construção |
| AutoTrain | Train | Recruta tropas automaticamente (terrestre + naval no mesmo tick) |
| AutoBootcamp | Mix | Ataca o campo de treinamento automaticamente |
| AutoParty | Mix | Inicia festas, desfiles e teatros automaticamente |
| AutoHide | Mix | Esconde ferro no cofre automaticamente |

---

## Módulos novos (NotXina)

### ⚔️ Auto Milícia (`auto_militia.js`) — aba Mix
Detecta ataques entrantes e ativa a milícia automaticamente nas cidades afetadas.
- Verifica `MovementsUnits` a cada 15 segundos
- Ativa apenas em cidades do jogador com ataque entrante
- Evita ativação duplicada com controle interno de cidades processadas
- Endpoint: `building_farm / request_militia` (padrão exato do Noct)
- Persiste estado entre reloads

### ⚓ Navio Colonizador (`colonize_ship_sender.js`) — aba Ships
Envia `colonize_ship` de todas as cidades automaticamente como apoio para uma cidade destino.
- Configura destino por ID ou `[town]...[/town]`
- Envio paralelo com delay escalonado entre cidades
- Intervalo configurável em minutos
- Mostra nome da cidade destino
- Persiste estado entre reloads

### 🏗 MultTools (`mult_tools.js`) — aba Mult
Ferramentas em massa para todas as cidades.
- **Preset Construções**: aplica nível máximo em todos os edifícios (Quartel → 5, Muro → 0), ativa AutoBuild automaticamente
- **Preset Naval**: configura máximo de `colonize_ship` em todas as cidades elegíveis via AutoTrain

### 📊 Status (`status.js`) — aba Status
Painel em tempo real com o estado de todos os módulos.
- Atualiza a cada 3 segundos
- Botões de ligar/desligar diretamente no painel
- Mostra contagem de cidades ativas, celebrações em curso, cidade destino dos navios

---

## Melhorias em relação ao ModernBot original

- **AutoBuild** — tick reduzido de 20s para 5s; constrói tudo que for possível sem ordem de prioridade fixa
- **AutoTrain** — treina terrestres e navais no mesmo tick
- **AutoParty** — mostra contagem de celebrações ativas (festas, teatros, triunfos)
- **Guard de conquista** — todos os módulos pausam automaticamente quando uma cidade está sendo conquistada
- **Lock de `Game.townId`** — evita conflito entre módulos que mudam a cidade ativa

---

## Estrutura do repo

```
MultBot/
├── index.js              ← instalar no Tampermonkey
├── README.md
└── Modules/
    ├── core.js           ← ModernUtil, BotConsole, Storage, etc
    ├── anti_rage.js
    ├── auto_bootcamp.js
    ├── auto_build.js
    ├── auto_farm.js
    ├── auto_gratis.js
    ├── auto_hide.js
    ├── auto_militia.js   ← novo
    ├── auto_party.js
    ├── auto_rural_level.js
    ├── auto_rural_trade.js
    ├── auto_trade.js
    ├── auto_train.js
    ├── colonize_ship_sender.js  ← novo
    ├── mult_tools.js            ← novo
    ├── status.js                ← novo
    └── multbot.js               ← ModernBot class + loader
```

---

## Créditos

- [Sau1707/ModernBot](https://github.com/Sau1707/ModernBot) — base original
- [Noct](https://grepo-soft.workers.dev) — referência de endpoints e padrões do Grepolis
