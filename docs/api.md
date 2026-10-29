# API

Base local: `http://localhost:3000`.

Em desenvolvimento, todas as rotas de projeto exigem `X-Dev-User-Id` com 3 a 64 caracteres `a-z`, `0-9` ou hífen. Sem o cabeçalho a resposta é 401. Recurso de outro usuário responde 404. `GET /health` e `GET /media/...` não usam esse cabeçalho. A mídia usa assinatura na query.

## Vídeos

`POST /videos`

```json
{ "youtubeUrl": "https://www.youtube.com/watch?v=VIDEO", "targetLanguage": "pt-BR" }
```

`targetLanguage` só aceita `pt-BR`. O cabeçalho opcional `Idempotency-Key` precisa ser uma string de 8 a 128 caracteres. A mesma chave e a mesma requisição devolvem o projeto existente. A mesma chave com outro URL ou idioma responde 409.

`GET /videos?limit=20&offset=0`

Lista os projetos do usuário autenticado.

`GET /videos/:videoId`

Detalhe, datas, estado e a limitação de que resumo e chat analisam a fala transcrita, não slides ou imagens.

`GET /videos/:videoId/status`

Estado geral e etapas reais. Não há percentual inventado. `summaryStatus` e `chatStatus` podem ser `pending`, `ready`, `failed` ou `unavailable`.

`GET /videos/:videoId/playback`

Quando `playbackReady` é verdadeiro, devolve `videoUrl`, `videoContentType` (`video/mp4`), a trilha WebVTT e `expiresAt`. As URLs apontam para `/media/...` e expiram com `PRESIGN_TTL_SECONDS` (900 por padrão).

`GET /videos/:videoId/subtitles/vtt` e `GET /videos/:videoId/subtitles/srt`

Devolvem a URL temporária do arquivo. O conteúdo é servido em UTF-8.

`GET /videos/:videoId/summary`

503 com `summary_unavailable` quando o modelo não está configurado. 409 enquanto ainda está pendente. 502 se a geração falhou.

`POST /videos/:videoId/exports`

Pede o MP4 com legendas gravadas. Se o arquivo da mesma versão já existe, responde `ready` sem renderizar de novo.

`GET /videos/:videoId/exports/:exportId`

Enquanto a renderização não termina, `status` acompanha a tarefa. Quando termina, `status` é `ready` e `url` é a URL temporária.

`POST /videos/:videoId/retries`

```json
{ "stage": "translate" }
```

Etapas permitidas: `translate`, `summarize`, `index`, `render`. Só uma etapa com falha pode ser repetida.

`POST /videos/:videoId/events`

```json
{ "eventType": "timestamp.clicked" }
```

Registra uso sem gravar a transcrição.

`DELETE /videos/:videoId`

Marca a exclusão, cancela o subprocesso em execução e enfileira a limpeza. Depois da exclusão, o detalhe responde 404.

## Mídia

`GET /media/:videoId/:kind?user=&expires=&signature=`

Kinds: `playback_mp4`, `subtitles_vtt`, `subtitles_srt`, `burned_mp4`.

A assinatura é HMAC-SHA256 de `userId:videoId:kind:expires`. Assinatura inválida ou expirada responde 403. Dono diferente, vídeo excluído ou artefato ausente responde 404.

A resposta envia `Accept-Ranges: bytes`, o MIME do artefato e `Content-Range` quando o cliente pede `Range`. A origem local `localhost` e `127.0.0.1` são aceitas em desenvolvimento. Em produção vale somente `WEB_ORIGIN`.

## Conversas

`POST /videos/:videoId/conversations`

Cria ou reabre a conversa do dono. 503 com `chat_unavailable` quando a indexação não está pronta ou o modelo não foi configurado.

`GET /conversations/:conversationId/messages`

`POST /conversations/:conversationId/messages`

```json
{ "content": "pergunta", "clientMessageId": "id-unico-do-cliente" }
```

A resposta é `text/event-stream`, com eventos `token`, `done` e `error`. O mesmo `clientMessageId` de uma mensagem já concluída reenvia o resultado persistido e não gera outra resposta. A recuperação de trechos filtra pelo projeto e pelo dono. Os timestamps são resolvidos no servidor a partir dos IDs de segmento.

## Saúde

`GET /health` responde `{ "status": "ok" }`.
