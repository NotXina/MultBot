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
| AutoFarm | Farm | Coleta recursos das aldeias rurais (tick 5s) |
| AutoRuralLevel | Farm | Sobe o nível das aldeias rurais com pontos de batalha |
| AutoRuralTrade | Farm | Troca recursos com aldeias rurais |
| AutoBuild | Build | Constrói edifícios automaticamente (tick 5s, sem ordem de prioridade) |
| AutoGratis | Build | Clica no botão "Grátis" de construção (tick 1s) |
| AutoTrain | Train | Recruta tropas automaticamente (terrestre + naval no mesmo tick) |
| AutoBootcamp | Mix | Ataca o campo de treinamento automaticamente |
| AutoParty | Mix | Inicia e reinicia festas, desfiles e teatros automaticamente |
| AutoHide | Mix | Esconde ferro no cofre automaticamente |

---

## Módulos novos (NotXina)

### 📊 Status (`status.js`) — aba Status
Painel em tempo real com o estado de todos os módulos.
- Atualiza a cada 3 segundos
- Botões de ligar/desligar diretamente no painel
- Mostra contagem de cidades ativas, celebrações em curso e cidade destino dos navios

### 💰 Auto Envio de Recursos (`auto_send_resources.js`) — aba Farm
Envia recursos excedentes de cidades ociosas para a cidade com menor % de storage.
- Verifica a cada 30 minutos
- **Elegível para enviar:** pop < 200 + AutoBuild concluído + mercado ativo + recurso > 50% storage
- **Destino:** cidade do jogador com menor `(wood+stone+iron) / (storage×3)`
- Envia o excedente acima de 50% do storage, balanceado entre os 3 recursos

### 🔬 Auto Pesquisa (`auto_research.js`) — aba Train
Pesquisa automaticamente as próximas tecnologias disponíveis em todas as cidades.
- Verifica a cada 30 segundos
- Mostra ícones das pesquisas com status visual (concluída = esmaecida + borda verde)
- Ordem: Guarda da Cidade → Meteorologia → Espionagem → Lealdade dos Aldeões → Cerâmica → Arquitetura → Guindaste → Construtor Naval → Navio Colonizador → Arado

### ⚔️ Auto Milícia (`auto_militia.js`) — aba Mix
Detecta ataques entrantes e ativa a milícia automaticamente nas cidades afetadas.
- Verifica `MovementsUnits` a cada 15 segundos
- Evita ativação duplicada com controle interno de cidades processadas
- Endpoint: `building_farm / request_militia` (padrão exato do Noct)

### ⚓ Navio Colonizador (`colonize_ship_sender.js`) — aba Ships
Envia `colonize_ship` de todas as cidades automaticamente como apoio para uma cidade destino.
- Configura destino por ID ou `[town]...[/town]`
- Envio paralelo com delay escalonado entre cidades
- Mostra nome da cidade destino

### 🏗 MultTools (`mult_tools.js`) — aba Mult
Ferramentas em massa para todas as cidades.
- **Preset Construções:** nível máximo em todos os edifícios (Quartel → 5, Muro → 0), ativa AutoBuild
- **Preset Naval:** configura máximo de `colonize_ship` em todas as cidades elegíveis via AutoTrain

---

## Melhorias em relação ao ModernBot original

- **AutoBuild** — tick 20s → 5s; tenta construir tudo que for possível sem ordem de prioridade fixa
- **AutoFarm** — tick 1s → 5s, reduz consumo de CPU sem perda de coleta
- **AutoGratis** — tick 2.5s → 1s, não perde mais a janela do botão grátis
- **AutoTrain** — treina terrestres e navais no mesmo tick
- **AutoParty** — mostra contagem compacta de celebrações ativas (festas, teatros, triunfos)

---

## Estrutura do repo

```
MultBot/
├── index.js              ← instalar no Tampermonkey
├── README.md
└── Modules/
    ├── core.js                  ← ModernUtil, BotConsole, Storage, etc
    ├── anti_rage.js
    ├── auto_bootcamp.js
    ├── auto_build.js
    ├── auto_farm.js
    ├── auto_gratis.js
    ├── auto_hide.js
    ├── auto_militia.js          ← novo
    ├── auto_party.js
    ├── auto_research.js         ← novo
    ├── auto_rural_level.js
    ├── auto_rural_trade.js
    ├── auto_send_resources.js   ← novo
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
