# Treinamento do modelo do Robô Auditor — como destravar (modelos de arquivos)

O treinamento está **bloqueado** até haver (1) autorização humana do acervo e (2) rótulos revisados por pessoas. Estes são os modelos dos arquivos que o pipeline local (`node scripts/allocation-auditor-ml.cjs`) espera. **Nada aqui foi preenchido por mim**: autorizar e revisar são decisões de pessoas; um arquivo preenchido pelo robô é recusado.

## 1. `autorizacao.json` — assinada por um responsável humano
```json
{
  "id": "AUT-2026-001",
  "grantedBy": "Nome e cargo de quem autoriza (pessoa, não sistema)",
  "grantedAt": "AAAA-MM-DD",
  "contracts": ["código do contrato autorizado"],
  "scope": ["treino-local"],
  "expiresAt": "AAAA-MM-DD"
}
```
Regras que o código aplica: responsável humano (nomes como "robô", "modelo", "sistema", "regra" são recusados), data válida, ao menos um contrato, escopo `treino-local` (uso **local**, sem envio a serviço externo) e validade não vencida. Eventos de contratos não listados são excluídos.

## 2. `eventos.json` — histórico exportado
Lista de eventos da Central/alocações retornadas pela fiscalização, com, no mínimo: `contract`, `document`, `revision`, `allocation`, `returnedAt` (data), `fiscalDecision` (`recusado` | `aceito-com-ressalvas` | `aceito-sem-comentarios`), `fiscalComment`, `commentFindings` (classificação do motor), e o **estado enviado**: `title`, `ldVersion` (ou `ld`), `workflow`, `databook`, `discipline`, `tag`, `eap`, `levels`. Eventos sem revisão, alocação, data válida, estado prévio ou decisão comprovada são **excluídos com o motivo**; duplicados e rodadas conflitantes são separados.

## 3. `revisoes.json` — rótulos revisados por pessoas
```json
[
  { "eventId": "id do evento (exibido no inventário)", "reviewer": "Nome do revisor técnico", "reviewedAt": "AAAA-MM-DD", "decision": "confirmado" },
  { "eventId": "…", "reviewer": "…", "reviewedAt": "…", "decision": "corrigido", "categories": ["title", "tag"] },
  { "eventId": "…", "reviewer": "…", "reviewedAt": "…", "decision": "rejeitado" }
]
```
Categorias válidas: `title`, `code`, `tag`, `databook`, `hierarchy`, `workflow`, `scope`, `history`. `confirmado` aceita o palpite da regra; `corrigido` substitui pelas categorias do revisor; `rejeitado`/`inconclusivo` ficam fora. **Mínimo configurado: 300 rótulos revisados e 60 casos de teste** (o pipeline informa o motivo se faltar).

## 4. Rodar (local, sem rede)
```bash
node scripts/allocation-auditor-ml.cjs --events eventos.json --authorization autorizacao.json --reviews revisoes.json --out saida --created-by "Nome de quem treina"
```
Grava `TRAINING_STATUS.json` (só contagens e motivos), e, se concluído, `model-card.json`, `evaluation.json` e `model.json`. **Nunca ativa o modelo**: a ativação exige avaliação independente acima dos pontos de partida e **um aprovador humano diferente de quem treinou** (registro de versões, com desligar e reverter).

## 5. O que continua valendo
O modelo só gera **sugestões não normativas**; não cria erro, pendência, proposta, TAG, revisão ou EAP; as regras determinísticas funcionam sem ele; não há aprendizado entre contratos sem autorização explícita por contrato.
